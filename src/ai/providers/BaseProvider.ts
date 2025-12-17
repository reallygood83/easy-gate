/**
 * BaseProvider - Abstract base class for all AI providers
 *
 * 모든 AI 프로바이더의 공통 기능을 제공합니다.
 */

import {
    AIProvider,
    AIProviderType,
    AIProviderConfig,
    AIProviderResponse,
    AIMessage,
    AIRequestOptions,
    AI_PROVIDERS
} from '../types'
import { requestUrl, RequestUrlParam } from 'obsidian'

export abstract class BaseProvider implements AIProvider {
    abstract readonly id: AIProviderType
    abstract readonly name: string

    get config(): AIProviderConfig {
        return AI_PROVIDERS[this.id]
    }

    /**
     * HTTP 요청 헬퍼 (Obsidian의 requestUrl 사용)
     */
    protected async makeRequest<T>(
        url: string,
        options: RequestUrlParam
    ): Promise<T> {
        try {
            const response = await requestUrl(options)
            return response.json as T
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`API request failed: ${error.message}`)
            }
            throw error
        }
    }

    /**
     * 공통 에러 핸들링
     */
    protected handleError(error: unknown): AIProviderResponse {
        let errorMessage = 'Unknown error occurred'

        if (error instanceof Error) {
            errorMessage = error.message
        } else if (typeof error === 'string') {
            errorMessage = error
        }

        // 일반적인 API 에러 메시지 파싱
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            return {
                success: false,
                content: '',
                error: 'Invalid API key. Please check your API key in settings.',
                errorCode: 'UNAUTHORIZED'
            }
        }

        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            return {
                success: false,
                content: '',
                error: 'Rate limit exceeded. Please wait a moment and try again.',
                errorCode: 'RATE_LIMIT'
            }
        }

        if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            return {
                success: false,
                content: '',
                error: 'Request timed out. Please try again.',
                errorCode: 'TIMEOUT'
            }
        }

        return {
            success: false,
            content: '',
            error: errorMessage,
            errorCode: 'UNKNOWN'
        }
    }

    /**
     * 토큰 수 추정 (간단한 추정)
     */
    protected estimateTokens(text: string): number {
        // 간단한 추정: 평균적으로 1 토큰 = 4 문자 (영어 기준)
        // 한국어는 더 많은 토큰을 사용하므로 1.5배 적용
        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text)
        const multiplier = hasKorean ? 1.5 : 1
        return Math.ceil((text.length / 4) * multiplier)
    }

    /**
     * API 키 테스트 (서브클래스에서 구현)
     */
    abstract testApiKey(apiKey: string): Promise<boolean>

    /**
     * 텍스트 생성 (서브클래스에서 구현)
     */
    abstract generateText(
        messages: AIMessage[],
        apiKey: string,
        options?: AIRequestOptions
    ): Promise<AIProviderResponse>
}
