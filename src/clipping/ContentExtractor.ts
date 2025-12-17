/**
 * ContentExtractor - 웹페이지 콘텐츠 추출기
 *
 * webview.executeJavaScript를 사용하여 페이지에서 콘텐츠를 추출합니다.
 * Readability 스타일의 콘텐츠 추출 로직을 구현합니다.
 */

export interface ExtractedContent {
    title: string
    content: string
    html?: string
    textContent: string
    excerpt?: string
    length: number
    siteName?: string
}

/**
 * 웹페이지에서 실행될 콘텐츠 추출 스크립트
 * 이 스크립트는 webview.executeJavaScript()로 실행됩니다.
 */
export const CONTENT_EXTRACTION_SCRIPT = `
(function() {
    // 제거할 요소들의 선택자
    const REMOVE_SELECTORS = [
        'script', 'style', 'noscript', 'iframe', 'svg',
        'header', 'footer', 'nav', 'aside',
        '.ad', '.ads', '.advertisement', '.sponsored',
        '.sidebar', '.navigation', '.menu', '.nav',
        '.comment', '.comments', '#comments',
        '.social', '.share', '.sharing',
        '[role="banner"]', '[role="navigation"]', '[role="complementary"]'
    ];

    // 메인 콘텐츠 선택자 (우선순위 순)
    const CONTENT_SELECTORS = [
        'article', '[role="main"]', 'main',
        '.post-content', '.article-content', '.entry-content',
        '.content', '#content', '.post', '.article'
    ];

    // 제목 추출
    function getTitle() {
        // Open Graph 제목
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) return ogTitle.getAttribute('content');

        // Twitter 제목
        const twitterTitle = document.querySelector('meta[name="twitter:title"]');
        if (twitterTitle) return twitterTitle.getAttribute('content');

        // H1 태그
        const h1 = document.querySelector('h1');
        if (h1) return h1.textContent.trim();

        // 문서 제목
        return document.title || '';
    }

    // 사이트 이름 추출
    function getSiteName() {
        const ogSiteName = document.querySelector('meta[property="og:site_name"]');
        if (ogSiteName) return ogSiteName.getAttribute('content');

        const hostname = window.location.hostname;
        return hostname.replace(/^www\\./, '');
    }

    // 메인 콘텐츠 요소 찾기
    function findMainContent() {
        for (const selector of CONTENT_SELECTORS) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim().length > 100) {
                return element.cloneNode(true);
            }
        }
        // 폴백: body 사용
        return document.body.cloneNode(true);
    }

    // 불필요한 요소 제거
    function cleanContent(element) {
        REMOVE_SELECTORS.forEach(selector => {
            element.querySelectorAll(selector).forEach(el => el.remove());
        });
        return element;
    }

    // 텍스트 정제
    function cleanText(text) {
        return text
            .replace(/\\s+/g, ' ')
            .replace(/\\n\\s*\\n/g, '\\n\\n')
            .trim();
    }

    // 발췌문 생성
    function getExcerpt(text, maxLength = 200) {
        const excerpt = text.substring(0, maxLength);
        const lastSpace = excerpt.lastIndexOf(' ');
        return lastSpace > 0 ? excerpt.substring(0, lastSpace) + '...' : excerpt + '...';
    }

    // 메인 추출 로직
    const mainContent = findMainContent();
    const cleanedContent = cleanContent(mainContent);
    const textContent = cleanText(cleanedContent.textContent || '');

    return {
        title: getTitle(),
        content: cleanedContent.innerHTML,
        textContent: textContent,
        excerpt: getExcerpt(textContent),
        length: textContent.length,
        siteName: getSiteName(),
        url: window.location.href
    };
})();
`

/**
 * 선택된 텍스트만 추출하는 스크립트
 */
export const SELECTION_EXTRACTION_SCRIPT = `
(function() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // 임시 컨테이너에 복사
    const container = document.createElement('div');
    container.appendChild(fragment);

    const text = selection.toString().trim();

    return {
        text: text,
        html: container.innerHTML,
        length: text.length,
        hasSelection: text.length > 0
    };
})();
`

/**
 * 페이지 URL 가져오기 스크립트
 */
export const GET_URL_SCRIPT = `window.location.href`

/**
 * ContentExtractor 클래스
 * Webview에서 콘텐츠를 추출하는 메서드들을 제공합니다.
 */
export class ContentExtractor {
    /**
     * 전체 페이지 콘텐츠 추출
     */
    static async extractPageContent(
        webview: Electron.WebviewTag
    ): Promise<ExtractedContent | null> {
        try {
            const result = await webview.executeJavaScript(CONTENT_EXTRACTION_SCRIPT)
            return result as ExtractedContent
        } catch (error) {
            console.error('[ContentExtractor] Failed to extract page content:', error)
            return null
        }
    }

    /**
     * 선택된 텍스트 추출
     */
    static async extractSelection(
        webview: Electron.WebviewTag
    ): Promise<{ text: string; html: string; length: number; hasSelection: boolean } | null> {
        try {
            const result = await webview.executeJavaScript(SELECTION_EXTRACTION_SCRIPT)
            return result
        } catch (error) {
            console.error('[ContentExtractor] Failed to extract selection:', error)
            return null
        }
    }

    /**
     * 현재 URL 가져오기
     */
    static async getCurrentUrl(webview: Electron.WebviewTag): Promise<string> {
        try {
            return await webview.executeJavaScript(GET_URL_SCRIPT)
        } catch (error) {
            console.error('[ContentExtractor] Failed to get URL:', error)
            return ''
        }
    }

    /**
     * 텍스트 정제 유틸리티
     */
    static cleanText(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim()
    }

    /**
     * HTML에서 텍스트만 추출
     */
    static htmlToText(html: string): string {
        // 간단한 HTML 태그 제거
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
    }

    /**
     * 콘텐츠 길이 계산 (토큰 추정)
     * 대략적으로 4글자당 1토큰으로 계산
     */
    static estimateTokens(text: string): number {
        return Math.ceil(text.length / 4)
    }
}
