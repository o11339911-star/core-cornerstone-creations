import { useState } from "react";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";

/**
 * Nafath entry point. The official integration is not signed yet, so the
 * button only announces the upcoming capability — it never contacts any
 * external service and never collects credentials.
 */
export function NafathButton() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t("common.or")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          onClick={() => setOpen(true)}
        >
          <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
          {t("auth.nafath")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("auth.nafathSoon")}</DialogTitle>
            <DialogDescription>{t("auth.nafathSoonBody")}</DialogDescription>
          </DialogHeader>
          <Button type="button" className="h-11 w-full" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
