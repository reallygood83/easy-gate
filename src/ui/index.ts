/**
 * UI Module Index
 *
 * Easy Gate UI 컴포넌트의 메인 진입점입니다.
 */

// Toast Notification
export {
    ToastNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    showWithAction
} from './ToastNotification'
export type { ToastType, ToastOptions } from './ToastNotification'

// Inline Progress
export {
    InlineProgress,
    DEFAULT_CLIP_STEPS,
    DEFAULT_AI_STEPS,
    createSimpleProgress,
    createStepProgress
} from './InlineProgress'
export type { ProgressStep, InlineProgressOptions } from './InlineProgress'

// Clip Dropdown
export { ClipDropdown, createClipButton } from './ClipDropdown'
export type { ClipDropdownOptions } from './ClipDropdown'

// AI Dropdown
export { AIDropdown, createAIButton, createAIStatusIndicator } from './AIDropdown'
export type { AIDropdownOptions } from './AIDropdown'
