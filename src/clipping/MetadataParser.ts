/**
 * MetadataParser - 웹페이지 메타데이터 파서
 *
 * Open Graph, Twitter Cards, JSON-LD 등에서 메타데이터를 추출합니다.
 */

export interface PageMetadata {
    title?: string
    description?: string
    author?: string
    date?: string
    siteName?: string
    image?: string
    url?: string
    type?: string
    tags?: string[]
    language?: string
}

/**
 * 메타데이터 추출 스크립트
 * webview.executeJavaScript()로 실행됩니다.
 */
export const METADATA_EXTRACTION_SCRIPT = `
(function() {
    function getMeta(name) {
        const el = document.querySelector('meta[name="' + name + '"]') ||
                   document.querySelector('meta[property="' + name + '"]');
        return el ? el.getAttribute('content') : null;
    }

    function getOG(property) {
        const el = document.querySelector('meta[property="og:' + property + '"]');
        return el ? el.getAttribute('content') : null;
    }

    function getTwitter(property) {
        const el = document.querySelector('meta[name="twitter:' + property + '"]');
        return el ? el.getAttribute('content') : null;
    }

    // JSON-LD 데이터 추출
    function getJsonLd() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
            try {
                const data = JSON.parse(script.textContent);
                if (data['@type'] === 'Article' || data['@type'] === 'NewsArticle' || data['@type'] === 'BlogPosting') {
                    return data;
                }
            } catch (e) {}
        }
        return null;
    }

    // 작성자 추출
    function getAuthor() {
        // JSON-LD
        const jsonLd = getJsonLd();
        if (jsonLd && jsonLd.author) {
            if (typeof jsonLd.author === 'string') return jsonLd.author;
            if (jsonLd.author.name) return jsonLd.author.name;
        }

        // Meta tags
        return getMeta('author') ||
               getMeta('article:author') ||
               getOG('article:author') ||
               null;
    }

    // 날짜 추출
    function getDate() {
        // JSON-LD
        const jsonLd = getJsonLd();
        if (jsonLd) {
            if (jsonLd.datePublished) return jsonLd.datePublished;
            if (jsonLd.dateCreated) return jsonLd.dateCreated;
        }

        // Meta tags
        return getMeta('article:published_time') ||
               getMeta('date') ||
               getMeta('DC.date') ||
               getOG('article:published_time') ||
               null;
    }

    // 태그/키워드 추출
    function getTags() {
        const keywords = getMeta('keywords');
        if (keywords) {
            return keywords.split(',').map(k => k.trim()).filter(k => k);
        }

        const jsonLd = getJsonLd();
        if (jsonLd && jsonLd.keywords) {
            if (Array.isArray(jsonLd.keywords)) return jsonLd.keywords;
            return jsonLd.keywords.split(',').map(k => k.trim());
        }

        return [];
    }

    return {
        title: getOG('title') || getTwitter('title') || document.title || null,
        description: getOG('description') || getTwitter('description') || getMeta('description') || null,
        author: getAuthor(),
        date: getDate(),
        siteName: getOG('site_name') || window.location.hostname.replace(/^www\\./, ''),
        image: getOG('image') || getTwitter('image') || null,
        url: getOG('url') || window.location.href,
        type: getOG('type') || 'webpage',
        tags: getTags(),
        language: document.documentElement.lang || getMeta('language') || null
    };
})();
`

/**
 * MetadataParser 클래스
 */
export class MetadataParser {
    /**
     * 웹뷰에서 메타데이터 추출
     */
    static async extractMetadata(webview: Electron.WebviewTag): Promise<PageMetadata | null> {
        try {
            const result = await webview.executeJavaScript(METADATA_EXTRACTION_SCRIPT)
            return this.normalizeMetadata(result)
        } catch (error) {
            console.error('[MetadataParser] Failed to extract metadata:', error)
            return null
        }
    }

    /**
     * 메타데이터 정규화
     */
    static normalizeMetadata(raw: PageMetadata): PageMetadata {
        return {
            title: this.cleanString(raw.title),
            description: this.cleanString(raw.description),
            author: this.cleanString(raw.author),
            date: this.normalizeDate(raw.date),
            siteName: this.cleanString(raw.siteName),
            image: raw.image || undefined,
            url: raw.url || undefined,
            type: raw.type || 'webpage',
            tags: raw.tags?.filter((t) => t && t.trim()) || [],
            language: raw.language || undefined
        }
    }

    /**
     * 문자열 정제
     */
    static cleanString(str?: string | null): string | undefined {
        if (!str) return undefined
        return str.trim().replace(/\s+/g, ' ')
    }

    /**
     * 날짜 정규화 (ISO 형식으로)
     */
    static normalizeDate(dateStr?: string | null): string | undefined {
        if (!dateStr) return undefined

        try {
            const date = new Date(dateStr)
            if (isNaN(date.getTime())) return dateStr

            // YYYY-MM-DD 형식으로 반환
            return date.toISOString().split('T')[0]
        } catch {
            return dateStr
        }
    }

    /**
     * 현재 날짜를 ISO 형식으로 반환
     */
    static getCurrentDate(): string {
        return new Date().toISOString().split('T')[0]
    }

    /**
     * 현재 타임스탬프를 ISO 형식으로 반환
     */
    static getCurrentTimestamp(): string {
        return new Date().toISOString()
    }

    /**
     * URL에서 도메인 추출
     */
    static extractDomain(url: string): string {
        try {
            const urlObj = new URL(url)
            return urlObj.hostname.replace(/^www\./, '')
        } catch {
            return ''
        }
    }

    /**
     * URL 정규화
     */
    static normalizeUrl(url: string): string {
        try {
            const urlObj = new URL(url)
            // 트래킹 파라미터 제거
            const removeParams = [
                'utm_source',
                'utm_medium',
                'utm_campaign',
                'utm_content',
                'utm_term',
                'ref',
                'source',
                'fbclid',
                'gclid'
            ]
            removeParams.forEach((param) => urlObj.searchParams.delete(param))
            return urlObj.toString()
        } catch {
            return url
        }
    }
}
