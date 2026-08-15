import * as React from "react";

import { cn } from "@/lib/utils";
import { toLatinDigits } from "@/lib/format";

/**
 * Renders numbers, identifiers, phone numbers, IBANs and coordinates in an
 * isolated LTR run while the page stays RTL — and guarantees Latin digits even
 * when the value arrives from the database as Arabic-Indic text.
 */
export function Num({
  children,
  className,
  as: Tag = "span",
}: {
  children: React.ReactNode;
  className?: string | undefined;
  as?: "span" | "div" | "td" | "strong";
}) {
  const text = typeof children === "string" || typeof children === "number"
    ? toLatinDigits(String(children))
    : children;
  return (
    <Tag dir="ltr" className={cn("force-ltr inline-block", className)}>
      {text}
    </Tag>
  );
}

/**
 * Normalises typed/pasted/OCR'd Arabic-Indic digits to 0-9 while preserving the
 * caret position. Wrap any text/number input handler with it:
 *
 *   <input {...normalizedInput(value, setValue)} />
 */
export function normalizedInput(
  value: string,
  onValueChange: (next: string) => void,
): {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
} {
  return {
    value,
    onChange: (event) => {
      const el = event.currentTarget;
      const caret = el.selectionStart;
      const next = toLatinDigits(el.value);
      onValueChange(next);
      if (caret !== null && next !== el.value) {
        // Length is preserved 1:1 by toLatinDigits, so the caret stays put.
        requestAnimationFrame(() => {
          try {
            el.setSelectionRange(caret, caret);
          } catch {
            /* input type may not support selection (e.g. number) */
          }
        });
      }
    },
  };
}

/**
 * App-wide safety net: converts Arabic-Indic digits typed or pasted into ANY
 * input/textarea to 0-9, without touching the original stored documents.
 * Mounted once in the root layout.
 */
export function useLatinDigitInputGuard() {
  React.useEffect(() => {
    const handler = (event: Event) => {
      const el = event.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      if (typeof el.value !== "string") return;
      const next = toLatinDigits(el.value);
      if (next === el.value) return;
      const caret = el.selectionStart;
      const setter = Object.getOwnPropertyDescriptor(
        tag === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (caret !== null) {
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* selection unsupported */
        }
      }
    };
    document.addEventListener("input", handler, true);
    return () => document.removeEventListener("input", handler, true);
  }, []);
}
