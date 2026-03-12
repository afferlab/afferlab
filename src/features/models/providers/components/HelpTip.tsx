import type { ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/shared/ui/tooltip"

type HelpTipProps = {
    content: ReactNode
    side?: "top" | "right" | "bottom" | "left"
    className?: string
}

export default function HelpTip({
                                    content,
                                    side = "top",
                                    className,
                                }: HelpTipProps) {
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        aria-label="Help"
                        className={[
                            "text-tx/50 hover:text-tx/70 transition cursor-pointer",
                            "inline-flex items-center justify-center",
                            className,
                        ].join(" ")}
                    >
                        <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                </TooltipTrigger>

                <TooltipContent
                    side={side}
                    align="center"
                    className="max-w-[260px] text-xs leading-relaxed rounded-lg"
                >
                    {content}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
