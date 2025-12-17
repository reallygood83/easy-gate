/**
 * AnalysisModal - 통합 분석 모달
 *
 * 페이지 분석 및 AI 처리를 위한 통합 인터페이스입니다.
 * - 콘텐츠 미리보기
 * - 템플릿 선택
 * - 커스텀 프롬프트 입력
 * - AI Provider 선택
 * - 분석 실행
 */

import { App, Modal, Setting, Notice, DropdownComponent, TextAreaComponent } from 'obsidian'
import { AISettings, AIProviderType, AI_PROVIDERS, SavedPrompt, ClipData } from '../ai/types'
import { getAIService } from '../ai/AIService'
import { showSuccess, showError, showWarning } from '../ui/ToastNotification'

export interface AnalysisModalOptions {
    app: App
    settings: AISettings
    savedPrompts: SavedPrompt[]
    clipData: ClipData
    onAnalyze: (options: AnalysisConfig) => Promise<void>
    onSavePrompt?: (prompt: SavedPrompt) => void
}

export interface AnalysisConfig {
    templateId: string | null
    customPrompt: string | null
    provider: AIProviderType
    includeMetadata: boolean
    outputFormat: 'markdown' | 'summary' | 'bullets' | 'qa'
    language: string
}

/**
 * 분석 템플릿 정의
 */
const ANALYSIS_TEMPLATES = [
    {
        id: 'basic-summary',
        name: '📋 기본 요약',
        description: '페이지 내용을 간결하게 요약합니다.',
        icon: 'file-text',
        prompt: `다음 웹 페이지 내용을 한국어로 요약해주세요:

## 요약 요구사항
- 핵심 내용을 3-5개의 주요 포인트로 정리
- 중요한 정보와 결론을 강조
- 전문 용어는 간단히 설명 추가

## 원본 내용
{content}`
    },
    {
        id: 'study-note',
        name: '📚 학습 노트',
        description: '학습에 최적화된 형태로 정리합니다.',
        icon: 'book',
        prompt: `다음 내용을 학습 노트 형태로 정리해주세요:

## 정리 형식
1. **핵심 개념**: 주요 개념과 정의
2. **중요 포인트**: 기억해야 할 핵심 사항
3. **예시/사례**: 이해를 돕는 구체적 예시
4. **질문 & 답변**: 자주 묻는 질문 형태로 정리
5. **복습 키워드**: 복습용 키워드 목록

## 원본 내용
{content}`
    },
    {
        id: 'analysis-report',
        name: '📊 분석 리포트',
        description: '심층 분석 리포트를 생성합니다.',
        icon: 'bar-chart',
        prompt: `다음 내용을 분석 리포트 형태로 작성해주세요:

## 리포트 구조
1. **개요**: 문서의 핵심 주제와 목적
2. **주요 발견사항**: 중요한 정보와 데이터
3. **분석**: 내용에 대한 심층 분석
4. **시사점**: 도출할 수 있는 인사이트
5. **결론 및 제안**: 최종 결론과 활용 방안

## 원본 내용
{content}`
    },
    {
        id: 'idea-note',
        name: '💡 아이디어 노트',
        description: '아이디어 발굴 및 확장에 초점을 맞춥니다.',
        icon: 'lightbulb',
        prompt: `다음 내용에서 아이디어를 발굴하고 확장해주세요:

## 아이디어 정리
1. **핵심 아이디어**: 문서의 중심 아이디어
2. **관련 아이디어**: 연관된 추가 아이디어
3. **적용 방안**: 실제 적용할 수 있는 방법
4. **발전 가능성**: 더 발전시킬 수 있는 방향
5. **연결점**: 다른 분야와의 연결 가능성

## 원본 내용
{content}`
    },
    {
        id: 'action-items',
        name: '✅ 액션 아이템',
        description: '실행 가능한 태스크 목록을 추출합니다.',
        icon: 'check-square',
        prompt: `다음 내용에서 실행 가능한 액션 아이템을 추출해주세요:

## 액션 아이템 형식
- [ ] 즉시 실행 가능한 태스크
- [ ] 단기 목표 (1주일 내)
- [ ] 중기 목표 (1개월 내)
- [ ] 장기 목표

각 항목에 우선순위와 예상 소요시간을 추가해주세요.

## 원본 내용
{content}`
    },
    {
        id: 'qa-format',
        name: '❓ Q&A 형식',
        description: '질문과 답변 형태로 재구성합니다.',
        icon: 'help-circle',
        prompt: `다음 내용을 Q&A 형식으로 재구성해주세요:

## Q&A 형식
Q1: [핵심 질문]
A1: [상세한 답변]

Q2: ...

최소 5개의 Q&A 쌍을 생성하고,
내용의 핵심을 파악할 수 있는 질문을 만들어주세요.

## 원본 내용
{content}`
    }
]

/**
 * AnalysisModal 클래스
 */
export class AnalysisModal extends Modal {
    private settings: AISettings
    private savedPrompts: SavedPrompt[]
    private clipData: ClipData
    private onAnalyze: (options: AnalysisConfig) => Promise<void>
    private onSavePrompt?: (prompt: SavedPrompt) => void

    // UI State
    private selectedTemplateId: string | null = 'basic-summary'
    private customPrompt: string = ''
    private selectedProvider: AIProviderType
    private includeMetadata: boolean = true
    private outputFormat: 'markdown' | 'summary' | 'bullets' | 'qa' = 'markdown'

    // UI Elements
    private promptTextArea: TextAreaComponent | null = null
    private templateContainer: HTMLElement | null = null
    private previewContainer: HTMLElement | null = null

    constructor(options: AnalysisModalOptions) {
        super(options.app)
        this.settings = options.settings
        this.savedPrompts = options.savedPrompts
        this.clipData = options.clipData
        this.onAnalyze = options.onAnalyze
        this.onSavePrompt = options.onSavePrompt
        this.selectedProvider = options.settings.provider
    }

    onOpen(): void {
        const { contentEl } = this
        contentEl.empty()
        contentEl.addClass('easy-gate-analysis-modal')

        // 모달 스타일
        this.modalEl.style.width = '700px'
        this.modalEl.style.maxWidth = '90vw'

        this.renderHeader()
        this.renderContentPreview()
        this.renderTemplateSelection()
        this.renderCustomPrompt()
        this.renderOptions()
        this.renderActions()
    }

    onClose(): void {
        const { contentEl } = this
        contentEl.empty()
    }

    /**
     * 헤더 렌더링
     */
    private renderHeader(): void {
        const { contentEl } = this

        const header = contentEl.createDiv({ cls: 'analysis-modal-header' })
        header.createEl('h2', { text: '🔍 페이지 분석' })

        // 페이지 정보
        const pageInfo = header.createDiv({ cls: 'page-info' })
        pageInfo.createEl('span', { text: '📄 ' + this.clipData.title, cls: 'page-title' })

        if (this.clipData.url) {
            const urlSpan = pageInfo.createEl('span', { cls: 'page-url' })
            urlSpan.createEl('a', {
                text: this.truncateUrl(this.clipData.url, 50),
                href: this.clipData.url
            })
        }
    }

    /**
     * 콘텐츠 미리보기 렌더링
     */
    private renderContentPreview(): void {
        const { contentEl } = this

        const previewSection = contentEl.createDiv({ cls: 'analysis-section preview-section' })
        previewSection.createEl('h3', { text: '📝 콘텐츠 미리보기' })

        this.previewContainer = previewSection.createDiv({ cls: 'content-preview' })
        this.previewContainer.style.cssText = `
            max-height: 150px;
            overflow-y: auto;
            padding: 12px;
            background: var(--background-secondary);
            border-radius: 8px;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
            border: 1px solid var(--background-modifier-border);
        `

        // 콘텐츠 길이 표시
        const contentLength = this.clipData.content.length
        const wordCount = this.clipData.content.split(/\s+/).filter(w => w).length
        const tokenEstimate = Math.ceil(contentLength / 4)

        const stats = previewSection.createDiv({ cls: 'content-stats' })
        stats.style.cssText = `
            display: flex;
            gap: 16px;
            margin-top: 8px;
            font-size: 12px;
            color: var(--text-muted);
        `
        stats.createSpan({ text: `📊 ${contentLength.toLocaleString()} 자` })
        stats.createSpan({ text: `📝 ${wordCount.toLocaleString()} 단어` })
        stats.createSpan({ text: `🎫 ~${tokenEstimate.toLocaleString()} 토큰` })

        // 미리보기 텍스트
        const previewText = this.clipData.content.substring(0, 500)
        this.previewContainer.textContent = previewText + (contentLength > 500 ? '...' : '')
    }

    /**
     * 템플릿 선택 렌더링
     */
    private renderTemplateSelection(): void {
        const { contentEl } = this

        const templateSection = contentEl.createDiv({ cls: 'analysis-section template-section' })
        templateSection.createEl('h3', { text: '📋 분석 템플릿' })

        this.templateContainer = templateSection.createDiv({ cls: 'template-grid' })
        this.templateContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 12px;
        `

        // 기본 템플릿
        ANALYSIS_TEMPLATES.forEach(template => {
            this.createTemplateCard(template)
        })

        // 저장된 커스텀 프롬프트
        if (this.savedPrompts.length > 0) {
            const customSection = templateSection.createDiv({ cls: 'saved-prompts-section' })
            customSection.style.marginTop = '16px'
            customSection.createEl('h4', { text: '💾 저장된 프롬프트', cls: 'saved-prompts-title' })

            const savedGrid = customSection.createDiv({ cls: 'saved-prompts-grid' })
            savedGrid.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 8px;
            `

            this.savedPrompts.forEach(prompt => {
                const chip = savedGrid.createEl('button', {
                    text: `💬 ${prompt.name}`,
                    cls: 'saved-prompt-chip'
                })
                chip.style.cssText = `
                    padding: 6px 12px;
                    border-radius: 16px;
                    border: 1px solid var(--background-modifier-border);
                    background: var(--background-secondary);
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                `
                chip.onclick = () => {
                    this.selectedTemplateId = null
                    this.customPrompt = prompt.prompt
                    if (this.promptTextArea) {
                        this.promptTextArea.setValue(prompt.prompt)
                    }
                    this.updateTemplateSelection()
                }
            })
        }
    }

    /**
     * 템플릿 카드 생성
     */
    private createTemplateCard(template: typeof ANALYSIS_TEMPLATES[0]): void {
        if (!this.templateContainer) return

        const card = this.templateContainer.createDiv({ cls: 'template-card' })
        card.style.cssText = `
            padding: 12px;
            border-radius: 8px;
            border: 2px solid var(--background-modifier-border);
            background: var(--background-primary);
            cursor: pointer;
            transition: all 0.2s;
        `

        if (this.selectedTemplateId === template.id) {
            card.style.borderColor = 'var(--interactive-accent)'
            card.style.background = 'var(--background-secondary)'
        }

        const title = card.createDiv({ cls: 'template-title' })
        title.style.cssText = `font-weight: 600; margin-bottom: 4px;`
        title.textContent = template.name

        const desc = card.createDiv({ cls: 'template-desc' })
        desc.style.cssText = `font-size: 11px; color: var(--text-muted);`
        desc.textContent = template.description

        card.onclick = () => {
            this.selectedTemplateId = template.id
            this.customPrompt = ''
            if (this.promptTextArea) {
                this.promptTextArea.setValue('')
            }
            this.updateTemplateSelection()
        }

        card.onmouseenter = () => {
            if (this.selectedTemplateId !== template.id) {
                card.style.borderColor = 'var(--interactive-accent-hover)'
            }
        }
        card.onmouseleave = () => {
            if (this.selectedTemplateId !== template.id) {
                card.style.borderColor = 'var(--background-modifier-border)'
            }
        }
    }

    /**
     * 템플릿 선택 상태 업데이트
     */
    private updateTemplateSelection(): void {
        if (!this.templateContainer) return

        const cards = this.templateContainer.querySelectorAll('.template-card')
        cards.forEach((card, index) => {
            const htmlCard = card as HTMLElement
            const template = ANALYSIS_TEMPLATES[index]
            if (template && this.selectedTemplateId === template.id) {
                htmlCard.style.borderColor = 'var(--interactive-accent)'
                htmlCard.style.background = 'var(--background-secondary)'
            } else {
                htmlCard.style.borderColor = 'var(--background-modifier-border)'
                htmlCard.style.background = 'var(--background-primary)'
            }
        })
    }

    /**
     * 커스텀 프롬프트 입력 렌더링
     */
    private renderCustomPrompt(): void {
        const { contentEl } = this

        const promptSection = contentEl.createDiv({ cls: 'analysis-section prompt-section' })
        promptSection.createEl('h3', { text: '✏️ 커스텀 프롬프트 (선택사항)' })

        const promptDesc = promptSection.createEl('p', { cls: 'prompt-description' })
        promptDesc.style.cssText = `font-size: 12px; color: var(--text-muted); margin-bottom: 8px;`
        promptDesc.textContent = '템플릿 대신 직접 프롬프트를 입력하거나, 추가 지시사항을 작성할 수 있습니다.'

        new Setting(promptSection)
            .setClass('custom-prompt-setting')
            .addTextArea(text => {
                this.promptTextArea = text
                text.setPlaceholder('예: "위 내용을 초등학생도 이해할 수 있게 쉽게 설명해주세요..."')
                text.setValue(this.customPrompt)
                text.inputEl.style.cssText = `
                    width: 100%;
                    min-height: 80px;
                    resize: vertical;
                `
                text.onChange(value => {
                    this.customPrompt = value
                    if (value.trim()) {
                        this.selectedTemplateId = null
                        this.updateTemplateSelection()
                    }
                })
            })

        // 프롬프트 저장 버튼
        if (this.onSavePrompt) {
            const savePromptBtn = promptSection.createEl('button', {
                text: '💾 이 프롬프트 저장',
                cls: 'save-prompt-btn'
            })
            savePromptBtn.style.cssText = `
                margin-top: 8px;
                padding: 6px 12px;
                font-size: 12px;
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                cursor: pointer;
            `
            savePromptBtn.onclick = () => this.saveCurrentPrompt()
        }
    }

    /**
     * 옵션 렌더링
     */
    private renderOptions(): void {
        const { contentEl } = this

        const optionsSection = contentEl.createDiv({ cls: 'analysis-section options-section' })
        optionsSection.createEl('h3', { text: '⚙️ 분석 옵션' })

        // AI Provider 선택
        new Setting(optionsSection)
            .setName('AI Provider')
            .setDesc('분석에 사용할 AI 서비스를 선택합니다.')
            .addDropdown(dropdown => {
                const aiService = getAIService()

                Object.entries(AI_PROVIDERS).forEach(([key, provider]) => {
                    const isConfigured = aiService?.isProviderConfigured(key as AIProviderType) ?? false
                    dropdown.addOption(
                        key,
                        `${provider.displayName} ${isConfigured ? '✅' : '⚠️'}`
                    )
                })

                dropdown.setValue(this.selectedProvider)
                dropdown.onChange(value => {
                    this.selectedProvider = value as AIProviderType
                })
            })

        // 출력 형식
        new Setting(optionsSection)
            .setName('출력 형식')
            .setDesc('분석 결과의 형식을 선택합니다.')
            .addDropdown(dropdown => {
                dropdown.addOption('markdown', '📄 마크다운')
                dropdown.addOption('summary', '📋 요약 (짧은 형태)')
                dropdown.addOption('bullets', '• 글머리 기호')
                dropdown.addOption('qa', '❓ Q&A 형식')
                dropdown.setValue(this.outputFormat)
                dropdown.onChange(value => {
                    this.outputFormat = value as typeof this.outputFormat
                })
            })

        // 메타데이터 포함
        new Setting(optionsSection)
            .setName('메타데이터 포함')
            .setDesc('URL, 작성자, 날짜 등의 메타데이터를 노트에 포함합니다.')
            .addToggle(toggle => {
                toggle.setValue(this.includeMetadata)
                toggle.onChange(value => {
                    this.includeMetadata = value
                })
            })
    }

    /**
     * 액션 버튼 렌더링
     */
    private renderActions(): void {
        const { contentEl } = this

        const actionsSection = contentEl.createDiv({ cls: 'analysis-actions' })
        actionsSection.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--background-modifier-border);
        `

        // 취소 버튼
        const cancelBtn = actionsSection.createEl('button', {
            text: '취소',
            cls: 'mod-cancel'
        })
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            border-radius: 4px;
            border: 1px solid var(--background-modifier-border);
            background: var(--background-secondary);
            cursor: pointer;
        `
        cancelBtn.onclick = () => this.close()

        // 분석 시작 버튼
        const analyzeBtn = actionsSection.createEl('button', {
            text: '🚀 분석 시작',
            cls: 'mod-cta'
        })
        analyzeBtn.style.cssText = `
            padding: 8px 20px;
            border-radius: 4px;
            border: none;
            background: var(--interactive-accent);
            color: var(--text-on-accent);
            cursor: pointer;
            font-weight: 600;
        `
        analyzeBtn.onclick = () => this.startAnalysis()
    }

    /**
     * 분석 시작
     */
    private async startAnalysis(): Promise<void> {
        // 유효성 검사
        if (!this.selectedTemplateId && !this.customPrompt.trim()) {
            showWarning('템플릿을 선택하거나 커스텀 프롬프트를 입력해주세요.')
            return
        }

        const aiService = getAIService()
        if (!aiService?.isProviderConfigured(this.selectedProvider)) {
            showWarning(`${AI_PROVIDERS[this.selectedProvider].displayName} API 키가 설정되지 않았습니다.`)
            return
        }

        const config: AnalysisConfig = {
            templateId: this.selectedTemplateId,
            customPrompt: this.customPrompt.trim() || null,
            provider: this.selectedProvider,
            includeMetadata: this.includeMetadata,
            outputFormat: this.outputFormat,
            language: this.settings.defaultLanguage || 'ko'
        }

        this.close()
        await this.onAnalyze(config)
    }

    /**
     * 현재 프롬프트 저장
     */
    private saveCurrentPrompt(): void {
        if (!this.customPrompt.trim()) {
            showWarning('저장할 프롬프트를 입력해주세요.')
            return
        }

        const promptName = prompt('프롬프트 이름을 입력하세요:')
        if (!promptName) return

        const newPrompt: SavedPrompt = {
            id: `custom-${Date.now()}`,
            name: promptName,
            prompt: this.customPrompt
        }

        if (this.onSavePrompt) {
            this.onSavePrompt(newPrompt)
            showSuccess(`"${promptName}" 프롬프트가 저장되었습니다.`)
        }
    }

    /**
     * URL 자르기
     */
    private truncateUrl(url: string, maxLength: number): string {
        if (url.length <= maxLength) return url
        return url.substring(0, maxLength - 3) + '...'
    }

    /**
     * 템플릿 프롬프트 가져오기
     */
    static getTemplatePrompt(templateId: string): string | null {
        const template = ANALYSIS_TEMPLATES.find(t => t.id === templateId)
        return template?.prompt || null
    }

    /**
     * 템플릿 목록 가져오기
     */
    static getTemplates(): typeof ANALYSIS_TEMPLATES {
        return ANALYSIS_TEMPLATES
    }
}
