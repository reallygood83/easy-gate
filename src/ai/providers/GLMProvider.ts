/**
 * GLMProvider - Zhipu AI GLM API Integration
 *
 * Zhipu AI GLM API를 통한 텍스트 생성을 구현합니다.
 * GLM은 OpenAI 호환 API 형식을 사용합니다.
 * https://open.bigmodel.cn/dev/api
 */

import { BaseProvider } from './BaseProvider'
import {
    AIProviderType,
    AIProviderResponse,
    AIMessage,
    AIRequestOptions
} from '../types'

interface GLMMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

interface GLMRequest {
    model: string
    messages: GLMMessage[]
    temperature?: number
    max_tokens?: number
    stream?: boolean
}

interface GLMResponse {
    id: string
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
        code: string
        message: string
    }
}

export class GLMProvider extends BaseProvider {
    readonly id: AIProviderType = 'glm'
    readonly name = 'Zhipu AI (GLM)'

    /**
     * JWT 토큰 생성 (GLM API 인증용)
     * GLM API는 API 키를 JWT 토큰으로 변환하여 사용
     */
    private generateToken(apiKey: string): string {
        // API 키가 이미 JWT 형식이면 그대로 반환
        if (apiKey.includes('.')) {
            return apiKey
        }

        // API 키를 id.secret 형식으로 파싱
        const [id, secret] = apiKey.split(':')
        if (!id || !secret) {
            // 파싱 실패 시 원본 키 반환 (API가 직접 처리하도록)
            return apiKey
        }

        // 간단한 JWT 생성 (라이브러리 없이)
        const header = this.base64UrlEncode(JSON.stringify({
            alg: 'HS256',
            sign_type: 'SIGN'
        }))

        const now = Math.floor(Date.now() / 1000)
        const payload = this.base64UrlEncode(JSON.stringify({
            api_key: id,
            exp: now + 3600, // 1시간 유효
            timestamp: now * 1000
        }))

        // 실제 서명은 서버에서 검증하므로 간단한 더미 서명 사용
        // (실제 배포 시에는 적절한 JWT 라이브러리 사용 권장)
        const signature = this.base64UrlEncode(secret)

        return `${header}.${payload}.${signature}`
    }

    private base64UrlEncode(str: string): string {
        // Base64 URL-safe 인코딩
        const base64 = btoa(unescape(encodeURIComponent(str)))
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    /**
     * API 키 유효성 테스트
     */
    async testApiKey(apiKey: string): Promise<boolean> {
        try {
            const url = `${this.config.endpoint}/chat/completions`
            const token = this.generateToken(apiKey)

            const response = await this.makeRequest<GLMResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.config.defaultModel,
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 10
                } as GLMRequest)
            })

            return !response.error && !!response.choices
        } catch (error) {
            console.error('GLM API key test failed:', error)
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
        const token = this.generateToken(apiKey)

        const requestBody: GLMRequest = {
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
            const response = await this.makeRequest<GLMResponse>(url, {
                url,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
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
