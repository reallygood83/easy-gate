/**
 * InlineProgress - 인라인 진행률 표시 컴포넌트
 *
 * 클리핑/AI 작업의 진행 상태를 버튼 옆에 인라인으로 표시합니다.
 * 모달 없이 간단한 피드백을 제공합니다.
 */

export interface ProgressStep {
    id: string
    label: string
    status: 'pending' | 'active' | 'completed' | 'error'
}

export interface InlineProgressOptions {
    container: HTMLElement
    steps?: ProgressStep[]
    showBar?: boolean
    compact?: boolean
}

/**
 * InlineProgress 클래스
 */
export class InlineProgress {
    private container: HTMLElement
    private element: HTMLElement | null = null
    private steps: ProgressStep[] = []
    private showBar: boolean
    private compact: boolean
    private currentProgress = 0

    constructor(options: InlineProgressOptions) {
        this.container = options.container
        this.steps = options.steps || []
        this.showBar = options.showBar ?? true
        this.compact = options.compact ?? false
    }

    /**
     * 진행률 표시 시작
     */
    show(): void {
        this.hide() // 기존 제거

        this.element = this.container.createDiv({ cls: 'easy-gate-inline-progress' })
        this.element.style.cssText = `
            display: flex;
            flex-direction: ${this.compact ? 'row' : 'column'};
            gap: 8px;
            padding: 8px 12px;
            background: var(--background-secondary);
            border-radius: 6px;
            font-size: 12px;
            margin: 8px 0;
        `

        if (this.showBar) {
            this.renderProgressBar()
        }

        if (this.steps.length > 0) {
            this.renderSteps()
        }
    }

    /**
     * 진행률 숨기기
     */
    hide(): void {
        if (this.element) {
            this.element.remove()
            this.element = null
        }
    }

    /**
     * 진행률 업데이트 (0-100)
     */
    setProgress(percent: number): void {
        this.currentProgress = Math.min(100, Math.max(0, percent))

        if (this.element) {
            const bar = this.element.querySelector('.progress-fill') as HTMLElement
            if (bar) {
                bar.style.width = `${this.currentProgress}%`
            }

            const label = this.element.querySelector('.progress-label')
            if (label) {
                label.textContent = `${Math.round(this.currentProgress)}%`
            }
        }
    }

    /**
     * 스텝 상태 업데이트
     */
    setStepStatus(stepId: string, status: ProgressStep['status']): void {
        const step = this.steps.find((s) => s.id === stepId)
        if (step) {
            step.status = status
            this.updateStepDisplay(stepId)
        }
    }

    /**
     * 다음 스텝으로 이동
     */
    nextStep(): void {
        const currentIndex = this.steps.findIndex((s) => s.status === 'active')

        if (currentIndex >= 0) {
            this.steps[currentIndex].status = 'completed'
            this.updateStepDisplay(this.steps[currentIndex].id)
        }

        const nextIndex = currentIndex + 1
        if (nextIndex < this.steps.length) {
            this.steps[nextIndex].status = 'active'
            this.updateStepDisplay(this.steps[nextIndex].id)
        }

        // 프로그레스 바 업데이트
        const completedCount = this.steps.filter((s) => s.status === 'completed').length
        this.setProgress((completedCount / this.steps.length) * 100)
    }

    /**
     * 에러 상태로 설정
     */
    setError(stepId?: string): void {
        if (stepId) {
            this.setStepStatus(stepId, 'error')
        } else {
            // 현재 활성 스텝을 에러로
            const activeStep = this.steps.find((s) => s.status === 'active')
            if (activeStep) {
                activeStep.status = 'error'
                this.updateStepDisplay(activeStep.id)
            }
        }

        // 프로그레스 바 색상 변경
        if (this.element) {
            const bar = this.element.querySelector('.progress-fill') as HTMLElement
            if (bar) {
                bar.style.background = '#f44336'
            }
        }
    }

    /**
     * 완료 상태로 설정
     */
    complete(): void {
        this.steps.forEach((step) => {
            step.status = 'completed'
            this.updateStepDisplay(step.id)
        })
        this.setProgress(100)

        if (this.element) {
            const bar = this.element.querySelector('.progress-fill') as HTMLElement
            if (bar) {
                bar.style.background = '#4caf50'
            }
        }
    }

    /**
     * 진행률 바 렌더링
     */
    private renderProgressBar(): void {
        if (!this.element) return

        const barContainer = this.element.createDiv({ cls: 'progress-bar-container' })
        barContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            ${this.compact ? '' : 'width: 100%;'}
        `

        const bar = barContainer.createDiv({ cls: 'progress-bar' })
        bar.style.cssText = `
            flex: 1;
            height: 6px;
            background: var(--background-modifier-border);
            border-radius: 3px;
            overflow: hidden;
            min-width: ${this.compact ? '80px' : '150px'};
        `

        const fill = bar.createDiv({ cls: 'progress-fill' })
        fill.style.cssText = `
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #2196f3, #4caf50);
            border-radius: 3px;
            transition: width 0.3s ease;
        `

        const label = barContainer.createSpan({ cls: 'progress-label' })
        label.textContent = '0%'
        label.style.cssText = `
            font-size: 11px;
            color: var(--text-muted);
            min-width: 35px;
            text-align: right;
        `
    }

    /**
     * 스텝 목록 렌더링
     */
    private renderSteps(): void {
        if (!this.element) return

        const stepsContainer = this.element.createDiv({ cls: 'progress-steps' })
        stepsContainer.style.cssText = `
            display: flex;
            flex-direction: ${this.compact ? 'row' : 'column'};
            gap: ${this.compact ? '12px' : '4px'};
            ${this.compact ? '' : 'margin-top: 8px;'}
        `

        this.steps.forEach((step, index) => {
            const stepEl = stepsContainer.createDiv({
                cls: `progress-step step-${step.status}`,
                attr: { 'data-step-id': step.id }
            })
            stepEl.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: ${step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-normal)'};
            `

            // 아이콘
            const icon = stepEl.createSpan({ cls: 'step-icon' })
            icon.textContent = this.getStepIcon(step.status)
            icon.style.fontSize = '12px'

            // 라벨
            const label = stepEl.createSpan({ cls: 'step-label' })
            label.textContent = step.label

            // 첫 번째 스텝을 활성화
            if (index === 0 && step.status === 'pending') {
                step.status = 'active'
                this.updateStepDisplay(step.id)
            }
        })
    }

    /**
     * 스텝 디스플레이 업데이트
     */
    private updateStepDisplay(stepId: string): void {
        if (!this.element) return

        const stepEl = this.element.querySelector(`[data-step-id="${stepId}"]`) as HTMLElement
        const step = this.steps.find((s) => s.id === stepId)

        if (stepEl && step) {
            const icon = stepEl.querySelector('.step-icon')
            if (icon) {
                icon.textContent = this.getStepIcon(step.status)
            }

            stepEl.style.color =
                step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-normal)'

            if (step.status === 'error') {
                stepEl.style.color = '#f44336'
            }
        }
    }

    /**
     * 스텝 상태에 따른 아이콘
     */
    private getStepIcon(status: ProgressStep['status']): string {
        switch (status) {
            case 'pending':
                return '○'
            case 'active':
                return '◐'
            case 'completed':
                return '✓'
            case 'error':
                return '✗'
            default:
                return '○'
        }
    }
}

/**
 * 기본 클리핑 스텝
 */
export const DEFAULT_CLIP_STEPS: ProgressStep[] = [
    { id: 'extract', label: '콘텐츠 추출', status: 'pending' },
    { id: 'metadata', label: '메타데이터 파싱', status: 'pending' },
    { id: 'create', label: '노트 생성', status: 'pending' }
]

/**
 * 기본 AI 처리 스텝
 */
export const DEFAULT_AI_STEPS: ProgressStep[] = [
    { id: 'extract', label: '콘텐츠 추출', status: 'pending' },
    { id: 'prompt', label: '프롬프트 생성', status: 'pending' },
    { id: 'ai', label: 'AI 응답 대기', status: 'pending' },
    { id: 'create', label: '노트 생성', status: 'pending' }
]

/**
 * 간단한 프로그레스 바 생성 (편의 함수)
 */
export function createSimpleProgress(container: HTMLElement): InlineProgress {
    return new InlineProgress({ container, showBar: true, compact: true })
}

/**
 * 스텝 프로그레스 생성 (편의 함수)
 */
export function createStepProgress(
    container: HTMLElement,
    steps: ProgressStep[]
): InlineProgress {
    return new InlineProgress({ container, steps, showBar: true, compact: false })
}
