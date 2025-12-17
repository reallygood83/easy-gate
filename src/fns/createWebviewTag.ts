import WebviewTag = Electron.WebviewTag
import { GateFrameOption } from '../GateOptions'
import getDefaultUserAgent from './getDefaultUserAgent'

// Constants for repeated strings
const DEFAULT_URL = 'about:blank'
const GOOGLE_URL = 'https://google.com'
const OPEN_GATE_WEBVIEW_CLASS = 'open-gate-webview'

export const createWebviewTag = (params: Partial<GateFrameOption>, onReady?: () => void, parentDoc?: Document): WebviewTag => {
    // Create a new webview tag using the parent document context
    const webviewTag = (parentDoc || document).createElement('webview') as unknown as WebviewTag

    // Set attributes for the webview tag
    webviewTag.setAttribute('partition', 'persist:' + params.profileKey)
    webviewTag.setAttribute('src', params.url ?? DEFAULT_URL)
    webviewTag.setAttribute('httpreferrer', params.url ?? GOOGLE_URL)
    webviewTag.setAttribute('allowpopups', 'true')
    // OAuth 로그인 지원을 위한 webpreferences 설정 (Google, X.com 등)
    // nodeIntegration=no: 보안을 위해 비활성화
    // contextIsolation=yes: 보안 유지
    // webSecurity=no: 크로스 오리진 OAuth 리다이렉트 허용
    webviewTag.setAttribute('webpreferences', 'nodeIntegration=no,contextIsolation=yes,webSecurity=no,allowRunningInsecureContent=yes')
    webviewTag.addClass(OPEN_GATE_WEBVIEW_CLASS)

    // Set user agent (use default Chrome UA if not provided to avoid bot detection)
    webviewTag.setAttribute('useragent', params.userAgent || getDefaultUserAgent())

    webviewTag.addEventListener('dom-ready', async () => {
        // Set zoom factor if provided
        if (params.zoomFactor) {
            webviewTag.setZoomFactor(params.zoomFactor)
        }

        if (params?.css) {
            await webviewTag.insertCSS(params.css)
        }

        if (params?.js) {
            await webviewTag.executeJavaScript(params.js)
        }

        onReady?.call(null)
    })

    return webviewTag
}
