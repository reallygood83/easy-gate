/**
 * ClaudeProvider - Anthropic Claude API Integration
 *
 * Anthropic Claude API를 통한 텍스트 생성을 구현합니다.
 * https://docs.anthropic.com/claude/reference
 */

import { BaseProvider } from './BaseProvider'
import {
    AIProviderType,
    AIProviderResponse,
    AIMessage,
    AIRequestOptions
} from '../types'

interface ClaudeMessage {
    role: 'user' | 'assistant'
    content: string
}

interface ClaudeRequest {
    model: string
    messages: ClaudeMessage[]
    system?: string
    max_tokens: number
    temperature?: number
}

interface ClaudeResponse {
    id: string
    type: string
    role: string
    content: {
        type: string
        text: string
    }[]
    model: string
    stop_reason: string
    stop_sequence: string | null
    usage: {
        input_tokens: number
        output_tokens: number
    }
    error?: {
        type: string
        message: string
    }
}

export class ClaudeProvider extends BaseProvider {
    readonly id: AIProviderType = 'claude'
    readonly name = 'Anthropic Claude'

    private readonly API_VERSION = '2023-06-01'

    /**
     * API 키 유효성 테스트
     */
    async testApiKey(apiKey: string): Promise<boolean> {
        try {
            const url = `${this.config.endpoint}/messages`

            const response = await this.makeRequest<ClaudeResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': this.API_VERSION,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.config.defaultModel,
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 10
                } as ClaudeRequest)
            })

            return !response.error && !!response.content
        } catch (error) {
            console.error('Claude API key test failed:', error)
            return false
        }
    }

    /**
     * 텍스트 생성
     */
    async generateText(
        messages: AIMessage[],
        apiKey: string,
        options?: AIRequestOptions
    ): Promise<AIProviderResponse> {
        const model = options?.model || this.config.defaultModel
        const url = `${this.config.endpoint}/messages`

        // Claude 형식으로 메시지 변환
        const { claudeMessages, systemPrompt } = this.convertMessages(messages)

        const requestBody: ClaudeRequest = {
            model,
            messages: claudeMessages,
            max_tokens: options?.maxTokens ?? 4096,
            temperature: options?.temperature ?? 0.7
        }

        // 시스템 프롬프트 추가
        if (systemPrompt) {
            requestBody.system = systemPrompt
        }

        try {
            const response = await this.makeRequest<ClaudeResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': this.API_VERSION,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (response.error) {
                return {
                    success: false,
                    content: '',
                    error: response.error.message,
                    errorCode: response.error.type
                }
            }

            if (!response.content || response.content.length === 0) {
                return {
                    success: false,
                    content: '',
                    error: 'No response generated'
                }
            }

            const generatedText = response.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('')

            return {
                success: true,
                content: generatedText,
                tokensUsed: response.usage
                    ? response.usage.input_tokens + response.usage.output_tokens
                    : undefined
            }
        } catch (error) {
            return this.handleError(error)
        }
    }

    /**
     * 메시지를 Claude 형식으로 변환
     */
    private convertMessages(messages: AIMessage[]): {
        claudeMessages: ClaudeMessage[]
        systemPrompt: string | null
    } {
        const claudeMessages: ClaudeMessage[] = []
        let systemPrompt: string | null = null

        for (const msg of messages) {
            if (msg.role === 'system') {
                // Claude는 시스템 프롬프트를 별도로 처리
                systemPrompt = msg.content
            } else {
                claudeMessages.push({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content
                })
            }
        }

        return { claudeMessages, systemPrompt }
    }
}
