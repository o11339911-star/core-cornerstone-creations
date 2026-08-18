import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveModal } from "./responsive-modal";

export type AdminActionOutcome = { ok: boolean; message?: string | undefined };

export type AdminActionProps = {
  /** نص الزر الظاهر في البطاقة. */
  label: string;
  /** عنوان مربع التأكيد. */
  title: string;
  /** جملة عربية واحدة تشرح الأثر الفعلي للإجراء. */
  impact: string;
  /** نص زر التنفيذ داخل المربع. */
  confirmLabel?: string;
  /** الأفعال الهدامة تأخذ الشكل التحذيري. */
  destructive?: boolean;
  /** يطلب كتابة الاسم حرفيًا قبل التنفيذ (تأكيد مزدوج). */
  confirmName?: string | undefined;
  /** حقول إضافية اختيارية داخل المربع. */
  children?: React.ReactNode;
  /** يُستدعى بعد اجتياز التحقق؛ يعيد نتيجة عربية للعرض. */
  onConfirm: (reason: string) => Promise<AdminActionOutcome>;
  /** يُستدعى بعد نجاح الإجراء (تحديث الاستعلامات). */
  onDone?: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
};

/**
 * مربع تأكيد إداري موحّد: أثر واضح بالعربية، سبب إلزامي، وتأكيد مزدوج
 * بكتابة الاسم للأفعال الهدامة. لا ينفّذ شيئًا بنفسه — المنطق عند المستدعي.
 */
export function AdminAction({
  label,
  title,
  impact,
  confirmLabel = "تنفيذ",
  destructive = false,
  confirmName,
  children,
  onConfirm,
  onDone,
  disabled = false,
  size = "sm",
}: AdminActionProps) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reasonValid = reason.trim().length >= 5;
  const nameValid = !confirmName || typed.trim() === confirmName.trim();

  function reset() {
    setReason("");
    setTyped("");
    setError(null);
  }

  async function submit() {
    if (!reasonValid || !nameValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm(reason.trim());
      if (result.ok) {
        toast.success(result.message ?? "تم تنفيذ الإجراء وتسجيله في سجل التدقيق.");
        setOpen(false);
        reset();
        onDone?.();
      } else {
        setError(result.message ?? "تعذّر تنفيذ الإجراء.");
      }
    } catch {
      setError("تعذّر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={
        <Button
          type="button"
          size={size}
          variant={destructive ? "destructive" : "outline"}
          className="min-h-11"
          disabled={disabled}
        >
          {label}
        </Button>
      }
      title={title}
      description={impact}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            className="min-h-11"
            onClick={() => void submit()}
            disabled={busy || !reasonValid || !nameValid}
          >
            {busy ? "جارٍ التنفيذ…" : confirmLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            إلغاء
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {children}

        <div className="space-y-1.5">
          <Label htmlFor="admin-action-reason">سبب الإجراء (إلزامي)</Label>
          <Textarea
            id="admin-action-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="اكتب سببًا واضحًا يُحفظ في سجل التدقيق"
          />
          {!reasonValid && reason.length > 0 ? (
            <p className="text-xs text-destructive">السبب قصير جدًا — اكتب خمسة أحرف على الأقل.</p>
          ) : null}
        </div>

        {confirmName ? (
          <div className="space-y-1.5">
            <Label htmlFor="admin-action-confirm">اكتب الاسم للتأكيد: {confirmName}</Label>
            <Input
              id="admin-action-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmName}
            />
            {!nameValid && typed.length > 0 ? (
              <p className="text-xs text-destructive">الاسم غير مطابق.</p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </ResponsiveModal>
  );
}
