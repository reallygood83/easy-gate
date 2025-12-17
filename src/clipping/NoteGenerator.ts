/**
 * NoteGenerator - 옵시디언 노트 생성기
 *
 * 클리핑 데이터를 기반으로 마크다운 노트를 생성합니다.
 */

import { TFile, TFolder, Vault, normalizePath } from 'obsidian'
import { ClipData, ClippingSettings } from '../ai/types'
import { MetadataParser } from './MetadataParser'

export interface NoteGeneratorOptions {
    vault: Vault
    settings: ClippingSettings
}

export interface GeneratedNote {
    path: string
    content: string
    file?: TFile
}

/**
 * NoteGenerator 클래스
 */
export class NoteGenerator {
    private vault: Vault
    private settings: ClippingSettings

    constructor(options: NoteGeneratorOptions) {
        this.vault = options.vault
        this.settings = options.settings
    }

    /**
     * 클리핑 데이터로 노트 생성
     */
    async createNote(clipData: ClipData): Promise<GeneratedNote | null> {
        try {
            const filename = this.generateFilename(clipData)
            const content = this.generateNoteContent(clipData)
            const folderPath = normalizePath(this.settings.defaultFolder)

            // 폴더 생성 (없으면)
            await this.ensureFolder(folderPath)

            // 파일 경로
            const filePath = normalizePath(`${folderPath}/${filename}.md`)

            // 파일 생성
            const file = await this.vault.create(filePath, content)

            return {
                path: filePath,
                content,
                file
            }
        } catch (error) {
            console.error('[NoteGenerator] Failed to create note:', error)
            return null
        }
    }

    /**
     * 기존 노트에 클리핑 추가
     */
    async appendToNote(file: TFile, clipData: ClipData): Promise<boolean> {
        try {
            const clipBlock = this.generateClipBlock(clipData)
            const currentContent = await this.vault.read(file)
            const newContent = currentContent + '\n\n' + clipBlock

            await this.vault.modify(file, newContent)
            return true
        } catch (error) {
            console.error('[NoteGenerator] Failed to append to note:', error)
            return false
        }
    }

    /**
     * 여러 클리핑을 하나의 노트로 생성
     */
    async createMultiClipNote(clips: ClipData[], title: string): Promise<GeneratedNote | null> {
        try {
            const filename = this.sanitizeFilename(title)
            const content = this.generateMultiClipContent(clips, title)
            const folderPath = normalizePath(this.settings.defaultFolder)

            await this.ensureFolder(folderPath)

            const filePath = normalizePath(`${folderPath}/${filename}.md`)
            const file = await this.vault.create(filePath, content)

            return {
                path: filePath,
                content,
                file
            }
        } catch (error) {
            console.error('[NoteGenerator] Failed to create multi-clip note:', error)
            return null
        }
    }

    /**
     * 파일명 생성
     */
    private generateFilename(clipData: ClipData): string {
        let filename = this.settings.filenameFormat

        // 변수 치환
        filename = filename
            .replace('{title}', clipData.title || 'Untitled')
            .replace('{date}', MetadataParser.getCurrentDate())
            .replace('{site}', clipData.metadata?.siteName || 'unknown')

        return this.sanitizeFilename(filename)
    }

    /**
     * 파일명 정제 (특수문자 제거)
     */
    private sanitizeFilename(filename: string): string {
        return filename
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100) // 최대 100자
    }

    /**
     * 노트 콘텐츠 생성
     */
    private generateNoteContent(clipData: ClipData): string {
        const parts: string[] = []

        // YAML Frontmatter
        parts.push(this.generateFrontmatter(clipData))

        // 제목
        parts.push(`# ${clipData.title || 'Untitled'}`)
        parts.push('')

        // 본문
        if (clipData.content) {
            parts.push(clipData.content)
            parts.push('')
        }

        // 푸터
        parts.push('---')
        parts.push(this.generateFooter(clipData))

        return parts.join('\n')
    }

    /**
     * YAML Frontmatter 생성
     */
    private generateFrontmatter(clipData: ClipData): string {
        const frontmatter: string[] = ['---']

        if (this.settings.includeUrl && clipData.url) {
            frontmatter.push(`source: ${clipData.url}`)
        }

        if (this.settings.includeDate) {
            frontmatter.push(`clipped: ${clipData.clippedAt.split('T')[0]}`)
        }

        if (this.settings.includeAuthor && clipData.metadata?.author) {
            frontmatter.push(`author: ${clipData.metadata.author}`)
        }

        if (clipData.metadata?.siteName) {
            frontmatter.push(`site: ${clipData.metadata.siteName}`)
        }

        frontmatter.push('---')
        frontmatter.push('')

        return frontmatter.join('\n')
    }

    /**
     * 푸터 생성
     */
    private generateFooter(clipData: ClipData): string {
        const parts: string[] = []

        if (clipData.metadata?.siteName) {
            parts.push(`*출처: ${clipData.metadata.siteName}*`)
        }

        if (clipData.url) {
            parts.push(`*[원본 링크](${clipData.url})*`)
        }

        parts.push(`*클리핑 날짜: ${clipData.clippedAt.split('T')[0]}*`)

        return parts.join(' | ')
    }

    /**
     * gate-clip 코드블록 생성
     */
    private generateClipBlock(clipData: ClipData): string {
        const lines: string[] = ['```gate-clip']

        lines.push(`source: ${clipData.url}`)
        lines.push(`title: ${clipData.title || 'Untitled'}`)
        lines.push(`clipped: ${clipData.clippedAt.split('T')[0]}`)

        if (clipData.metadata?.author) {
            lines.push(`author: ${clipData.metadata.author}`)
        }

        if (clipData.metadata?.siteName) {
            lines.push(`site: ${clipData.metadata.siteName}`)
        }

        // 콘텐츠 (들여쓰기)
        lines.push('content: |')
        const contentLines = clipData.content.split('\n')
        contentLines.forEach((line) => {
            lines.push(`  ${line}`)
        })

        lines.push('```')

        return lines.join('\n')
    }

    /**
     * 여러 클리핑 노트 콘텐츠 생성
     */
    private generateMultiClipContent(clips: ClipData[], title: string): string {
        const parts: string[] = []

        // 제목
        parts.push(`# ${title}`)
        parts.push('')
        parts.push('## 수집된 클리핑')
        parts.push('')

        // 각 클리핑을 gate-clip 블록으로
        clips.forEach((clip) => {
            parts.push(this.generateClipBlock(clip))
            parts.push('')
        })

        // 분석 결과 섹션 (AI가 채울 영역)
        parts.push('## 분석 결과')
        parts.push('')
        parts.push('<!-- AI 분석 결과가 여기에 생성됩니다 -->')
        parts.push('')

        // 푸터
        parts.push('---')
        parts.push(`*생성일: ${MetadataParser.getCurrentDate()}*`)

        return parts.join('\n')
    }

    /**
     * 폴더 존재 확인 및 생성
     */
    private async ensureFolder(folderPath: string): Promise<void> {
        const folder = this.vault.getAbstractFileByPath(folderPath)

        if (!folder) {
            // 폴더가 없으면 생성
            await this.vault.createFolder(folderPath)
        } else if (!(folder instanceof TFolder)) {
            throw new Error(`${folderPath} exists but is not a folder`)
        }
    }

    /**
     * 고유 파일명 생성 (중복 시 번호 추가)
     */
    async getUniqueFilePath(basePath: string): Promise<string> {
        let path = basePath
        let counter = 1

        while (this.vault.getAbstractFileByPath(path)) {
            const ext = basePath.lastIndexOf('.')
            if (ext > 0) {
                path = `${basePath.substring(0, ext)} ${counter}${basePath.substring(ext)}`
            } else {
                path = `${basePath} ${counter}`
            }
            counter++
        }

        return path
    }
}
