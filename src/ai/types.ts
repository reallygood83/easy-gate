/**
 * AI Feature Types for Easy Gate v2.0
 *
 * 이 파일은 AI 기능에 필요한 모든 타입 정의를 포함합니다.
 */

// ============================================
// AI Provider Types
// ============================================

export type AIProviderType = 'gemini' | 'grok' | 'claude' | 'openai' | 'glm'

export interface AIProviderConfig {
    id: AIProviderType
    name: string
    displayName: string
    defaultModel: string
    endpoint: string
    apiKeyPrefix?: string // API 키 형식 검증용 (예: 'sk-', 'AIza')
}

export const AI_PROVIDERS: Record<AIProviderType, AIProviderConfig> = {
    gemini: {
        id: 'gemini',
        name: 'Google Gemini',
        displayName: 'Gemini',
        defaultModel: 'gemini-2.5-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        apiKeyPrefix: 'AIza'
    },
    grok: {
        id: 'grok',
        name: 'xAI Grok',
        displayName: 'Grok',
        defaultModel: 'grok-4-1-fast',
        endpoint: 'https://api.x.ai/v1'
    },
    claude: {
        id: 'claude',
        name: 'Anthropic Claude',
        displayName: 'Claude',
        defaultModel: 'claude-sonnet-4-5-20241022',
        endpoint: 'https://api.anthropic.com/v1'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        displayName: 'OpenAI',
        defaultModel: 'gpt-5',
        endpoint: 'https://api.openai.com/v1',
        apiKeyPrefix: 'sk-'
    },
    glm: {
        id: 'glm',
        name: 'Zhipu AI (GLM)',
        displayName: 'GLM',
        defaultModel: 'glm-4.6',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4'
    }
}

// ============================================
// AI Settings Types
// ============================================

export interface AISettings {
    provider: AIProviderType
    apiKeys: Partial<Record<AIProviderType, string>>
    models: Record<AIProviderType, string>
    useCustomModel: boolean
    customModel: string
    defaultLanguage: string
    defaultTemplate: string
    autoTags: boolean
}

export const DEFAULT_AI_SETTINGS: AISettings = {
    provider: 'gemini',
    apiKeys: {},
    models: {
        gemini: 'gemini-2.5-flash',
        grok: 'grok-4-1-fast',
        claude: 'claude-sonnet-4-5-20241022',
        openai: 'gpt-5',
        glm: 'glm-4.6'
    },
    useCustomModel: false,
    customModel: '',
    defaultLanguage: '한국어',
    defaultTemplate: 'basic-summary',
    autoTags: true
}

// ============================================
// Clipping Settings Types
// ============================================

export interface ClippingSettings {
    defaultFolder: string
    filenameFormat: string
    includeUrl: boolean
    includeDate: boolean
    includeAuthor: boolean
    includeHtml: boolean
}

export const DEFAULT_CLIPPING_SETTINGS: ClippingSettings = {
    defaultFolder: 'Clippings',
    filenameFormat: '{title} - {date}',
    includeUrl: true,
    includeDate: true,
    includeAuthor: true,
    includeHtml: false
}

// ============================================
// Saved Prompt Types
// ============================================

export interface SavedPrompt {
    id: string
    name: string
    prompt: string
}

// ============================================
// Clip Data Types
// ============================================

export interface ClipMetadata {
    author?: string
    date?: string
    siteName?: string
    description?: string
    image?: string
}

export interface ClipData {
    id: string
    url: string
    title: string
    content: string
    html?: string
    metadata: ClipMetadata
    clippedAt: string
    gateId: string
}

// ============================================
// AI Request/Response Types
// ============================================

export interface AIMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface AIRequestOptions {
    model?: string
    temperature?: number
    maxTokens?: number
    stream?: boolean
}

export interface AIRequest {
    clips: ClipData[]
    template: string
    customPrompt?: string
    additionalInstructions?: string
    outputFormat: 'markdown' | 'plain'
    language: string
}

export interface AIResponseMetadata {
    tokensUsed: number
    processingTime: number
    model: string
    provider: AIProviderType
}

export interface AIResponse {
    success: boolean
    content: string
    metadata: AIResponseMetadata
    suggestedTags?: string[]
    suggestedTitle?: string
    error?: string
}

// ============================================
// Provider Interface
// ============================================

export interface AIProvider {
    readonly id: AIProviderType
    readonly name: string
    readonly config: AIProviderConfig

    /**
     * API 키 유효성 테스트
     */
    testApiKey(apiKey: string): Promise<boolean>

    /**
     * 단일 텍스트 생성
     */
    generateText(
        messages: AIMessage[],
        apiKey: string,
        options?: AIRequestOptions
    ): Promise<AIProviderResponse>

    /**
     * 스트리밍 텍스트 생성 (선택적)
     */
    generateTextStream?(
        messages: AIMessage[],
        apiKey: string,
        onChunk: (chunk: string) => void,
        options?: AIRequestOptions
    ): Promise<AIProviderResponse>
}

export interface AIProviderResponse {
    success: boolean
    content: string
    tokensUsed?: number
    error?: string
    errorCode?: string
}

// ============================================
// Progress & Status Types
// ============================================

export type ProcessStatus = 'idle' | 'extracting' | 'generating' | 'creating' | 'completed' | 'error'

export interface ProcessState {
    status: ProcessStatus
    progress: number // 0-100
    currentStep: string
    steps: ProcessStep[]
    startTime?: number
    estimatedTime?: number
    error?: string
}

export interface ProcessStep {
    id: string
    label: string
    status: 'pending' | 'in_progress' | 'completed' | 'error'
}

// ============================================
// Template Types
// ============================================

export type TemplateType = 'basic-summary' | 'study-note' | 'analysis-report' | 'idea-note' | 'multi-source'

export interface Template {
    id: TemplateType
    name: string
    icon: string
    description: string
    systemPrompt: string
    userPromptTemplate: string
}

// ============================================
// Event Types (for UI updates)
// ============================================

export interface AIProgressEvent {
    type: 'progress'
    progress: number
    step: string
}

export interface AICompleteEvent {
    type: 'complete'
    response: AIResponse
    notePath?: string
}

export interface AIErrorEvent {
    type: 'error'
    error: string
    recoverable: boolean
}

export type AIEvent = AIProgressEvent | AICompleteEvent | AIErrorEvent
