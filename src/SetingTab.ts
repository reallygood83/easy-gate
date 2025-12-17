import { App, PluginSettingTab, Setting, Platform, Notice, TextComponent, ButtonComponent } from 'obsidian'
import OpenGatePlugin from './main'
import { ModalEditGate } from './ModalEditGate'
import { createEmptyGateOption } from './fns/createEmptyGateOption'
import { GateFrameOption } from './GateOptions'
import { AI_PROVIDERS, AIProviderType, SavedPrompt } from './ai/types'
import { getAIService } from './ai'

export class SettingTab extends PluginSettingTab {
    plugin: OpenGatePlugin
    shouldNotify: boolean

    constructor(app: App, plugin: OpenGatePlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    async updateGate(gate: GateFrameOption) {
        await this.plugin.addGate(gate)
        this.display()
    }

    display(): void {
        this.shouldNotify = false
        const { containerEl } = this
        containerEl.empty()

        // Mobile Warning
        if (Platform.isMobileApp) {
            containerEl
                .createEl('div', {
                    text: 'On mobile, some websites may not work. It is a limitation of Obsidian Mobile. Please use Obsidian Desktop instead. Follow me on Twitter to get the latest updates: ',
                    cls: 'open-gate-mobile-warning'
                })
                .createEl('a', {
                    text: '@reallygood83',
                    cls: 'open-gate-mobile-link',
                    href: 'https://twitter.com/reallygood83'
                })
        }

        // ============================
        // Gates Section
        // ============================
        containerEl.createEl('h2', { text: '🌐 Gates' })

        containerEl.createEl('button', { text: 'New gate', cls: 'mod-cta' }).addEventListener('click', () => {
            new ModalEditGate(this.app, createEmptyGateOption(), this.updateGate.bind(this)).open()
        })

        containerEl.createEl('hr')

        const settingContainerEl = containerEl.createDiv('setting-container')

        for (const gateId in this.plugin.settings.gates) {
            const gate = this.plugin.settings.gates[gateId]
            const gateEl = settingContainerEl.createEl('div', {
                attr: {
                    'data-gate-id': gate.id,
                    class: 'open-gate--setting--gate'
                }
            })

            new Setting(gateEl)
                .setName(gate.title)
                .setDesc(gate.url)
                .addButton((button) => {
                    button.setButtonText('Delete').onClick(async () => {
                        await this.plugin.removeGate(gateId)
                        gateEl.remove()
                    })
                })
                .addButton((button) => {
                    button.setButtonText('Edit').onClick(() => {
                        new ModalEditGate(this.app, gate, this.updateGate.bind(this)).open()
                    })
                })
        }

        // ============================
        // AI Settings Section (v2.0)
        // ============================
        if (!Platform.isMobileApp) {
            this.displayAISettings(containerEl)
        }

        // ============================
        // Help Section
        // ============================
        containerEl.createEl('h2', { text: '❓ Help' })

        containerEl.createEl('small', {
            attr: {
                style: 'display: block; margin-bottom: 5px'
            },
            text: 'When you delete or edit a gate, you need to reload Obsidian to see the changes.'
        })

        containerEl.createEl('small', {
            attr: {
                style: 'display: block; margin-bottom: 1em;'
            },
            text: `To reload Obsidian, you can use the menu "view -> Force reload" or "Reload App" in the command palette.`
        })

        new Setting(containerEl)
            .setName('Follow me on Twitter')
            .setDesc('@reallygood83')
            .addButton((button) => {
                button.setCta()
                button.setButtonText('YouTube').onClick(() => {
                    window.open('https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v')
                })
            })
            .addButton((button) => {
                button.setCta()
                button.setButtonText('Twitter').onClick(() => {
                    window.open('https://twitter.com/reallygood83')
                })
            })
    }

    /**
     * AI 설정 섹션 렌더링
     */
    private displayAISettings(containerEl: HTMLElement): void {
        containerEl.createEl('h2', { text: '🤖 AI Settings' })

        // API 키 관리 섹션
        this.displayAPIKeySection(containerEl)

        // 기본 Provider 선택
        this.displayDefaultProviderSection(containerEl)

        // 커스텀 모델 설정
        this.displayCustomModelSection(containerEl)

        // 클리핑 기본 설정
        this.displayClippingSettings(containerEl)

        // AI 생성 설정
        this.displayAIGenerationSettings(containerEl)

        // 저장된 프롬프트 관리
        this.displaySavedPromptsSection(containerEl)
    }

    /**
     * API 키 관리 테이블
     */
    private displayAPIKeySection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '🔑 AI API 키 관리' })
        containerEl.createEl('p', {
            text: 'API 키는 한 번 설정하면 유지됩니다. 사용 시 Provider만 선택하면 됩니다.',
            cls: 'setting-item-description'
        })

        const providerIds = Object.keys(AI_PROVIDERS) as AIProviderType[]

        for (const providerId of providerIds) {
            const providerConfig = AI_PROVIDERS[providerId]
            const hasApiKey = this.plugin.settings.ai.apiKeys[providerId] &&
                              this.plugin.settings.ai.apiKeys[providerId]!.trim().length > 0
            const currentModel = this.plugin.settings.ai.models[providerId]

            const settingEl = new Setting(containerEl)
                .setName(`${hasApiKey ? '✅' : '⬜'} ${providerConfig.displayName}`)
                .setDesc(`모델: ${currentModel}`)

            // API 키 입력 또는 마스킹 표시
            let apiKeyInput: TextComponent

            settingEl.addText((text) => {
                apiKeyInput = text
                text.setPlaceholder(hasApiKey ? '••••••••••••' : 'API 키 입력...')
                text.inputEl.type = 'password'
                text.inputEl.style.width = '180px'

                if (hasApiKey) {
                    // 마스킹된 값 표시 (실제 값은 저장되어 있음)
                    text.setValue('')
                }

                text.onChange(async (value) => {
                    if (value.trim().length > 0) {
                        this.plugin.settings.ai.apiKeys[providerId] = value.trim()
                        await this.plugin.saveSettings()
                    }
                })
            })

            // Test 버튼
            settingEl.addButton((button) => {
                button
                    .setButtonText(hasApiKey ? 'Test' : '입력')
                    .onClick(async () => {
                        if (!hasApiKey && apiKeyInput) {
                            // 입력 필드에 포커스
                            apiKeyInput.inputEl.focus()
                            return
                        }

                        // API 키 테스트
                        button.setButtonText('...')
                        button.setDisabled(true)

                        const aiService = getAIService()
                        if (aiService) {
                            const apiKey = this.plugin.settings.ai.apiKeys[providerId] || ''
                            const result = await aiService.testApiKey(providerId, apiKey)

                            if (result.success) {
                                new Notice(`✅ ${providerConfig.displayName} 연결 성공!`)
                            } else {
                                new Notice(`❌ ${providerConfig.displayName} 연결 실패: ${result.error}`)
                            }
                        }

                        button.setButtonText('Test')
                        button.setDisabled(false)
                    })
            })

            // 모델 변경 버튼
            settingEl.addExtraButton((button) => {
                button
                    .setIcon('pencil')
                    .setTooltip('모델 변경')
                    .onClick(() => {
                        // 모델명 입력 프롬프트
                        const newModel = prompt(
                            `${providerConfig.displayName} 모델명을 입력하세요:`,
                            currentModel
                        )
                        if (newModel && newModel.trim().length > 0) {
                            this.plugin.settings.ai.models[providerId] = newModel.trim()
                            this.plugin.saveSettings()
                            this.display()
                        }
                    })
            })

            // 삭제 버튼 (키가 있을 때만)
            if (hasApiKey) {
                settingEl.addExtraButton((button) => {
                    button
                        .setIcon('trash')
                        .setTooltip('API 키 삭제')
                        .onClick(async () => {
                            if (confirm(`${providerConfig.displayName} API 키를 삭제하시겠습니까?`)) {
                                delete this.plugin.settings.ai.apiKeys[providerId]
                                await this.plugin.saveSettings()
                                this.display()
                            }
                        })
                })
            }
        }
    }

    /**
     * 기본 Provider 선택
     */
    private displayDefaultProviderSection(containerEl: HTMLElement): void {
        const configuredProviders = (Object.keys(AI_PROVIDERS) as AIProviderType[]).filter(
            (id) => this.plugin.settings.ai.apiKeys[id] && this.plugin.settings.ai.apiKeys[id]!.trim().length > 0
        )

        new Setting(containerEl)
            .setName('기본 AI Provider')
            .setDesc('API 키가 설정된 Provider만 선택할 수 있습니다.')
            .addDropdown((dropdown) => {
                // 설정된 프로바이더만 옵션으로 추가
                if (configuredProviders.length === 0) {
                    dropdown.addOption('none', '설정된 Provider가 없습니다')
                    dropdown.setDisabled(true)
                } else {
                    for (const providerId of configuredProviders) {
                        const config = AI_PROVIDERS[providerId]
                        dropdown.addOption(providerId, `${config.displayName} (${this.plugin.settings.ai.models[providerId]})`)
                    }
                    dropdown.setValue(this.plugin.settings.ai.provider)
                    dropdown.onChange(async (value) => {
                        this.plugin.settings.ai.provider = value as AIProviderType
                        await this.plugin.saveSettings()
                    })
                }
            })
    }

    /**
     * 커스텀 모델 설정
     */
    private displayCustomModelSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '⚙️ 커스텀 모델 설정 (선택사항)' })

        new Setting(containerEl)
            .setName('커스텀 모델명 사용')
            .setDesc('기본 Provider의 모델명을 직접 지정합니다.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ai.useCustomModel)
                toggle.onChange(async (value) => {
                    this.plugin.settings.ai.useCustomModel = value
                    await this.plugin.saveSettings()
                    this.display()
                })
            })

        if (this.plugin.settings.ai.useCustomModel) {
            new Setting(containerEl)
                .setName('커스텀 모델명')
                .setDesc(`현재 Provider: ${AI_PROVIDERS[this.plugin.settings.ai.provider].displayName}`)
                .addText((text) => {
                    text.setPlaceholder('모델명 입력...')
                    text.setValue(this.plugin.settings.ai.customModel)
                    text.onChange(async (value) => {
                        this.plugin.settings.ai.customModel = value
                        await this.plugin.saveSettings()
                    })
                })
        }
    }

    /**
     * 클리핑 기본 설정
     */
    private displayClippingSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '📋 클리핑 기본 설정' })

        new Setting(containerEl)
            .setName('기본 저장 폴더')
            .setDesc('클리핑 노트가 저장될 기본 폴더입니다.')
            .addText((text) => {
                text.setPlaceholder('Clippings')
                text.setValue(this.plugin.settings.clipping.defaultFolder)
                text.onChange(async (value) => {
                    this.plugin.settings.clipping.defaultFolder = value || 'Clippings'
                    await this.plugin.saveSettings()
                })
            })

        new Setting(containerEl)
            .setName('파일명 형식')
            .setDesc('{title}, {date}, {time} 변수를 사용할 수 있습니다.')
            .addText((text) => {
                text.setPlaceholder('{title} - {date}')
                text.setValue(this.plugin.settings.clipping.filenameFormat)
                text.onChange(async (value) => {
                    this.plugin.settings.clipping.filenameFormat = value || '{title} - {date}'
                    await this.plugin.saveSettings()
                })
            })

        new Setting(containerEl)
            .setName('메타데이터 포함')
            .setDesc('클리핑 노트에 포함할 메타데이터를 선택합니다.')
            .addToggle((toggle) => {
                toggle.setTooltip('URL 포함')
                toggle.setValue(this.plugin.settings.clipping.includeUrl)
                toggle.onChange(async (value) => {
                    this.plugin.settings.clipping.includeUrl = value
                    await this.plugin.saveSettings()
                })
            })
            .addToggle((toggle) => {
                toggle.setTooltip('날짜 포함')
                toggle.setValue(this.plugin.settings.clipping.includeDate)
                toggle.onChange(async (value) => {
                    this.plugin.settings.clipping.includeDate = value
                    await this.plugin.saveSettings()
                })
            })
            .addToggle((toggle) => {
                toggle.setTooltip('작성자 포함')
                toggle.setValue(this.plugin.settings.clipping.includeAuthor)
                toggle.onChange(async (value) => {
                    this.plugin.settings.clipping.includeAuthor = value
                    await this.plugin.saveSettings()
                })
            })
    }

    /**
     * AI 생성 설정
     */
    private displayAIGenerationSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '✨ AI 생성 설정' })

        new Setting(containerEl)
            .setName('기본 언어')
            .setDesc('AI가 응답할 때 사용할 기본 언어입니다.')
            .addDropdown((dropdown) => {
                dropdown.addOption('한국어', '한국어')
                dropdown.addOption('English', 'English')
                dropdown.addOption('日本語', '日本語')
                dropdown.addOption('中文', '中文')
                dropdown.setValue(this.plugin.settings.ai.defaultLanguage)
                dropdown.onChange(async (value) => {
                    this.plugin.settings.ai.defaultLanguage = value
                    await this.plugin.saveSettings()
                })
            })

        new Setting(containerEl)
            .setName('기본 템플릿')
            .setDesc('AI 처리 시 기본으로 사용할 템플릿입니다.')
            .addDropdown((dropdown) => {
                dropdown.addOption('basic-summary', '📝 기본 요약')
                dropdown.addOption('study-note', '📚 학습 노트')
                dropdown.addOption('analysis-report', '📊 분석 리포트')
                dropdown.addOption('idea-note', '💡 아이디어 노트')
                dropdown.setValue(this.plugin.settings.ai.defaultTemplate)
                dropdown.onChange(async (value) => {
                    this.plugin.settings.ai.defaultTemplate = value
                    await this.plugin.saveSettings()
                })
            })

        new Setting(containerEl)
            .setName('자동 태그 생성')
            .setDesc('AI가 콘텐츠를 분석하여 자동으로 태그를 생성합니다.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.ai.autoTags)
                toggle.onChange(async (value) => {
                    this.plugin.settings.ai.autoTags = value
                    await this.plugin.saveSettings()
                })
            })
    }

    /**
     * 저장된 프롬프트 관리
     */
    private displaySavedPromptsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: '💾 저장된 프롬프트' })

        const promptsContainer = containerEl.createDiv('saved-prompts-container')

        // 기존 프롬프트 목록
        for (let i = 0; i < this.plugin.settings.savedPrompts.length; i++) {
            const prompt = this.plugin.settings.savedPrompts[i]

            new Setting(promptsContainer)
                .setName(`[${prompt.name}]`)
                .setDesc(prompt.prompt.substring(0, 50) + (prompt.prompt.length > 50 ? '...' : ''))
                .addButton((button) => {
                    button.setIcon('pencil')
                    button.setTooltip('편집')
                    button.onClick(() => {
                        this.editPrompt(i)
                    })
                })
                .addButton((button) => {
                    button.setIcon('trash')
                    button.setTooltip('삭제')
                    button.onClick(async () => {
                        if (confirm(`"${prompt.name}" 프롬프트를 삭제하시겠습니까?`)) {
                            this.plugin.settings.savedPrompts.splice(i, 1)
                            await this.plugin.saveSettings()
                            this.display()
                        }
                    })
                })
        }

        // 새 프롬프트 추가 버튼
        new Setting(promptsContainer)
            .addButton((button) => {
                button.setButtonText('+ 새 프롬프트 추가')
                button.onClick(() => {
                    this.addNewPrompt()
                })
            })
    }

    /**
     * 프롬프트 편집
     */
    private editPrompt(index: number): void {
        const prompt = this.plugin.settings.savedPrompts[index]
        const newName = window.prompt('프롬프트 이름:', prompt.name)
        if (newName === null) return

        const newPromptText = window.prompt('프롬프트 내용:', prompt.prompt)
        if (newPromptText === null) return

        this.plugin.settings.savedPrompts[index] = {
            ...prompt,
            name: newName.trim() || prompt.name,
            prompt: newPromptText.trim() || prompt.prompt
        }

        this.plugin.saveSettings()
        this.display()
    }

    /**
     * 새 프롬프트 추가
     */
    private addNewPrompt(): void {
        const name = window.prompt('새 프롬프트 이름:')
        if (!name || name.trim().length === 0) return

        const promptText = window.prompt('프롬프트 내용:')
        if (!promptText || promptText.trim().length === 0) return

        const newPrompt: SavedPrompt = {
            id: `prompt-${Date.now()}`,
            name: name.trim(),
            prompt: promptText.trim()
        }

        this.plugin.settings.savedPrompts.push(newPrompt)
        this.plugin.saveSettings()
        this.display()
    }
}
