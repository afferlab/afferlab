import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

import { Button } from "@/shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/shared/ui/dialog"
import { OPEN_UPDATE_MODAL_EVENT } from "@/components/updateModalEvents"

type UpdateState = {
    open: boolean
    version: string
}

const RELEASES_URL = "https://github.com/afferlab/afferlab/releases"
const initialState: UpdateState = {
    open: false,
    version: "",
}

export default function UpdateModal() {
    const [state, setState] = useState<UpdateState>(initialState)
    const versionRef = useRef("")

    useEffect(() => {
        const openModal = (version: string) => {
            versionRef.current = version
            setState({
                open: true,
                version,
            })
        }

        const removeUpdateReady = window.updater.onUpdateReady((data) => {
            openModal(data.version)
        })

        const handleOpenUpdateModal = (event: Event) => {
            const detail = (event as CustomEvent<{ version?: string }>).detail
            const version = detail?.version ?? versionRef.current
            if (!version) return
            openModal(version)
        }

        window.addEventListener(OPEN_UPDATE_MODAL_EVENT, handleOpenUpdateModal)

        return () => {
            removeUpdateReady()
            window.removeEventListener(OPEN_UPDATE_MODAL_EVENT, handleOpenUpdateModal)
        }
    }, [])

    return (
        <Dialog
            open={state.open}
            onOpenChange={(open) => {
                setState((current) => ({ ...current, open }))
            }}
        >
            <DialogContent
                showCloseButton={false}
                className="w-auto max-w-fit gap-0 border-0 bg-transparent p-0 text-tx shadow-none sm:max-w-fit"
            >
                <AnimatePresence mode="wait">
                    {state.open ? (
                        <motion.div
                            key={state.version || "update-ready"}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="overflow-hidden rounded-[18px] bg-[rgba(255,255,255,0.10)] p-[1px] dark:bg-white/[0.10]"
                        >
                            <div className="relative rounded-[17px] bg-bg-sidebar text-tx">
                                <button
                                    type="button"
                                    className="ui-fast ui-press absolute top-5 right-5 grid h-8 w-8 cursor-pointer place-items-center rounded-xl text-tx/70 transition-colors hover:bg-bg-sidebar-button-hover hover:text-tx"
                                    onClick={() => {
                                        setState((current) => ({ ...current, open: false }))
                                    }}
                                    aria-label="Close update modal"
                                >
                                    <X className="h-4 w-4 stroke-[2.5]" />
                                </button>
                                <DialogHeader className="border-b border-border/60 px-6 pt-6 pb-4 text-left font-semibold">
                                    <DialogTitle className="flex items-center gap-3 pr-10 text-lg font-semibold">
                                        <img src="/images/logo_black.svg" alt="AfferLab" className="h-5 w-5 dark:hidden" />
                                        <img src="/images/logo_white.svg" alt="AfferLab" className="hidden h-5 w-5 dark:block" />
                                        <span>Update Ready</span>
                                    </DialogTitle>
                                    <DialogDescription className="text-sm font-semibold text-tx/65">
                                        Version {state.version} is available
                                    </DialogDescription>
                                </DialogHeader>

                                <DialogFooter className="flex-row justify-end gap-3 px-6 py-5">
                                    <Button
                                        type="button"
                                        size="lg"
                                        variant="outline"
                                        className="cursor-pointer border-0 bg-bg-sidebar-button-hover/60 text-sm font-semibold text-tx shadow-none hover:bg-bg-sidebar-button-hover"
                                        onClick={() => {
                                            void window.chatAPI.openExternal(RELEASES_URL)
                                        }}
                                    >
                                        What's New
                                    </Button>
                                    <Button
                                        type="button"
                                        size="lg"
                                        variant="outline"
                                        className="cursor-pointer border-0 bg-bg-sidebar-button-hover/60 text-sm font-semibold text-tx shadow-none hover:bg-bg-sidebar-button-hover"
                                        onClick={() => {
                                            setState((current) => ({ ...current, open: false }))
                                        }}
                                    >
                                        Later
                                    </Button>
                                    <Button
                                        type="button"
                                        size="lg"
                                        className="cursor-pointer border-0 text-sm font-semibold shadow-none"
                                        onClick={() => {
                                            window.updater.restart()
                                        }}
                                    >
                                        Restart and Install
                                    </Button>
                                </DialogFooter>
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
