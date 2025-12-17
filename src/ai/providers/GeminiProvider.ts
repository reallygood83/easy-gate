/**
 * GeminiProvider - Google Gemini API Integration
 *
 * Google Gemini API를 통한 텍스트 생성을 구현합니다.
 * https://ai.google.dev/docs
 */

import { BaseProvider } from './BaseProvider'
import {
    AIProviderType,
    AIProviderResponse,
    AIMessage,
    AIRequestOptions
} from '../types'

interface GeminiContent {
    parts: { text: string }[]
    role: 'user' | 'model'
}

interface GeminiRequest {
    contents: GeminiContent[]
    generationConfig?: {
        temperature?: number
        maxOutputTokens?: number
        topP?: number
        topK?: number
    }
    systemInstruction?: {
        parts: { text: string }[]
    }
}

interface GeminiResponse {
    candidates?: {
        content: {
            parts: { text: string }[]
            role: string
        }
        finishReason: string
    }[]
    usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
    }
    error?: {
        code: number
        message: string
        status: string
    }
}

export class GeminiProvider extends BaseProvider {
    readonly id: AIProviderType = 'gemini'
    readonly name = 'Google Gemini'

    /**
     * API 키 유효성 테스트
     */
    async testApiKey(apiKey: string): Promise<boolean> {
        try {
            const model = this.config.defaultModel
            const url = `${this.config.endpoint}/models/${model}:generateContent?key=${apiKey}`

            const response = await this.makeRequest<GeminiResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hello' }], role: 'user' }]
                } as GeminiRequest)
            })

            // 에러가 없거나 candidates가 있으면 성공
            return !response.error && !!response.candidates
        } catch (error) {
            console.error('Gemini API key test failed:', error)
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
        const url = `${this.config.endpoint}/models/${model}:generateContent?key=${apiKey}`

        // Gemini 형식으로 메시지 변환
        const { contents, systemInstruction } = this.convertMessages(messages)

        const requestBody: GeminiRequest = {
            contents,
            generationConfig: {
                temperature: options?.temperature ?? 0.7,
                maxOutputTokens: options?.maxTokens ?? 4096,
                topP: 0.95,
                topK: 40
            }
        }

        // 시스템 프롬프트 추가
        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            }
        }

        try {
            const response = await this.makeRequest<GeminiResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            if (response.error) {
                return {
                    success: false,
                    content: '',
                    error: response.error.message,
                    errorCode: response.error.status
                }
            }

            if (!response.candidates || response.candidates.length === 0) {
                return {
                    success: false,
                    content: '',
                    error: 'No response generated'
                }
            }

            const generatedText = response.candidates[0].content.parts
                .map((part) => part.text)
                .join('')

            return {
                success: true,
                content: generatedText,
                tokensUsed: response.usageMetadata?.totalTokenCount
            }
        } catch (error) {
            return this.handleError(error)
        }
    }

    /**
     * 메시지를 Gemini 형식으로 변환
     */
    private convertMessages(messages: AIMessage[]): {
        contents: GeminiContent[]
        systemInstruction: string | null
    } {
        const contents: GeminiContent[] = []
        let systemInstruction: string | null = null

        for (const msg of messages) {
            if (msg.role === 'system') {
                // Gemini는 시스템 프롬프트를 별도로 처리
                systemInstruction = msg.content
            } else {
                contents.push({
                    parts: [{ text: msg.content }],
                    role: msg.role === 'assistant' ? 'model' : 'user'
                })
            }
        }

        return { contents, systemInstruction }
    }
}
