import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export type FieldShellProps = {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: (aria: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
    required: boolean;
  }) => React.ReactNode;
};

/** Label + control + hint + error, wired with correct aria relationships. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: FieldShellProps) {
  const t = useT();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2 text-start", className)}>
      <Label htmlFor={id} className={cn(error && "text-destructive")}>
        {label}
        {required ? (
          <span className="ms-1 text-destructive" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ms-1 text-xs font-normal text-muted-foreground">
            ({t("common.optional")})
          </span>
        )}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error),
        required,
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type BaseFieldProps = Omit<FieldShellProps, "children"> & {
  placeholder?: string | undefined;
  value?: string | undefined;
  defaultValue?: string | undefined;
  name?: string | undefined;
  disabled?: boolean | undefined;
};

export function TextField({
  placeholder,
  value,
  defaultValue,
  name,
  disabled,
  type = "text",
  onChange,
  ...shell
}: BaseFieldProps & {
  type?: React.HTMLInputTypeAttribute | undefined;
  onChange?: ((event: React.ChangeEvent<HTMLInputElement>) => void) | undefined;
}) {
  return (
    <FieldShell {...shell}>
      {(aria) => (
        <Input
          {...aria}
          type={type}
          className={cn("h-11", shell.error && "border-destructive")}
          {...(name ? { name } : {})}
          {...(placeholder ? { placeholder } : {})}
          {...(value !== undefined ? { value } : {})}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(disabled !== undefined ? { disabled } : {})}
          {...(onChange ? { onChange } : {})}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  placeholder,
  value,
  defaultValue,
  name,
  disabled,
  rows = 4,
  onChange,
  ...shell
}: BaseFieldProps & {
  rows?: number | undefined;
  onChange?: ((event: React.ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
}) {
  return (
    <FieldShell {...shell}>
      {(aria) => (
        <Textarea
          {...aria}
          rows={rows}
          className={cn(shell.error && "border-destructive")}
          {...(name ? { name } : {})}
          {...(placeholder ? { placeholder } : {})}
          {...(value !== undefined ? { value } : {})}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(disabled !== undefined ? { disabled } : {})}
          {...(onChange ? { onChange } : {})}
        />
      )}
    </FieldShell>
  );
}
