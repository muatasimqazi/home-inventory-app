import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Plain twMerge doesn't know about this app's custom @theme font-size tokens
// (text-micro, text-caption, etc. — see globals.css). Because it can't match
// them against Tailwind's default font-size scale, it falls through to the
// text-color group instead — which silently drops the size class whenever a
// component also passes a text-color class (e.g. cn("text-micro ...", badgeColorClasses)).
// Registering them here fixes that misclassification.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "desktop-title", "screen-title", "section-title", "item-title", "body", "caption", "micro"] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
