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
import { AnalysisModal, ProcessModal, AnalysisConfig } from './modals'
import { ClipData } from './ai/types'

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
            onOpenAnalysisModal: () => this.openAnalysisModal(),
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
     */
    private async openAnalysisModal(): Promise<void> {
        if (this.useIframe) {
            showError('Desktop 환경에서만 분석 기능이 가능합니다.')
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

            // AnalysisModal 열기
            const modal = new AnalysisModal({
                app: this.app,
                settings: this.plugin.settings.ai,
                savedPrompts: this.plugin.settings.savedPrompts || [],
                clipData: clipData,
                onAnalyze: async (config: AnalysisConfig) => {
                    await this.runAnalysis(clipData, config)
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
            const fileName = `${title.replace(/[\\/:*?"<>|]/g, '-')}.md`
            const file = await this.app.vault.create(fileName, content)
            await this.app.workspace.getLeaf('tab').openFile(file)
            return file
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '저장 실패'
            showError(errorMessage)
            return null
        }
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
                    () => this.handleAISummary(),
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

        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

        if (this.insertMode === 'new') {
            const fileName = `Note ${new Date().toISOString().slice(0, 19).replace(/T|:/g, '-')}.md`;
            const file = await this.plugin.app.vault.create(fileName, text);
            await this.plugin.app.workspace.getLeaf('tab').openFile(file);
            new Notice('Created new note with text.');
            return;
        }

        if (!activeView) {
            new Notice('No active Markdown note found to insert text.');
            return;
        }

        const editor = activeView.editor;
        if (this.insertMode === 'cursor') {
            editor.replaceSelection(text);
        } else if (this.insertMode === 'bottom') {
            const lastLine = editor.lineCount();
            editor.replaceRange('\n' + text, { line: lastLine, ch: 0 });
        }

        new Notice('Text applied!');
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
