import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

/** Switches the app between Arabic (RTL) and English (LTR). */
export function LanguageToggle({ className }: { className?: string | undefined }) {
  const { locale, toggleLocale, t } = useI18n();
  const nextLabel = locale === "ar" ? t("common.switchToEnglish") : t("common.switchToArabic");

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={toggleLocale}
      aria-label={`${t("common.language")}: ${nextLabel}`}
      className={cn("min-h-11 gap-2 px-3 text-sm font-medium", className)}
    >
      <Languages className="size-4" aria-hidden="true" />
      <span>{nextLabel}</span>
    </Button>
  );
}
