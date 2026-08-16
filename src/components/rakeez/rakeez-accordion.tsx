import * as React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type RakeezAccordionItem = {
  value: string;
  title: React.ReactNode;
  content: React.ReactNode;
};

export type RakeezAccordionProps = {
  items: RakeezAccordionItem[];
  /** Multiple panels open at once when true. */
  multiple?: boolean | undefined;
  defaultValue?: string | string[] | undefined;
  /** Controlled single-open value; "" means every panel is closed. */
  value?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  /**
   * Keep closed panels mounted (hidden) so loaded data and unsaved form
   * input survive switching sections. Only affects rendering, not state.
   */
  keepMounted?: boolean | undefined;
  className?: string | undefined;
};

/** Direction-aware accordion with Rakeez surface styling. */
export function RakeezAccordion({
  items,
  multiple = false,
  defaultValue,
  value,
  onValueChange,
  keepMounted = false,
  className,
}: RakeezAccordionProps) {
  const shared = (
    <>
      {items.map((item) => (
        <AccordionItem
          key={item.value}
          value={item.value}
          className="border-border px-4 last:border-b-0"
        >
          <AccordionTrigger className="min-h-11 text-start text-base font-medium hover:no-underline">
            {item.title}
          </AccordionTrigger>
          <AccordionContent
            className="text-sm leading-relaxed text-muted-foreground"
            {...(keepMounted ? { forceMount: true as const } : {})}
          >
            {item.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </>
  );

  const rootClass = cn("w-full rounded-xl border border-border bg-card", className);

  return multiple ? (
    <Accordion
      type="multiple"
      className={rootClass}
      {...(Array.isArray(defaultValue) ? { defaultValue } : {})}
    >
      {shared}
    </Accordion>
  ) : (
    <Accordion
      type="single"
      collapsible
      className={rootClass}
      {...(value !== undefined ? { value } : {})}
      {...(onValueChange ? { onValueChange } : {})}
      {...(value === undefined && typeof defaultValue === "string" ? { defaultValue } : {})}
    >
      {shared}
    </Accordion>
  );
}
