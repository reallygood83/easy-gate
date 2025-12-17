import { ItemView, WorkspaceLeaf, Menu, Notice, MarkdownView, setIcon, ButtonComponent, TextComponent, DropdownComponent } from 'obsidian'
import { createWebviewTag } from './fns/createWebviewTag'
import { Platform } from 'obsidian'
import { createIframe } from './fns/createIframe'
import { clipboard } from 'electron'
import WebviewTag = Electron.WebviewTag
import { GateFrameOption } from './GateOptions'
import OpenGatePlugin from './main'
import { GatePopupModal } from './GatePopupModal'
import { normalizeGateOption } from './fns/normalizeGateOption'

export class GateView extends ItemView {
    private readonly options: GateFrameOption
    private frame: WebviewTag | HTMLIFrameElement
    private readonly useIframe: boolean = false
    private frameReadyCallbacks: Function[]
    private isFrameReady: boolean = false
    private frameDoc: Document
    private plugin: OpenGatePlugin
    private topBarEl: HTMLElement
    private insertMode: 'cursor' | 'bottom' | 'new' = 'cursor'
    // 현재 활성화된 게이트 상태 추적 (readonly options 대신 사용)
    private currentGateState: { id: string; url: string; title: string }

    constructor(leaf: WorkspaceLeaf, options: GateFrameOption, plugin: OpenGatePlugin) {
        super(leaf)
        this.navigation = false
        this.options = options
        this.plugin = plugin
        this.useIframe = Platform.isMobileApp
        this.frameReadyCallbacks = []
        // 초기 상태 설정
        this.currentGateState = { id: options.id, url: options.url, title: options.title }
    }

    addActions(): void {
        this.addAction('refresh-ccw', 'Reload', () => {
            if (this.frame instanceof HTMLIFrameElement) {
                this.frame.contentWindow?.location.reload()
            } else {
                this.frame.reload()
            }
        })

        this.addAction('home', 'Home page', () => {
            this.navigateTo(this.options?.url ?? 'about:blank')
        })
    }

    isWebviewFrame(): boolean {
        return this.frame! instanceof HTMLIFrameElement
    }

    onload(): void {
        super.onload()
        this.addActions()

        this.contentEl.empty()
        this.contentEl.addClass('open-gate-view')

        // Create Top Bar (Tabs + Controls)
        this.drawTopBar()

        this.frameDoc = this.contentEl.doc
        this.createFrame()
    }

    private drawTopBar(): void {
        this.topBarEl = this.contentEl.createDiv({ cls: 'gate-top-bar' });

        // 1. Tab Bar (Gate Switcher)
        const tabBar = this.topBarEl.createDiv({ cls: 'gate-tab-bar' });
        this.renderTabBar(tabBar);

        // 2. Control Row (Address + Actions)
        const controlRow = this.topBarEl.createDiv({ cls: 'gate-control-row' });

        // Navigation Buttons
        new ButtonComponent(controlRow)
            .setIcon('arrow-left')
            .setTooltip('Back')
            .onClick(() => {
                if (!this.useIframe && (this.frame as WebviewTag).canGoBack()) {
                    (this.frame as WebviewTag).goBack();
                }
            });

        new ButtonComponent(controlRow)
            .setIcon('arrow-right')
            .setTooltip('Forward')
            .onClick(() => {
                if (!this.useIframe && (this.frame as WebviewTag).canGoForward()) {
                    (this.frame as WebviewTag).goForward();
                }
            });

        // Address Bar
        const addressInput = new TextComponent(controlRow);
        addressInput.setPlaceholder('https://...');
        addressInput.inputEl.addClass('gate-address-input');
        addressInput.setValue(this.options.url);
        addressInput.inputEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const url = addressInput.getValue();
                if (url) {
                    await this.handleAddressEnter(url);
                }
            }
        });

        // Current URL Listener to update address bar
        this.onFrameReady(() => {
            if (!this.useIframe) {
                (this.frame as WebviewTag).addEventListener('did-navigate', (e) => {
                    addressInput.setValue(e.url);
                });
                (this.frame as WebviewTag).addEventListener('did-navigate-in-page', (e) => {
                    addressInput.setValue(e.url);
                });
            }
        });

        // Tools Divider
        controlRow.createSpan({ cls: 'gate-divider' });

        // Insert To Dropdown
        const drop = new DropdownComponent(controlRow);
        drop.addOption('cursor', 'Insert to: Cursor');
        drop.addOption('bottom', 'Insert to: Bottom');
        drop.addOption('new', 'Insert to: New Note');
        drop.setValue('cursor');
        drop.onChange((val) => this.insertMode = val as any);

        // Apply Button
        new ButtonComponent(controlRow)
            .setIcon('download')
            .setTooltip('Apply Selection')
            .setButtonText('Apply')
            .onClick(() => this.onApplyText());
    }

    private renderTabBar(container: HTMLElement) {
        container.empty();
        const gates = this.plugin.settings.gates;

        for (const id in gates) {
            const gate = gates[id];
            const tab = container.createDiv({ cls: 'gate-tab' });
            // currentGateState를 사용하여 활성 탭 표시 (readonly options 수정 방지)
            if (gate.id === this.currentGateState.id) tab.addClass('active');

            // Icon
            const iconContainer = tab.createSpan({ cls: 'gate-tab-icon' });
            setIcon(iconContainer, gate.icon || 'globe');

            // Title
            tab.createSpan({ text: gate.title, cls: 'gate-tab-title' });

            // Close button (X) - 각 탭에 삭제 버튼 추가
            const closeBtn = tab.createSpan({ cls: 'gate-tab-close' });
            setIcon(closeBtn, 'x');
            closeBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 탭 클릭 이벤트 전파 방지
                const confirmDelete = confirm(`"${gate.title}" 게이트를 삭제하시겠습니까?`);
                if (confirmDelete) {
                    await this.plugin.removeGate(gate.id);
                    this.renderTabBar(container);
                    new Notice(`"${gate.title}" 게이트가 삭제되었습니다.`);
                }
            });

            tab.addEventListener('click', () => {
                this.navigateTo(gate.url);
                // currentGateState 업데이트 (readonly options 대신)
                this.currentGateState.url = gate.url;
                this.currentGateState.id = gate.id;
                this.currentGateState.title = gate.title;
                this.renderTabBar(container); // Re-render to update active state
            });
        }
    }

    async handleAddressEnter(url: string) {
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        // Check if exists
        const existing = this.plugin.findGateBy('url', url);
        if (existing) {
            this.navigateTo(existing.url);
            new Notice(`Switched to ${existing.title}`);
        } else {
            // Create New Gate
            const domain = new URL(url).hostname;
            const newGate = normalizeGateOption({
                id: Math.random().toString(36).substring(2, 15),
                title: domain,
                url: url,
                icon: 'globe'
            });
            // We need to cast id as string if normalize expects it.

            // Actually generateUuid is private in main.ts. 
            // Ideally we expose it or Duplicate logic.
            newGate.id = Math.random().toString(36).substring(2, 10);

            await this.plugin.addGate(newGate);
            new Notice(`New Gate Created: ${domain}`);

            // Refresh Tab bar
            const bar = this.topBarEl.querySelector('.gate-tab-bar') as HTMLElement;
            if (bar) this.renderTabBar(bar);

            this.navigateTo(url);
        }
    }

    navigateTo(url: string) {
        if (this.frame instanceof HTMLIFrameElement) {
            this.frame.src = url;
        } else {
            this.frame.loadURL(url);
        }
    }

    async onApplyText() {
        let text = '';
        if (this.frame instanceof HTMLIFrameElement) {
            // Cannot easily get selection from cross-origin iframe
            new Notice("Cannot extract text from IFrame mode (Mobile/Restricted).");
            return;
        } else {
            try {
                text = await (this.frame as WebviewTag).executeJavaScript('window.getSelection().toString()');
            } catch (e) {
                console.error(e);
            }
        }

        if (!text || text.trim() === '') {
            new Notice('No text selected in the browser.');
            return;
        }

        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

        if (this.insertMode === 'new') {
            const fileName = `Note ${new Date().toISOString().slice(0, 19).replace(/T|:/g, '-')}.md`;
            const file = await this.plugin.app.vault.create(fileName, text);
            await this.plugin.app.workspace.getLeaf('tab').openFile(file);
            new Notice('Created new note with text.');
            return;
        }

        if (!activeView) {
            new Notice('No active Markdown note found to insert text.');
            return;
        }

        const editor = activeView.editor;
        if (this.insertMode === 'cursor') {
            editor.replaceSelection(text);
        } else if (this.insertMode === 'bottom') {
            const lastLine = editor.lineCount();
            editor.replaceRange('\n' + text, { line: lastLine, ch: 0 });
        }

        new Notice('Text applied!');
    }

    private createFrame(): void {
        const onReady = () => {
            if (!this.isFrameReady) {
                this.isFrameReady = true
                this.frameReadyCallbacks.forEach((callback) => callback())
            }
        }

        if (this.useIframe) {
            this.frame = createIframe(this.options, onReady)
        } else {
            this.frame = createWebviewTag(this.options, onReady, this.frameDoc)

            // Popup Handling - OAuth URL은 같은 webview에서, 일반 URL은 모달로 처리
            this.frame.addEventListener('new-window', (e) => {
                // @ts-ignore
                const url = e.url as string;
                if (!url) return;

                // OAuth 제공자 URL 감지 (Google, Apple, Microsoft, etc.)
                const oauthDomains = [
                    'accounts.google.com',
                    'accounts.youtube.com',
                    'appleid.apple.com',
                    'login.microsoftonline.com',
                    'login.live.com',
                    'github.com/login',
                    'api.twitter.com',
                    'facebook.com/dialog',
                    'facebook.com/v',
                ];

                const isOAuthUrl = oauthDomains.some(domain => url.includes(domain));

                if (isOAuthUrl) {
                    // OAuth URL은 동일한 webview에서 직접 로드 (인앱 브라우저 방식)
                    // OAuth 완료 후 자동으로 원래 사이트로 리다이렉트됨
                    this.navigateTo(url);
                    return;
                }

                // 일반 팝업은 Obsidian 모달로 처리
                new GatePopupModal(this.plugin.app, url, this.options.profileKey).open();
            });

            this.frame.addEventListener('destroyed', () => {

                if (this.frameDoc != this.contentEl.doc) {
                    if (this.frame) {
                        this.frame.remove()
                    }
                    this.frameDoc = this.contentEl.doc
                    this.createFrame()
                }
            })
        }

        this.contentEl.appendChild(this.frame as unknown as HTMLElement)
    }

    onunload(): void {
        if (this.frame) {
            this.frame.remove()
        }
        super.onunload()
    }

    // ... Menu handlers
    onPaneMenu(menu: Menu, source: string): void {
        super.onPaneMenu(menu, source)
        // ... (Keep existing menu items if needed, or remove since we have UI)
        // For brevity, keeping minimal default actions or just relying on UI.
        // Let's keep Reload and Home.
        menu.addItem((item) => {
            item.setTitle('Reload')
            item.setIcon('refresh-ccw')
            item.onClick(() => {
                if (this.frame instanceof HTMLIFrameElement) {
                    this.frame.contentWindow?.location.reload()
                } else {
                    this.frame.reload()
                }
            })
        })
    }

    getViewType(): string {
        return this.options?.id ?? 'gate'
    }

    getDisplayText(): string {
        return this.options?.title ?? 'Gate'
    }

    getIcon(): string {
        return this.options?.icon ?? 'globe'
    }

    onFrameReady(callback: Function) {
        if (this.isFrameReady) {
            callback()
        } else {
            this.frameReadyCallbacks.push(callback)
        }
    }

    async setUrl(url: string) {
        this.navigateTo(url);
    }
}
