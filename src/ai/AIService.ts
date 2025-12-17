/**
 * AIService - AI Provider Abstraction Layer
 *
 * 모든 AI 프로바이더를 통합 관리하는 서비스 레이어입니다.
 * 사용자는 Provider만 선택하면 되고, API 키는 설정에서 한 번만 저장합니다.
 */

import {
    AIProvider,
    AIProviderType,
    AIProviderResponse,
    AIMessage,
    AIRequestOptions,
    AISettings,
    AI_PROVIDERS,
    AIProviderConfig
} from './types'

import { GeminiProvider } from './providers/GeminiProvider'
import { GrokProvider } from './providers/GrokProvider'
import { ClaudeProvider } from './providers/ClaudeProvider'
import { OpenAIProvider } from './providers/OpenAIProvider'
import { GLMProvider } from './providers/GLMProvider'

export class AIService {
    private providers: Map<AIProviderType, AIProvider> = new Map()
    private settings: AISettings

    constructor(settings: AISettings) {
        this.settings = settings
        this.initializeProviders()
    }

    /**
     * 모든 프로바이더 인스턴스 초기화
     */
    private initializeProviders(): void {
        this.providers.set('gemini', new GeminiProvider())
        this.providers.set('grok', new GrokProvider())
        this.providers.set('claude', new ClaudeProvider())
        this.providers.set('openai', new OpenAIProvider())
        this.providers.set('glm', new GLMProvider())
    }

    /**
     * 설정 업데이트
     */
    updateSettings(settings: AISettings): void {
        this.settings = settings
    }

    /**
     * 현재 선택된 프로바이더 가져오기
     */
    getCurrentProvider(): AIProvider | undefined {
        return this.providers.get(this.settings.provider)
    }

    /**
     * 특정 프로바이더 가져오기
     */
    getProvider(providerId: AIProviderType): AIProvider | undefined {
        return this.providers.get(providerId)
    }

    /**
     * 모든 프로바이더 설정 정보 가져오기
     */
    getAllProviderConfigs(): AIProviderConfig[] {
        return Object.values(AI_PROVIDERS)
    }

    /**
     * API 키가 설정된 프로바이더 목록 반환
     */
    getConfiguredProviders(): AIProviderType[] {
        return Object.entries(this.settings.apiKeys)
            .filter(([_, key]) => key && key.trim().length > 0)
            .map(([id]) => id as AIProviderType)
    }

    /**
     * 특정 프로바이더의 API 키가 설정되어 있는지 확인
     */
    isProviderConfigured(providerId: AIProviderType): boolean {
        const apiKey = this.settings.apiKeys[providerId]
        return !!apiKey && apiKey.trim().length > 0
    }

    /**
     * 프로바이더의 현재 모델명 반환
     */
    getModelForProvider(providerId: AIProviderType): string {
        if (this.settings.useCustomModel && this.settings.provider === providerId) {
            return this.settings.customModel || this.settings.models[providerId]
        }
        return this.settings.models[providerId]
    }

    /**
     * API 키 테스트
     */
    async testApiKey(providerId: AIProviderType, apiKey: string): Promise<{ success: boolean; error?: string }> {
        const provider = this.providers.get(providerId)
        if (!provider) {
            return { success: false, error: 'Provider not found' }
        }

        try {
            const isValid = await provider.testApiKey(apiKey)
            return { success: isValid, error: isValid ? undefined : 'Invalid API key' }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { success: false, error: errorMessage }
        }
    }

    /**
     * 텍스트 생성 (현재 선택된 프로바이더 사용)
     */
    async generateText(
        messages: AIMessage[],
        options?: AIRequestOptions
    ): Promise<AIProviderResponse> {
        const provider = this.getCurrentProvider()
        if (!provider) {
            return {
                success: false,
                content: '',
                error: 'No provider selected'
            }
        }

        const apiKey = this.settings.apiKeys[this.settings.provider]
        if (!apiKey) {
            return {
                success: false,
                content: '',
                error: `API key not configured for ${provider.name}`
            }
        }

        // 모델 설정
        const finalOptions: AIRequestOptions = {
            ...options,
            model: options?.model || this.getModelForProvider(this.settings.provider)
        }

        try {
            return await provider.generateText(messages, apiKey, finalOptions)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return {
                success: false,
                content: '',
                error: errorMessage
            }
        }
    }

    /**
     * 특정 프로바이더로 텍스트 생성
     */
    async generateTextWithProvider(
        providerId: AIProviderType,
        messages: AIMessage[],
        options?: AIRequestOptions
    ): Promise<AIProviderResponse> {
        const provider = this.providers.get(providerId)
        if (!provider) {
            return {
                success: false,
                content: '',
                error: 'Provider not found'
            }
        }

        const apiKey = this.settings.apiKeys[providerId]
        if (!apiKey) {
            return {
                success: false,
                content: '',
                error: `API key not configured for ${provider.name}`
            }
        }

        const finalOptions: AIRequestOptions = {
            ...options,
            model: options?.model || this.getModelForProvider(providerId)
        }

        try {
            return await provider.generateText(messages, apiKey, finalOptions)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return {
                success: false,
                content: '',
                error: errorMessage
            }
        }
    }

    /**
     * 간단한 프롬프트로 텍스트 생성 (헬퍼 메서드)
     */
    async simpleGenerate(
        userPrompt: string,
        systemPrompt?: string,
        options?: AIRequestOptions
    ): Promise<AIProviderResponse> {
        const messages: AIMessage[] = []

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt })
        }
        messages.push({ role: 'user', content: userPrompt })

        return this.generateText(messages, options)
    }

    /**
     * 웹 콘텐츠 요약용 헬퍼 메서드
     */
    async summarizeContent(
        content: string,
        language: string = '한국어',
        options?: AIRequestOptions
    ): Promise<AIProviderResponse> {
        const systemPrompt = `You are a helpful assistant that summarizes web content.
Always respond in ${language}.
Provide clear, concise summaries that capture the key points.`

        const userPrompt = `Please summarize the following content:\n\n${content}`

        return this.simpleGenerate(userPrompt, systemPrompt, options)
    }

    /**
     * 프로바이더 상태 정보 반환 (UI 표시용)
     */
    getProviderStatus(providerId: AIProviderType): {
        id: AIProviderType
        name: string
        displayName: string
        configured: boolean
        model: string
        isDefault: boolean
    } {
        const config = AI_PROVIDERS[providerId]
        return {
            id: providerId,
            name: config.name,
            displayName: config.displayName,
            configured: this.isProviderConfigured(providerId),
            model: this.getModelForProvider(providerId),
            isDefault: this.settings.provider === providerId
        }
    }

    /**
     * 모든 프로바이더 상태 정보 반환
     */
    getAllProviderStatus(): ReturnType<typeof this.getProviderStatus>[] {
        return (Object.keys(AI_PROVIDERS) as AIProviderType[]).map((id) =>
            this.getProviderStatus(id)
        )
    }
}

/**
 * 싱글톤 인스턴스 생성 헬퍼
 */
let aiServiceInstance: AIService | null = null

export function initializeAIService(settings: AISettings): AIService {
    aiServiceInstance = new AIService(settings)
    return aiServiceInstance
}

export function getAIService(): AIService | null {
    return aiServiceInstance
}

export function updateAIServiceSettings(settings: AISettings): void {
    if (aiServiceInstance) {
        aiServiceInstance.updateSettings(settings)
    }
}
