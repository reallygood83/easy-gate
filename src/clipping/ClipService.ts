/**
 * ClipService - 웹 클리핑 서비스
 *
 * 콘텐츠 추출, 메타데이터 파싱, 노트 생성을 통합 관리합니다.
 * 원클릭 클리핑의 핵심 로직을 담당합니다.
 */

import { Vault, TFile } from 'obsidian'
import { ContentExtractor, ExtractedContent } from './ContentExtractor'
import { MetadataParser, PageMetadata } from './MetadataParser'
import { NoteGenerator, GeneratedNote } from './NoteGenerator'
import { ClipData, ClippingSettings, DEFAULT_CLIPPING_SETTINGS } from '../ai/types'

export interface ClipServiceOptions {
    vault: Vault
    settings?: ClippingSettings
}

export interface ClipResult {
    success: boolean
    clipData?: ClipData
    note?: GeneratedNote
    error?: string
}

/**
 * 고유 ID 생성
 */
function generateClipId(): string {
    return `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * ClipService 클래스
 */
export class ClipService {
    private vault: Vault
    private settings: ClippingSettings
    private noteGenerator: NoteGenerator

    constructor(options: ClipServiceOptions) {
        this.vault = options.vault
        this.settings = options.settings || DEFAULT_CLIPPING_SETTINGS
        this.noteGenerator = new NoteGenerator({
            vault: this.vault,
            settings: this.settings
        })
    }

    /**
     * 설정 업데이트
     */
    updateSettings(settings: ClippingSettings): void {
        this.settings = settings
        this.noteGenerator = new NoteGenerator({
            vault: this.vault,
            settings: this.settings
        })
    }

    /**
     * 원클릭 클리핑 - 전체 페이지
     */
    async clipPage(webview: Electron.WebviewTag, gateId: string): Promise<ClipResult> {
        try {
            // 1. 콘텐츠 추출
            const content = await ContentExtractor.extractPageContent(webview)
            if (!content) {
                return { success: false, error: 'Failed to extract content' }
            }

            // 2. 메타데이터 추출
            const metadata = await MetadataParser.extractMetadata(webview)

            // 3. ClipData 생성
            const clipData = this.createClipData(content, metadata, gateId)

            // 4. 노트 생성
            const note = await this.noteGenerator.createNote(clipData)
            if (!note) {
                return { success: false, error: 'Failed to create note', clipData }
            }

            return { success: true, clipData, note }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { success: false, error: errorMessage }
        }
    }

    /**
     * 선택 텍스트 클리핑
     */
    async clipSelection(webview: Electron.WebviewTag, gateId: string): Promise<ClipResult> {
        try {
            // 1. 선택 텍스트 추출
            const selection = await ContentExtractor.extractSelection(webview)
            if (!selection || !selection.hasSelection) {
                return { success: false, error: 'No text selected' }
            }

            // 2. 메타데이터 추출 (페이지 정보)
            const metadata = await MetadataParser.extractMetadata(webview)

            // 3. ClipData 생성
            const clipData: ClipData = {
                id: generateClipId(),
                url: metadata?.url || (await ContentExtractor.getCurrentUrl(webview)),
                title: metadata?.title || 'Selection',
                content: selection.text,
                html: this.settings.includeHtml ? selection.html : undefined,
                metadata: {
                    author: metadata?.author,
                    date: metadata?.date,
                    siteName: metadata?.siteName,
                    description: metadata?.description,
                    image: metadata?.image
                },
                clippedAt: MetadataParser.getCurrentTimestamp(),
                gateId
            }

            // 4. 노트 생성
            const note = await this.noteGenerator.createNote(clipData)
            if (!note) {
                return { success: false, error: 'Failed to create note', clipData }
            }

            return { success: true, clipData, note }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { success: false, error: errorMessage }
        }
    }

    /**
     * 기존 노트에 클리핑 추가
     */
    async clipToNote(
        webview: Electron.WebviewTag,
        gateId: string,
        targetFile: TFile
    ): Promise<ClipResult> {
        try {
            // 콘텐츠 추출
            const content = await ContentExtractor.extractPageContent(webview)
            if (!content) {
                return { success: false, error: 'Failed to extract content' }
            }

            // 메타데이터 추출
            const metadata = await MetadataParser.extractMetadata(webview)

            // ClipData 생성
            const clipData = this.createClipData(content, metadata, gateId)

            // 기존 노트에 추가
            const appended = await this.noteGenerator.appendToNote(targetFile, clipData)
            if (!appended) {
                return { success: false, error: 'Failed to append to note', clipData }
            }

            return {
                success: true,
                clipData,
                note: { path: targetFile.path, content: '', file: targetFile }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { success: false, error: errorMessage }
        }
    }

    /**
     * 데이터만 추출 (노트 생성 없이)
     */
    async extractOnly(webview: Electron.WebviewTag, gateId: string): Promise<ClipData | null> {
        try {
            const content = await ContentExtractor.extractPageContent(webview)
            if (!content) return null

            const metadata = await MetadataParser.extractMetadata(webview)
            return this.createClipData(content, metadata, gateId)
        } catch (error) {
            console.error('[ClipService] Extract failed:', error)
            return null
        }
    }

    /**
     * 선택 텍스트만 추출
     */
    async extractSelectionOnly(
        webview: Electron.WebviewTag,
        gateId: string
    ): Promise<ClipData | null> {
        try {
            const selection = await ContentExtractor.extractSelection(webview)
            if (!selection || !selection.hasSelection) return null

            const metadata = await MetadataParser.extractMetadata(webview)
            const url = await ContentExtractor.getCurrentUrl(webview)

            return {
                id: generateClipId(),
                url: metadata?.url || url,
                title: `Selection from ${metadata?.title || 'page'}`,
                content: selection.text,
                html: this.settings.includeHtml ? selection.html : undefined,
                metadata: {
                    author: metadata?.author,
                    date: metadata?.date,
                    siteName: metadata?.siteName,
                    description: metadata?.description,
                    image: metadata?.image
                },
                clippedAt: MetadataParser.getCurrentTimestamp(),
                gateId
            }
        } catch (error) {
            console.error('[ClipService] Extract selection failed:', error)
            return null
        }
    }

    /**
     * ClipData 생성 헬퍼
     */
    private createClipData(
        content: ExtractedContent,
        metadata: PageMetadata | null,
        gateId: string
    ): ClipData {
        return {
            id: generateClipId(),
            url: metadata?.url || '',
            title: content.title || metadata?.title || 'Untitled',
            content: content.textContent,
            html: this.settings.includeHtml ? content.content : undefined,
            metadata: {
                author: metadata?.author,
                date: metadata?.date,
                siteName: content.siteName || metadata?.siteName,
                description: metadata?.description,
                image: metadata?.image
            },
            clippedAt: MetadataParser.getCurrentTimestamp(),
            gateId
        }
    }

    /**
     * 토큰 추정
     */
    estimateTokens(text: string): number {
        return ContentExtractor.estimateTokens(text)
    }

    /**
     * 콘텐츠 길이 정보
     */
    getContentStats(content: string): { chars: number; words: number; tokens: number } {
        const chars = content.length
        const words = content.split(/\s+/).filter((w) => w).length
        const tokens = this.estimateTokens(content)

        return { chars, words, tokens }
    }
}

/**
 * 싱글톤 인스턴스 관리
 */
let clipServiceInstance: ClipService | null = null

export function initializeClipService(options: ClipServiceOptions): ClipService {
    clipServiceInstance = new ClipService(options)
    return clipServiceInstance
}

export function getClipService(): ClipService | null {
    return clipServiceInstance
}

export function updateClipServiceSettings(settings: ClippingSettings): void {
    if (clipServiceInstance) {
        clipServiceInstance.updateSettings(settings)
    }
}
