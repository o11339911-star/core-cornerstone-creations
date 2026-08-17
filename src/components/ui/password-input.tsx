import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * حقل كلمة مرور مع زر إظهار/إخفاء.
 *
 * القيمة تبقى داخل الـ input فقط: الزر يبدّل نوع الحقل بين password/text ولا
 * ينسخ القيمة إلى أي عنصر آخر ولا يسجّلها. autocomplete يمرَّر كما هو.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type">
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative" dir="ltr">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        dir="ltr"
        className={cn("h-11 pe-12", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        aria-pressed={visible}
        tabIndex={0}
        className="absolute inset-y-0 end-0 flex min-h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
});
