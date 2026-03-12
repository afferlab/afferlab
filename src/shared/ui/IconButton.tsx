import { clsx } from "clsx";
import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
    active?: boolean;
    "aria-label": string;
};

export default function IconButton({
           className,
           ...props
       }: Props) {
    return (
        <button
            {...props}
            className={clsx(
                "inline-flex items-center justify-center rounded-md",
                "h-6 w-6 p-1",
                "ui-fast ui-press transition-[background-color,color,box-shadow,transform]",
                // default
                "bg-transparent ring-1 ring-transparent",
                // hover
                "hover:bg-bg-iconbutton-button-hover hover:ring-bg-iconbutton-button-hover",
                // active
                "active:bg-bg-iconbutton-button-active active:ring-bg-iconbutton-button-active",
                // focus
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                className
            )}
        />
    );
}
