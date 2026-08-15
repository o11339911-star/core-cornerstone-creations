import * as React from "react";
import { Paperclip, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export type FileUploaderProps = {
  id?: string | undefined;
  label?: string | undefined;
  hint?: string | undefined;
  accept?: string | undefined;
  multiple?: boolean | undefined;
  maxSizeMb?: number | undefined;
  value?: File[] | undefined;
  onFilesChange?: ((files: File[]) => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Accessible drag & drop uploader; state is controllable or internal. */
export function FileUploader({
  id,
  label,
  hint,
  accept,
  multiple = true,
  maxSizeMb,
  value,
  onFilesChange,
  disabled = false,
  className,
}: FileUploaderProps) {
  const t = useT();
  const reactId = React.useId();
  const inputId = id ?? `uploader-${reactId}`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [internal, setInternal] = React.useState<File[]>([]);
  const [dragging, setDragging] = React.useState(false);

  const files = value ?? internal;

  const commit = React.useCallback(
    (next: File[]) => {
      const limited = maxSizeMb ? next.filter((file) => file.size <= maxSizeMb * 1024 * 1024) : next;
      if (!value) setInternal(limited);
      onFilesChange?.(limited);
    },
    [maxSizeMb, onFilesChange, value],
  );

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    commit(multiple ? [...files, ...list] : list.slice(0, 1));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Label htmlFor={inputId}>{label ?? t("uploader.label")}</Label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors",
          dragging && "border-accent bg-accent/10",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{hint ?? t("uploader.hint")}</p>
        {maxSizeMb ? (
          <p className="text-xs text-muted-foreground">
            {t("uploader.maxSize", { size: `${maxSizeMb} MB` })}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {t("uploader.browse")}
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          multiple={multiple}
          disabled={disabled}
          {...(accept ? { accept } : {})}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-card-foreground">
                {file.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatSize(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={`${t("uploader.remove")}: ${file.name}`}
                onClick={() => commit(files.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
