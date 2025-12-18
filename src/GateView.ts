import { ItemView, WorkspaceLeaf, Menu, Notice, MarkdownView, setIcon, ButtonComponent, TextComponent, DropdownComponent, TFile } from 'obsidian'
import { createWebviewTag } from './fns/createWebviewTag'
import { Platform } from 'obsidian'
import { createIframe } from './fns/createIframe'
import { clipboard } from 'electron'
import WebviewTag = Electron.WebviewTag
import { GateFrameOption } from './GateOptions'
import OpenGatePlugin from './main'
import { GatePopupModal } from './GatePopupModal'
import { normalizeGateOption } from './fns/normalizeGateOption'
// AI & Clipping imports
import { ClipDropdown, createClipButton, AIDropdown, createAIButton, showSuccess, showError, showLoading } from './ui'
import { ClipService, initializeClipService, getClipService, ContentExtractor } from './clipping'
import { getAIService } from './ai'
import { AnalysisModal, ProcessModal, MultiSourceAnalysisModal, AnalysisConfig } from './modals'
import { ClipData, MultiSourceAnalysisRequest, SourceItem } from './ai/types'

export class GateView extends ItemView {
    private readonly options: GateFrameOption
    private frame: WebviewTag | HTMLIFrameElement
    private readonly useIframe: boolean = false
    private frameReadyCallbacks: Function[]
    private isFrameReady: boolean = false
    private frameDoc: Document
    private plugin: OpenGatePlugin
    private topBarEl: HTMLElement
    private insertMode: 'cursor' | 'bottom' | 'new' = 'cursor'
    // 현재 활성화된 게이트 상태 추적 (readonly options 대신 사용)
    private currentGateState: { id: string; url: string; title: string }
    // AI & Clipping
    private clipDropdown: ClipDropdown | null = null
    private aiDropdown: AIDropdown | null = null
    private clipService: ClipService | null = null

    constructor(leaf: WorkspaceLeaf, options: GateFrameOption, plugin: OpenGatePlugin) {
        super(leaf)
        this.navigation = false
        this.options = options
        this.plugin = plugin
        this.useIframe = Platform.isMobileApp
        this.frameReadyCallbacks = []
        // 초기 상태 설정
        this.currentGateState = { id: options.id, url: options.url, title: options.title }

        // ClipService 초기화 (Desktop only)
        if (!this.useIframe) {
            this.clipService = getClipService() || initializeClipService({
                vault: this.app.vault,
                settings: this.plugin.settings.clipping
            })
        }
    }

    addActions(): void {
        this.addAction('refresh-ccw', 'Reload', () => {
            if (this.frame instanceof HTMLIFrameElement) {
                this.frame.contentWindow?.location.reload()
            } else {
                this.frame.reload()
            }
        })

        this.addAction('home', 'Home page', () => {
            this.navigateTo(this.options?.url ?? 'about:blank')
        })
    }

    isWebviewFrame(): boolean {
        return this.frame! instanceof HTMLIFrameElement
    }

    onload(): void {
        super.onload()
        this.addActions()

        this.contentEl.empty()
        this.contentEl.addClass('open-gate-view')

        // Initialize AI & Clipping dropdowns FIRST (Desktop only)
        // Must be done BEFORE drawTopBar() so buttons can be created
        if (!this.useIframe) {
            this.initializeDropdowns()
        }

        // Create Top Bar (Tabs + Controls) - uses dropdowns for buttons
        this.drawTopBar()

        this.frameDoc = this.contentEl.doc
        this.createFrame()
    }

    /**
     * Initialize ClipDropdown and AIDropdown instances
     */
    private initializeDropdowns(): void {
        // Initialize Clip Dropdown
        this.clipDropdown = new ClipDropdown({
            app: this.app,
            settings: this.plugin.settings.clipping,
            onClipPage: () => this.handleClipPage(),
            onClipSelection: () => this.handleClipSelection(),
            onClipToNote: (file: TFile) => this.handleClipToNote(file),
            onOpenSettings: () => this.openClipSettings()
        })

        // Initialize AI Dropdown
        this.aiDropdown = new AIDropdown({
            app: this.app,
            settings: this.plugin.settings.ai,
            savedPrompts: this.plugin.settings.savedPrompts || [],
            onAISummary: () => this.handleAISummary(),
            onAIWithTemplate: (templateId: string) => this.handleAIWithTemplate(templateId),
            onAIWithPrompt: (prompt: string) => this.handleAIWithPrompt(prompt),
            onAISelection: () => this.handleAISelection(),
            onOpenAnalysisModal: (templateId?: string) => this.openAnalysisModal(templateId),
            onOpenMultiSourceModal: () => this.openMultiSourceModal(),
            onOpenSettings: () => this.openAISettings()
        })
    }

    // ============================================
    // Clipping Handler Methods
    // ============================================

    /**
     * 전체 페이지 원클릭 클리핑
     */
    private async handleClipPage(): Promise<void> {
        if (this.useIframe || !this.clipService) {
            showError('Desktop 환경에서만 클리핑이 가능합니다.')
            return
        }

        const loading = showLoading('페이지 클리핑 중...')

        try {
            const result = await this.clipService.clipPage(
                this.frame as WebviewTag,
                this.currentGateState.id
            )

            loading.hide()

            if (result.success && result.note) {
                showSuccess(`클리핑 완료: ${result.note.path}`)
            } else {
                showError(result.error || '클리핑 실패')
            }
        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`클리핑 오류: ${errorMessage}`)
        }
    }

    /**
     * 선택 텍스트 클리핑
     */
    private async handleClipSelection(): Promise<void> {
        if (this.useIframe || !this.clipService) {
            showError('Desktop 환경에서만 클리핑이 가능합니다.')
            return
        }

        const loading = showLoading('선택 텍스트 클리핑 중...')

        try {
            const result = await this.clipService.clipSelection(
                this.frame as WebviewTag,
                this.currentGateState.id
            )

            loading.hide()

            if (result.success && result.note) {
                showSuccess(`클리핑 완료: ${result.note.path}`)
            } else {
                showError(result.error || '선택된 텍스트가 없습니다.')
            }
        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`클리핑 오류: ${errorMessage}`)
        }
    }

    /**
     * 기존 노트에 클리핑 추가
     */
    private async handleClipToNote(targetFile: TFile): Promise<void> {
        if (this.useIframe || !this.clipService) {
            showError('Desktop 환경에서만 클리핑이 가능합니다.')
            return
        }

        const loading = showLoading(`${targetFile.basename}에 추가 중...`)

        try {
            const result = await this.clipService.clipToNote(
                this.frame as WebviewTag,
                this.currentGateState.id,
                targetFile
            )

            loading.hide()

            if (result.success) {
                showSuccess(`클리핑이 ${targetFile.basename}에 추가되었습니다.`)
            } else {
                showError(result.error || '클리핑 추가 실패')
            }
        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`클리핑 오류: ${errorMessage}`)
        }
    }

    /**
     * 클리핑 설정 열기
     */
    private openClipSettings(): void {
        // 설정 탭 열기 (Obsidian 기본 API 사용)
        // @ts-ignore - Obsidian 내부 API
        this.app.setting?.open()
        // @ts-ignore
        this.app.setting?.openTabById?.(this.plugin.manifest.id)
    }

    // ============================================
    // AI Handler Methods
    // ============================================

    /**
     * 페이지 AI 요약 (원클릭)
     */
    private async handleAISummary(): Promise<void> {
        if (this.useIframe) {
            showError('Desktop 환경에서만 AI 기능이 가능합니다.')
            return
        }

        const aiService = getAIService()
        if (!aiService) {
            showError('AI 서비스가 초기화되지 않았습니다.')
            return
        }

        if (!aiService.isProviderConfigured(this.plugin.settings.ai.provider)) {
            showError('API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.')
            return
        }

        const loading = showLoading('AI 요약 생성 중...')

        try {
            // 콘텐츠 추출
            const { ContentExtractor } = await import('./clipping')
            const content = await ContentExtractor.extractPageContent(this.frame as WebviewTag)

            if (!content) {
                loading.hide()
                showError('페이지 콘텐츠를 추출할 수 없습니다.')
                return
            }

            // AI 요약 생성
            const response = await aiService.summarizeContent(
                content.textContent,
                this.plugin.settings.ai.defaultLanguage
            )

            loading.hide()

            if (response.success) {
                // 요약 결과를 새 노트로 생성 (YAML frontmatter 포함)
                const timestamp = new Date().toISOString().split('T')[0]
                const currentUrl = await ContentExtractor.getCurrentUrl(this.frame as WebviewTag)
                const fileName = `AI 요약 - ${content.title || 'Untitled'} - ${timestamp}.md`

                // YAML frontmatter가 포함된 노트 내용 생성
                const noteContent = `---
title: "${content.title || 'AI 요약'}"
source: "${currentUrl}"
created: ${timestamp}
type: ai-summary
provider: ${this.plugin.settings.ai.provider}
site: "${content.siteName || ''}"
tags:
  - ai-summary
  - easy-gate
---

# ${content.title || 'AI 요약'}

> 🔗 원본: [${currentUrl}](${currentUrl})
> 🤖 분석: ${this.plugin.settings.ai.provider}
> 📅 생성: ${timestamp}

---

${response.content}

---

## 원본 정보

- **제목**: ${content.title || 'Untitled'}
- **URL**: ${currentUrl}
- **사이트**: ${content.siteName || 'Unknown'}
`

                const file = await this.app.vault.create(fileName, noteContent)
                await this.app.workspace.getLeaf('tab').openFile(file)
                showSuccess('AI 요약이 생성되었습니다.')
            } else {
                showError(response.error || 'AI 요약 생성 실패')
            }
        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`AI 오류: ${errorMessage}`)
        }
    }

    /**
     * 템플릿 기반 AI 처리
     */
    private async handleAIWithTemplate(templateId: string): Promise<void> {
        if (this.useIframe) {
            showError('Desktop 환경에서만 AI 기능이 가능합니다.')
            return
        }

        const aiService = getAIService()
        if (!aiService || !aiService.isProviderConfigured(this.plugin.settings.ai.provider)) {
            showError('API 키가 설정되지 않았습니다.')
            return
        }

        const loading = showLoading('콘텐츠 추출 중...')

        try {
            // 콘텐츠 추출
            const content = await ContentExtractor.extractPageContent(this.frame as WebviewTag)
            const url = await ContentExtractor.getCurrentUrl(this.frame as WebviewTag)

            loading.hide()

            if (!content) {
                showError('페이지 콘텐츠를 추출할 수 없습니다.')
                return
            }

            // ClipData 생성
            const clipData: ClipData = {
                id: `template-${Date.now()}`,
                url: url,
                title: content.title || 'Untitled',
                content: content.textContent,
                metadata: {
                    siteName: content.siteName
                },
                clippedAt: new Date().toISOString(),
                gateId: this.currentGateState.id
            }

            // 바로 ProcessModal로 처리 (템플릿 선택된 상태)
            const config: AnalysisConfig = {
                templateId: templateId,
                customPrompt: null,
                provider: this.plugin.settings.ai.provider,
                includeMetadata: true,
                outputFormat: 'markdown',
                language: this.plugin.settings.ai.defaultLanguage || 'ko'
            }

            await this.runAnalysis(clipData, config)

        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`템플릿 처리 오류: ${errorMessage}`)
        }
    }

    /**
     * 커스텀 프롬프트로 AI 처리
     */
    private async handleAIWithPrompt(prompt: string): Promise<void> {
        if (this.useIframe) {
            showError('Desktop 환경에서만 AI 기능이 가능합니다.')
            return
        }

        const aiService = getAIService()
        if (!aiService) {
            showError('AI 서비스가 초기화되지 않았습니다.')
            return
        }

        const loading = showLoading('AI 처리 중...')

        try {
            const { ContentExtractor } = await import('./clipping')
            const content = await ContentExtractor.extractPageContent(this.frame as WebviewTag)

            if (!content) {
                loading.hide()
                showError('페이지 콘텐츠를 추출할 수 없습니다.')
                return
            }

            const response = await aiService.simpleGenerate(
                `${prompt}\n\n콘텐츠:\n${content.textContent}`,
                `당신은 웹 콘텐츠 분석 전문가입니다. 항상 ${this.plugin.settings.ai.defaultLanguage}로 응답하세요.`
            )

            loading.hide()

            if (response.success) {
                const timestamp = new Date().toISOString().split('T')[0]
                const currentUrl = await ContentExtractor.getCurrentUrl(this.frame as WebviewTag)
                const fileName = `AI 분석 - ${content.title || 'Untitled'} - ${timestamp}.md`

                // YAML frontmatter가 포함된 노트 내용 생성
                const noteContent = `---
title: "${content.title || 'AI 분석'}"
source: "${currentUrl}"
created: ${timestamp}
type: ai-analysis
provider: ${this.plugin.settings.ai.provider}
site: "${content.siteName || ''}"
prompt: "${prompt.replace(/"/g, '\\"').substring(0, 100)}..."
tags:
  - ai-analysis
  - easy-gate
  - custom-prompt
---

# ${content.title || 'AI 분석'}

> 🔗 원본: [${currentUrl}](${currentUrl})
> 🤖 분석: ${this.plugin.settings.ai.provider}
> 📅 생성: ${timestamp}

---

**프롬프트:** ${prompt}

---

${response.content}

---

## 원본 정보

- **제목**: ${content.title || 'Untitled'}
- **URL**: ${currentUrl}
- **사이트**: ${content.siteName || 'Unknown'}
`

                const file = await this.app.vault.create(fileName, noteContent)
                await this.app.workspace.getLeaf('tab').openFile(file)
                showSuccess('AI 분석이 완료되었습니다.')
            } else {
                showError(response.error || 'AI 처리 실패')
            }
        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`AI 오류: ${errorMessage}`)
        }
    }

    /**
     * 선택 텍스트 AI 처리
     */
    private async handleAISelection(): Promise<void> {
        if (this.useIframe) {
            showError('Desktop 환경에서만 AI 기능이 가능합니다.')
            return
        }

        const aiService = getAIService()
        if (!aiService) {
            showError('AI 서비스가 초기화되지 않았습니다.')
            return
        }

        try {
            const { ContentExtractor } = await import('./clipping')
            const selection = await ContentExtractor.extractSelection(this.frame as WebviewTag)

            if (!selection || !selection.hasSelection) {
                showError('선택된 텍스트가 없습니다.')
                return
            }

            const loading = showLoading('선택 텍스트 AI 처리 중...')

            const response = await aiService.summarizeContent(
                selection.text,
                this.plugin.settings.ai.defaultLanguage
            )

            loading.hide()

            if (response.success) {
                new Notice(`AI 분석 결과:\n${response.content.substring(0, 200)}...`, 10000)
            } else {
                showError(response.error || 'AI 처리 실패')
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`AI 오류: ${errorMessage}`)
        }
    }

    /**
     * 분석 모달 열기
     * @param templateId 초기 선택할 템플릿 ID (선택사항)
     */
    private async openAnalysisModal(templateId?: string): Promise<void> {
        if (this.useIframe) {
            showError('Desktop 환경에서만 분석 기능이 가능합니다.')
            return
        }

        const loading = showLoading('콘텐츠 추출 중...')

        try {
            // 선택된 텍스트 먼저 확인
            let selectedText = ''
            try {
                const selection = await ContentExtractor.extractSelection(this.frame as WebviewTag)
                if (selection && selection.hasSelection && selection.text) {
                    selectedText = selection.text
                }
            } catch (e) {
                // 선택 텍스트 추출 실패는 무시
            }

            // 페이지 콘텐츠 추출
            const content = await ContentExtractor.extractPageContent(this.frame as WebviewTag)
            const url = await ContentExtractor.getCurrentUrl(this.frame as WebviewTag)

            loading.hide()

            if (!content) {
                showError('페이지 콘텐츠를 추출할 수 없습니다.')
                return
            }

            // ClipData 생성
            const clipData: ClipData = {
                id: `analysis-${Date.now()}`,
                url: url,
                title: content.title || 'Untitled',
                content: content.textContent,
                metadata: {
                    siteName: content.siteName
                },
                clippedAt: new Date().toISOString(),
                gateId: this.currentGateState.id
            }

            // AnalysisModal 열기 (선택된 텍스트와 템플릿 ID 전달)
            const modal = new AnalysisModal({
                app: this.app,
                settings: this.plugin.settings.ai,
                savedPrompts: this.plugin.settings.savedPrompts || [],
                clipData: clipData,
                initialText: selectedText, // 선택된 텍스트 전달
                initialTemplateId: templateId, // 초기 템플릿 전달
                onAnalyze: async (config: AnalysisConfig, editedContent: string) => {
                    // 편집된 콘텐츠로 clipData 업데이트
                    const updatedClipData = { ...clipData, content: editedContent }
                    await this.runAnalysis(updatedClipData, config)
                },
                onSavePrompt: (prompt) => {
                    this.savePromptToSettings(prompt)
                }
            })
            modal.open()

        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`분석 모달 오류: ${errorMessage}`)
        }
    }

    /**
     * AI 분석 실행 (ProcessModal과 함께)
     */
    private async runAnalysis(clipData: ClipData, config: AnalysisConfig): Promise<void> {
        const processModal = new ProcessModal({
            app: this.app,
            clipData: clipData,
            config: config,
            onSave: async (content: string, title: string) => {
                return await this.saveAnalysisResult(content, title)
            }
        })
        processModal.open()
    }

    /**
     * 분석 결과 저장
     */
    private async saveAnalysisResult(content: string, title: string): Promise<TFile | null> {
        try {
            const aiSettings = this.plugin.settings.ai
            const folderPath = aiSettings.aiNotesFolder || 'AI-Notes'
            const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '-')
            const fileName = `${sanitizedTitle}.md`
            const filePath = `${folderPath}/${fileName}`

            // 폴더가 없으면 생성
            const folder = this.app.vault.getAbstractFileByPath(folderPath)
            if (!folder) {
                await this.app.vault.createFolder(folderPath)
            }

            // 파일 생성
            const file = await this.app.vault.create(filePath, content)

            // 자동 열기 설정이 활성화되어 있으면 노트 열기
            if (aiSettings.autoOpenNote !== false) {
                await this.app.workspace.getLeaf('tab').openFile(file)
            }

            showSuccess(`노트 저장 완료: ${filePath}`)
            return file
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '저장 실패'
            showError(errorMessage)
            return null
        }
    }

    /**
     * 멀티 소스 분석 모달 열기
     */
    private async openMultiSourceModal(): Promise<void> {
        const loading = showLoading('멀티 소스 분석 준비 중...')

        try {
            // 현재 페이지 정보를 초기 소스로 추가
            let initialClip: ClipData | undefined

            if (!this.useIframe) {
                try {
                    const content = await ContentExtractor.extractPageContent(this.frame as WebviewTag)
                    const url = await ContentExtractor.getCurrentUrl(this.frame as WebviewTag)

                    if (content && content.textContent && content.textContent.trim().length > 0) {
                        initialClip = {
                            id: `multi-source-${Date.now()}`,
                            url: url,
                            title: content.title || this.options.title || 'Untitled',
                            content: content.textContent,
                            metadata: {
                                siteName: content.siteName || this.extractSiteName(url)
                            },
                            clippedAt: new Date().toISOString(),
                            gateId: this.currentGateState.id
                        }
                    }
                } catch (e) {
                    console.log('[MultiSource] 현재 페이지 콘텐츠 추출 실패:', e)
                }
            }

            loading.hide()

            const modal = new MultiSourceAnalysisModal({
                app: this.app,
                settings: this.plugin.settings.ai,
                initialClip: initialClip,
                onAnalyze: async (request: MultiSourceAnalysisRequest) => {
                    await this.runMultiSourceAnalysis(request)
                }
            })
            modal.open()

        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
            showError(`멀티 소스 분석 오류: ${errorMessage}`)
        }
    }

    /**
     * 사이트 이름 추출
     */
    private extractSiteName(url: string): string {
        try {
            const urlObj = new URL(url)
            let hostname = urlObj.hostname.replace(/^www\./, '')
            // 주요 사이트 이름 매핑
            const siteNames: Record<string, string> = {
                'youtube.com': 'YouTube',
                'github.com': 'GitHub',
                'twitter.com': 'Twitter',
                'x.com': 'X (Twitter)',
                'reddit.com': 'Reddit',
                'medium.com': 'Medium',
                'notion.so': 'Notion',
                'naver.com': 'Naver',
                'tistory.com': 'Tistory',
                'velog.io': 'Velog',
                'brunch.co.kr': 'Brunch',
                'google.com': 'Google',
                'docs.google.com': 'Google Docs',
                'wikipedia.org': 'Wikipedia'
            }
            return siteNames[hostname] || hostname
        } catch {
            return 'Unknown'
        }
    }

    /**
     * 멀티 소스 AI 분석 실행
     */
    private async runMultiSourceAnalysis(request: MultiSourceAnalysisRequest): Promise<void> {
        const loading = showLoading('멀티 소스 분석 중...')

        try {
            const aiSettings = this.plugin.settings.ai
            const provider = aiSettings.provider
            const apiKey = aiSettings.apiKeys[provider]

            if (!apiKey) {
                throw new Error(`${provider} API 키가 설정되지 않았습니다.`)
            }

            // 소스들을 결합하여 컨텍스트 생성
            const sourcesContext = request.sources.map((source: SourceItem, index: number) => {
                const sourceInfo = `[소스 ${index + 1}] ${source.title}
타입: ${source.type === 'web-clip' ? '웹 클리핑' : source.type === 'obsidian-note' ? '옵시디언 노트' : source.type === 'selection' ? '선택 텍스트' : '직접 입력'}
${source.metadata.url ? `URL: ${source.metadata.url}` : ''}
${source.metadata.filePath ? `파일: ${source.metadata.filePath}` : ''}
글자 수: ${source.metadata.charCount}자

내용:
${source.content}
`
                return sourceInfo
            }).join('\n---\n\n')

            // 분석 타입에 따른 기본 프롬프트
            const analysisTypePrompts: Record<string, string> = {
                'synthesis': '여러 소스의 정보를 종합하여 통합된 관점을 제시해주세요. 공통점, 핵심 인사이트, 그리고 새로운 통찰을 도출해주세요.',
                'comparison': '각 소스의 관점을 비교 분석해주세요. 유사점과 차이점, 각각의 강점과 약점을 분석해주세요.',
                'summary': '모든 소스의 핵심 내용을 간결하게 요약해주세요. 주요 포인트와 결론을 정리해주세요.',
                'custom': ''
            }

            const basePrompt = analysisTypePrompts[request.analysisType] || ''
            const fullPrompt = request.customPrompt
                ? `${request.customPrompt}\n\n${basePrompt}`
                : basePrompt

            const systemPrompt = `당신은 다중 소스 분석 전문가입니다. 여러 출처의 정보를 분석하고 통합하는 역할을 합니다.

분석 시 다음 사항을 고려하세요:
1. 각 소스의 신뢰성과 관점을 평가
2. 소스 간의 관계와 상호 보완성 파악
3. 핵심 인사이트와 패턴 도출
4. 명확하고 구조화된 분석 결과 제공

출력 형식: 마크다운
언어: ${request.language || 'ko'}
${request.includeSourceReferences ? '각 인용이나 정보에 출처를 명시해주세요.' : ''}`

            const userPrompt = `${fullPrompt}

=== 분석할 소스들 (${request.sources.length}개) ===

${sourcesContext}

=== 분석 요청 ===
위의 ${request.sources.length}개 소스를 종합적으로 분석해주세요.`

            // AI API 호출
            const result = await this.callMultiSourceAI(provider, apiKey, systemPrompt, userPrompt)

            loading.hide()

            // 결과를 노트로 저장
            const sourceRefs = request.sources.map((s: SourceItem) => {
                if (s.metadata.url) {
                    return `- [${s.title}](${s.metadata.url})`
                } else if (s.metadata.filePath) {
                    return `- [[${s.metadata.filePath}|${s.title}]]`
                }
                return `- ${s.title}`
            }).join('\n')

            const analysisTypeNames: Record<string, string> = {
                'synthesis': '종합 분석',
                'comparison': '비교 분석',
                'summary': '요약',
                'custom': '커스텀 분석'
            }

            const noteContent = `---
type: multi-source-analysis
analysis-type: ${request.analysisType}
sources-count: ${request.sources.length}
total-chars: ${request.sources.reduce((acc: number, s: SourceItem) => acc + s.metadata.charCount, 0)}
provider: ${provider}
created: ${new Date().toISOString()}
---

# 멀티 소스 ${analysisTypeNames[request.analysisType]}

## 분석 개요
- **분석 유형**: ${analysisTypeNames[request.analysisType]}
- **소스 수**: ${request.sources.length}개
- **총 분석 문자 수**: ${request.sources.reduce((acc: number, s: SourceItem) => acc + s.metadata.charCount, 0).toLocaleString()}자
- **AI 모델**: ${provider}
- **분석 일시**: ${new Date().toLocaleString('ko-KR')}

## 분석 결과

${result}

## 분석에 사용된 소스

${sourceRefs}

---
*이 분석은 Easy Gate 멀티 소스 분석 기능으로 생성되었습니다.*
`

            const title = `멀티소스_${analysisTypeNames[request.analysisType]}_${new Date().toISOString().split('T')[0]}`
            await this.saveAnalysisResult(noteContent, title)

        } catch (error) {
            loading.hide()
            const errorMessage = error instanceof Error ? error.message : '분석 실패'
            showError(`멀티 소스 분석 오류: ${errorMessage}`)
        }
    }

    /**
     * 멀티 소스 AI API 호출
     */
    private async callMultiSourceAI(
        provider: string,
        apiKey: string,
        systemPrompt: string,
        userPrompt: string
    ): Promise<string> {
        const endpoints: Record<string, string> = {
            'gemini': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            'grok': 'https://api.x.ai/v1/chat/completions',
            'claude': 'https://api.anthropic.com/v1/messages',
            'openai': 'https://api.openai.com/v1/chat/completions',
            'glm': 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
        }

        const endpoint = endpoints[provider]
        if (!endpoint) {
            throw new Error(`지원하지 않는 AI 제공자: ${provider}`)
        }

        // 기본 설정값
        const temperature = 0.7
        const maxTokens = 8192

        let response: Response
        let result: string

        switch (provider) {
            case 'gemini':
                response = await fetch(`${endpoint}?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                        generationConfig: {
                            temperature: temperature,
                            maxOutputTokens: maxTokens
                        }
                    })
                })
                const geminiData = await response.json()
                result = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
                break

            case 'grok':
            case 'openai':
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: provider === 'grok' ? 'grok-3-latest' : 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: temperature,
                        max_tokens: maxTokens
                    })
                })
                const openaiData = await response.json()
                result = openaiData.choices?.[0]?.message?.content || ''
                break

            case 'claude':
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-20250514',
                        max_tokens: maxTokens,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: userPrompt }]
                    })
                })
                const claudeData = await response.json()
                result = claudeData.content?.[0]?.text || ''
                break

            case 'glm':
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: 'glm-4-flash',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: temperature,
                        max_tokens: maxTokens
                    })
                })
                const glmData = await response.json()
                result = glmData.choices?.[0]?.message?.content || ''
                break

            default:
                throw new Error(`지원하지 않는 AI 제공자: ${provider}`)
        }

        if (!result) {
            throw new Error('AI 응답을 받지 못했습니다.')
        }

        return result
    }

    /**
     * 프롬프트를 설정에 저장
     */
    private async savePromptToSettings(prompt: { id: string; name: string; prompt: string; createdAt?: string }): Promise<void> {
        if (!this.plugin.settings.savedPrompts) {
            this.plugin.settings.savedPrompts = []
        }
        this.plugin.settings.savedPrompts.push(prompt)
        await this.plugin.saveSettings()

        // AIDropdown 업데이트
        if (this.aiDropdown) {
            this.aiDropdown.updateSettings(
                this.plugin.settings.ai,
                this.plugin.settings.savedPrompts
            )
        }
    }

    /**
     * AI 설정 열기
     */
    private openAISettings(): void {
        // 설정 탭 열기
        // @ts-ignore - Obsidian 내부 API
        this.app.setting?.open()
        // @ts-ignore
        this.app.setting?.openTabById?.(this.plugin.manifest.id)
    }

    private drawTopBar(): void {
        this.topBarEl = this.contentEl.createDiv({ cls: 'gate-top-bar' });

        // 1. Tab Bar (Gate Switcher)
        const tabBar = this.topBarEl.createDiv({ cls: 'gate-tab-bar' });
        this.renderTabBar(tabBar);

        // 2. Control Row (Address + Actions)
        const controlRow = this.topBarEl.createDiv({ cls: 'gate-control-row' });

        // Navigation Buttons
        new ButtonComponent(controlRow)
            .setIcon('arrow-left')
            .setTooltip('Back')
            .onClick(() => {
                if (!this.useIframe && (this.frame as WebviewTag).canGoBack()) {
                    (this.frame as WebviewTag).goBack();
                }
            });

        new ButtonComponent(controlRow)
            .setIcon('arrow-right')
            .setTooltip('Forward')
            .onClick(() => {
                if (!this.useIframe && (this.frame as WebviewTag).canGoForward()) {
                    (this.frame as WebviewTag).goForward();
                }
            });

        // Address Bar
        const addressInput = new TextComponent(controlRow);
        addressInput.setPlaceholder('https://...');
        addressInput.inputEl.addClass('gate-address-input');
        addressInput.setValue(this.options.url);
        addressInput.inputEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const url = addressInput.getValue();
                if (url) {
                    await this.handleAddressEnter(url);
                }
            }
        });

        // Current URL Listener to update address bar
        this.onFrameReady(() => {
            if (!this.useIframe) {
                (this.frame as WebviewTag).addEventListener('did-navigate', (e) => {
                    addressInput.setValue(e.url);
                });
                (this.frame as WebviewTag).addEventListener('did-navigate-in-page', (e) => {
                    addressInput.setValue(e.url);
                });
            }
        });

        // Tools Divider
        controlRow.createSpan({ cls: 'gate-divider' });

        // Insert To Dropdown
        const drop = new DropdownComponent(controlRow);
        drop.addOption('cursor', 'Insert to: Cursor');
        drop.addOption('bottom', 'Insert to: Bottom');
        drop.addOption('new', 'Insert to: New Note');
        drop.setValue('cursor');
        drop.onChange((val) => this.insertMode = val as any);

        // Apply Button
        new ButtonComponent(controlRow)
            .setIcon('download')
            .setTooltip('Apply Selection')
            .setButtonText('Apply')
            .onClick(() => this.onApplyText());

        // Smart Buttons (Desktop only) - 📋 Clip, 🤖 AI
        if (!this.useIframe) {
            // Divider before smart buttons
            controlRow.createSpan({ cls: 'gate-divider' });

            // 📋 Clip Button with dropdown
            if (this.clipDropdown) {
                createClipButton(
                    controlRow,
                    this.clipDropdown,
                    () => this.handleClipPage()
                )
            }

            // 🤖 AI Button with dropdown
            if (this.aiDropdown) {
                const aiService = getAIService()
                const hasApiKey = aiService?.isProviderConfigured(this.plugin.settings.ai.provider) ?? false

                createAIButton(
                    controlRow,
                    this.aiDropdown,
                    () => this.openAnalysisModal(), // 분석 모달 열기로 변경
                    hasApiKey
                )
            }
        }
    }

    private renderTabBar(container: HTMLElement) {
        container.empty();
        const gates = this.plugin.settings.gates;

        for (const id in gates) {
            const gate = gates[id];
            const tab = container.createDiv({ cls: 'gate-tab' });
            // currentGateState를 사용하여 활성 탭 표시 (readonly options 수정 방지)
            if (gate.id === this.currentGateState.id) tab.addClass('active');

            // Icon
            const iconContainer = tab.createSpan({ cls: 'gate-tab-icon' });
            setIcon(iconContainer, gate.icon || 'globe');

            // Title
            tab.createSpan({ text: gate.title, cls: 'gate-tab-title' });

            // Close button (X) - 각 탭에 삭제 버튼 추가
            const closeBtn = tab.createSpan({ cls: 'gate-tab-close' });
            setIcon(closeBtn, 'x');
            closeBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 탭 클릭 이벤트 전파 방지
                const confirmDelete = confirm(`"${gate.title}" 게이트를 삭제하시겠습니까?`);
                if (confirmDelete) {
                    await this.plugin.removeGate(gate.id);
                    this.renderTabBar(container);
                    new Notice(`"${gate.title}" 게이트가 삭제되었습니다.`);
                }
            });

            tab.addEventListener('click', () => {
                this.navigateTo(gate.url);
                // currentGateState 업데이트 (readonly options 대신)
                this.currentGateState.url = gate.url;
                this.currentGateState.id = gate.id;
                this.currentGateState.title = gate.title;
                this.renderTabBar(container); // Re-render to update active state
            });
        }
    }

    async handleAddressEnter(url: string) {
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        // Check if exists
        const existing = this.plugin.findGateBy('url', url);
        if (existing) {
            this.navigateTo(existing.url);
            new Notice(`Switched to ${existing.title}`);
        } else {
            // Create New Gate
            const domain = new URL(url).hostname;
            const newGate = normalizeGateOption({
                id: Math.random().toString(36).substring(2, 15),
                title: domain,
                url: url,
                icon: 'globe'
            });
            // We need to cast id as string if normalize expects it.

            // Actually generateUuid is private in main.ts. 
            // Ideally we expose it or Duplicate logic.
            newGate.id = Math.random().toString(36).substring(2, 10);

            await this.plugin.addGate(newGate);
            new Notice(`New Gate Created: ${domain}`);

            // Refresh Tab bar
            const bar = this.topBarEl.querySelector('.gate-tab-bar') as HTMLElement;
            if (bar) this.renderTabBar(bar);

            this.navigateTo(url);
        }
    }

    navigateTo(url: string) {
        if (this.frame instanceof HTMLIFrameElement) {
            this.frame.src = url;
        } else {
            this.frame.loadURL(url);
        }
    }

    async onApplyText() {
        let text = '';
        if (this.frame instanceof HTMLIFrameElement) {
            // Cannot easily get selection from cross-origin iframe
            new Notice("Cannot extract text from IFrame mode (Mobile/Restricted).");
            return;
        } else {
            try {
                text = await (this.frame as WebviewTag).executeJavaScript('window.getSelection().toString()');
            } catch (e) {
                console.error(e);
            }
        }

        if (!text || text.trim() === '') {
            new Notice('No text selected in the browser.');
            return;
        }

        // 마크다운 위계 적용: 선택된 텍스트를 정리된 형태로 변환
        const formattedText = this.formatTextAsMarkdown(text);

        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

        if (this.insertMode === 'new') {
            try {
                // 페이지 메타데이터 추출
                const currentUrl = await ContentExtractor.getCurrentUrl(this.frame as WebviewTag);
                const pageContent = await ContentExtractor.extractPageContent(this.frame as WebviewTag);

                const pageTitle = pageContent?.title || this.currentGateState.title || 'Web Clip';
                const siteName = pageContent?.siteName || this.extractSiteName(currentUrl);

                // 현재 날짜와 시간
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
                const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); // HH:MM
                const fullDateTime = `${dateStr} ${timeStr}`;

                // 파일명 생성 (제목 기반, 특수문자 제거)
                const sanitizedTitle = pageTitle.replace(/[\\/:*?"<>|]/g, '-').substring(0, 50);
                let fileName = `${sanitizedTitle} - ${dateStr}.md`;

                // 중복 파일 체크 및 고유 파일명 생성
                fileName = await this.getUniqueFileName(fileName);

                // YAML Frontmatter 생성
                const yamlFrontmatter = `---
title: "${pageTitle.replace(/"/g, '\\"')}"
source: "${currentUrl}"
site: "${siteName}"
clipped: ${fullDateTime}
type: web-clip
tags:
  - web-clip
  - easy-gate
---

`;

                // 전체 노트 내용 생성: YAML + 제목 + 구분선 + 내용
                const noteContent = `${yamlFrontmatter}# ${pageTitle}

> 🔗 **Source:** [${siteName}](${currentUrl})
> 📅 **Clipped:** ${fullDateTime}

---

${formattedText}
`;

                const file = await this.plugin.app.vault.create(fileName, noteContent);
                await this.plugin.app.workspace.getLeaf('tab').openFile(file);
                new Notice(`Created new note: ${fileName}`);
            } catch (error) {
                console.error('Error creating note with metadata:', error);
                // Fallback: 메타데이터 없이 기본 노트 생성
                const fileName = `Note ${new Date().toISOString().slice(0, 19).replace(/T|:/g, '-')}.md`;
                const file = await this.plugin.app.vault.create(fileName, formattedText);
                await this.plugin.app.workspace.getLeaf('tab').openFile(file);
                new Notice('Created new note with text.');
            }
            return;
        }

        if (!activeView) {
            new Notice('No active Markdown note found to insert text.');
            return;
        }

        const editor = activeView.editor;
        if (this.insertMode === 'cursor') {
            editor.replaceSelection(formattedText);
        } else if (this.insertMode === 'bottom') {
            const lastLine = editor.lineCount();
            editor.replaceRange('\n\n' + formattedText, { line: lastLine, ch: 0 });
        }

        new Notice('Text applied!');
    }

    /**
     * 선택된 텍스트를 마크다운 형식으로 포맷팅
     * - 문단 구분
     * - 리스트 감지 및 변환
     * - 인용구 처리
     */
    private formatTextAsMarkdown(text: string): string {
        // 기본 정리: 연속 줄바꿈 정규화
        let formatted = text.trim();

        // 줄 단위로 분리하여 처리
        const lines = formatted.split('\n');
        const processedLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!line) {
                // 빈 줄은 문단 구분으로 유지
                if (processedLines.length > 0 && processedLines[processedLines.length - 1] !== '') {
                    processedLines.push('');
                }
                continue;
            }

            // 번호 리스트 감지 (1. 2. 3. 또는 1) 2) 3) 형식)
            const numberedMatch = line.match(/^(\d+)[.)]\s*(.+)$/);
            if (numberedMatch) {
                processedLines.push(`${numberedMatch[1]}. ${numberedMatch[2]}`);
                continue;
            }

            // 불릿 리스트 감지 (-, *, •, ▪, ▸ 등)
            const bulletMatch = line.match(/^[-*•▪▸►◦]\s*(.+)$/);
            if (bulletMatch) {
                processedLines.push(`- ${bulletMatch[1]}`);
                continue;
            }

            // 일반 텍스트
            processedLines.push(line);
        }

        // 최종 결과: 연속된 빈 줄 제거 후 반환
        return processedLines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    /**
     * 중복 파일명 방지를 위해 고유한 파일명 생성
     * 파일이 이미 존재하면 (1), (2), ... 숫자를 붙여 고유하게 만듦
     */
    private async getUniqueFileName(fileName: string): Promise<string> {
        const baseName = fileName.replace(/\.md$/, '');
        const extension = '.md';

        // 파일이 존재하지 않으면 원래 이름 반환
        if (!this.plugin.app.vault.getAbstractFileByPath(fileName)) {
            return fileName;
        }

        // 파일이 존재하면 숫자를 붙여 고유하게 만듦
        let counter = 1;
        let newFileName = `${baseName} (${counter})${extension}`;

        while (this.plugin.app.vault.getAbstractFileByPath(newFileName)) {
            counter++;
            newFileName = `${baseName} (${counter})${extension}`;

            // 무한 루프 방지 (최대 100개)
            if (counter > 100) {
                // 타임스탬프로 fallback
                const timestamp = Date.now();
                newFileName = `${baseName} - ${timestamp}${extension}`;
                break;
            }
        }

        return newFileName;
    }

    private createFrame(): void {
        const onReady = () => {
            if (!this.isFrameReady) {
                this.isFrameReady = true
                this.frameReadyCallbacks.forEach((callback) => callback())
            }
        }

        if (this.useIframe) {
            this.frame = createIframe(this.options, onReady)
        } else {
            this.frame = createWebviewTag(this.options, onReady, this.frameDoc)

            // Popup Handling - OAuth URL은 같은 webview에서, 일반 URL은 모달로 처리
            this.frame.addEventListener('new-window', (e) => {
                // @ts-ignore
                const url = e.url as string;
                if (!url) return;

                // OAuth 제공자 URL 감지 (Google, Apple, Microsoft, etc.)
                const oauthDomains = [
                    'accounts.google.com',
                    'accounts.youtube.com',
                    'appleid.apple.com',
                    'login.microsoftonline.com',
                    'login.live.com',
                    'github.com/login',
                    'api.twitter.com',
                    'facebook.com/dialog',
                    'facebook.com/v',
                ];

                const isOAuthUrl = oauthDomains.some(domain => url.includes(domain));

                if (isOAuthUrl) {
                    // OAuth URL은 동일한 webview에서 직접 로드 (인앱 브라우저 방식)
                    // OAuth 완료 후 자동으로 원래 사이트로 리다이렉트됨
                    this.navigateTo(url);
                    return;
                }

                // 일반 팝업은 Obsidian 모달로 처리
                new GatePopupModal(this.plugin.app, url, this.options.profileKey).open();
            });

            this.frame.addEventListener('destroyed', () => {

                if (this.frameDoc != this.contentEl.doc) {
                    if (this.frame) {
                        this.frame.remove()
                    }
                    this.frameDoc = this.contentEl.doc
                    this.createFrame()
                }
            })
        }

        this.contentEl.appendChild(this.frame as unknown as HTMLElement)
    }

    onunload(): void {
        if (this.frame) {
            this.frame.remove()
        }
        super.onunload()
    }

    // ... Menu handlers
    onPaneMenu(menu: Menu, source: string): void {
        super.onPaneMenu(menu, source)
        // ... (Keep existing menu items if needed, or remove since we have UI)
        // For brevity, keeping minimal default actions or just relying on UI.
        // Let's keep Reload and Home.
        menu.addItem((item) => {
            item.setTitle('Reload')
            item.setIcon('refresh-ccw')
            item.onClick(() => {
                if (this.frame instanceof HTMLIFrameElement) {
                    this.frame.contentWindow?.location.reload()
                } else {
                    this.frame.reload()
                }
            })
        })
    }

    getViewType(): string {
        return this.options?.id ?? 'gate'
    }

    getDisplayText(): string {
        return this.options?.title ?? 'Gate'
    }

    getIcon(): string {
        return this.options?.icon ?? 'globe'
    }

    onFrameReady(callback: Function) {
        if (this.isFrameReady) {
            callback()
        } else {
            this.frameReadyCallbacks.push(callback)
        }
    }

    async setUrl(url: string) {
        this.navigateTo(url);
    }
}
