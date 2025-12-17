import { App, Modal } from 'obsidian'
import { createFormEditGate } from './fns/createFormEditGate'
import { GateFrameOption } from './GateOptions'

export class ModalOnBoarding extends Modal {
    gateOptions: GateFrameOption
    onSubmit: (result: GateFrameOption) => void
    constructor(app: App, gateOptions: GateFrameOption, onSubmit: (result: GateFrameOption) => void) {
        super(app)
        this.onSubmit = onSubmit
        this.gateOptions = gateOptions
    }

    onOpen() {
        const { contentEl } = this
        contentEl.createEl('h3', { text: 'Welcome to Easy Gate' })
        contentEl.createEl('p', {
            text: 'Easy Gate is a plugin that allows you to embed any website in Obsidian. You will never have to leave Obsidian again!'
        })

        contentEl.createEl('p', {
            text: 'If you need help, please visit our YouTube channel for tutorials.'
        })

        contentEl.createEl('a', {
            cls: 'community-link',
            text: 'YouTube',
            attr: { href: 'https://www.youtube.com/@%EB%B0%B0%EC%9B%80%EC%9D%98%EB%8B%AC%EC%9D%B8-p5v' }
        })

        contentEl.createEl('p', {
            text: 'But now you have to create your first gate.'
        })

        createFormEditGate(contentEl, this.gateOptions, (result) => {
            this.onSubmit(result)
            this.close()
        })
    }

    onClose() {
        const { contentEl } = this
        contentEl.empty()
    }
}
