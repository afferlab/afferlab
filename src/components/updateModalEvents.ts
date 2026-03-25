export const OPEN_UPDATE_MODAL_EVENT = "afferlab:update-open-modal"

export function openUpdateModal(detail?: { version?: string }): void {
    window.dispatchEvent(new CustomEvent(OPEN_UPDATE_MODAL_EVENT, { detail }))
}
