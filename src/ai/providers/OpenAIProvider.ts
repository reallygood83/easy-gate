/**
 * OpenAIProvider - OpenAI API Integration
 *
 * OpenAI API를 통한 텍스트 생성을 구현합니다.
 * https://platform.openai.com/docs
 */

import { BaseProvider } from './BaseProvider'
import {
    AIProviderType,
    AIProviderResponse,
    AIMessage,
    AIRequestOptions
} from '../types'

interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

interface OpenAIRequest {
    model: string
    messages: OpenAIMessage[]
    temperature?: number
    max_tokens?: number
    stream?: boolean
}

interface OpenAIResponse {
    id: string
    object: string
    created: number
    model: string
    choices: {
        index: number
        message: {
            role: string
            content: string
        }
        finish_reason: string
    }[]
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
    error?: {
        message: string
        type: string
        code: string
    }
}

export class OpenAIProvider extends BaseProvider {
    readonly id: AIProviderType = 'openai'
    readonly name = 'OpenAI'

    /**
     * API 키 유효성 테스트
     */
    async testApiKey(apiKey: string): Promise<boolean> {
        try {
            const url = `${this.config.endpoint}/models`

            const response = await this.makeRequest<{ data?: unknown[]; error?: unknown }>(url, {
                url,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            })

            return !!response.data && !response.error
        } catch (error) {
            console.error('OpenAI API key test failed:', error)
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
        const url = `${this.config.endpoint}/chat/completions`

        const requestBody: OpenAIRequest = {
            model,
            messages: messages.map((msg) => ({
                role: msg.role,
                content: msg.content
            })),
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 4096,
            stream: false
        }

        try {
            const response = await this.makeRequest<OpenAIResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (response.error) {
                return {
                    success: false,
                    content: '',
                    error: response.error.message,
                    errorCode: response.error.code
                }
            }

            if (!response.choices || response.choices.length === 0) {
                return {
                    success: false,
                    content: '',
                    error: 'No response generated'
                }
            }

            const generatedText = response.choices[0].message.content

            return {
                success: true,
                content: generatedText,
                tokensUsed: response.usage?.total_tokens
            }
        } catch (error) {
            return this.handleError(error)
        }
    }
}
