import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveModal } from "@/components/rakeez";
import { useAccountUi } from "@/lib/account-ui";
import {
  addToArchive,
  listArchiveFolders,
  type ArchiveKind,
} from "@/lib/archive.functions";
import { cn } from "@/lib/utils";

export type ArchiveButtonProps = {
  title: string;
  kind: ArchiveKind;
  sourceTable?: string | null;
  sourceId?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  /** أيقونة فقط داخل الجداول والبطاقات المزدحمة. */
  compact?: boolean;
  className?: string;
  onArchived?: () => void;
};

const NEW_FOLDER = "__new__";
const NO_FOLDER = "__root__";

/**
 * إجراء "إضافة إلى الأرشيف" الموحّد لكل عنصر في المنصة.
 * الأرشيف يتبع الحساب النشط: كيان تجاري أو الحساب الشخصي.
 */
export function ArchiveButton({
  title,
  kind,
  sourceTable = null,
  sourceId = null,
  storagePath = null,
  mimeType = null,
  sizeBytes = null,
  compact = false,
  className,
  onArchived,
}: ArchiveButtonProps) {
  const qc = useQueryClient();
  const { activeEntity } = useAccountUi();
  const entityId = activeEntity?.id ?? null;
  const fetchFolders = useServerFn(listArchiveFolders);
  const archive = useServerFn(addToArchive);

  const [open, setOpen] = React.useState(false);
  const [itemTitle, setItemTitle] = React.useState(title);
  const [folder, setFolder] = React.useState<string>(NO_FOLDER);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setItemTitle(title);
  }, [open, title]);

  const folders = useQuery({
    queryKey: ["archive", "folders", entityId],
    queryFn: () => fetchFolders({ data: { entityId } }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      archive({
        data: {
          entityId,
          folderId: folder === NEW_FOLDER || folder === NO_FOLDER ? null : folder,
          newFolderName: folder === NEW_FOLDER ? newFolderName.trim() : null,
          title: itemTitle.trim(),
          kind,
          sourceTable,
          sourceId,
          storagePath,
          mimeType,
          sizeBytes,
          note: note.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("تمت الإضافة إلى الأرشيف");
      void qc.invalidateQueries({ queryKey: ["archive"] });
      setOpen(false);
      setNote("");
      setNewFolderName("");
      setFolder(NO_FOLDER);
      onArchived?.();
    },
    onError: (err: Error) => {
      setError(
        err.message === "ALREADY_ARCHIVED"
          ? "هذا العنصر مؤرشف بالفعل"
          : "تعذّر إتمام الأرشفة، حاول مرة أخرى",
      );
    },
  });

  const submit = () => {
    setError(null);
    if (itemTitle.trim().length < 1) {
      setError("اكتب اسمًا للعنصر");
      return;
    }
    if (folder === NEW_FOLDER && newFolderName.trim().length < 1) {
      setError("اكتب اسم المجلد الجديد");
      return;
    }
    mutation.mutate();
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      title="إضافة إلى الأرشيف"
      description={
        activeEntity
          ? `سيُحفظ العنصر في أرشيف: ${activeEntity.name}`
          : "سيُحفظ العنصر في أرشيفك الشخصي"
      }
      trigger={
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={cn(compact ? "size-11 shrink-0" : "min-h-11 gap-2", className)}
          aria-label="إضافة إلى الأرشيف"
        >
          <Archive className="size-4" aria-hidden="true" />
          {compact ? null : "إضافة إلى الأرشيف"}
        </Button>
      }
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            className="min-h-11 flex-1"
            onClick={submit}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "جارٍ الحفظ…" : "أرشفة"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setOpen(false)}
          >
            إلغاء
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="archive-title">اسم العنصر في الأرشيف</Label>
          <Input
            id="archive-title"
            value={itemTitle}
            onChange={(e) => setItemTitle(e.target.value)}
            className="min-h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="archive-folder">المجلد</Label>
          <select
            id="archive-folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value={NO_FOLDER}>بدون مجلد (الجذر)</option>
            {(folders.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
            <option value={NEW_FOLDER}>+ إنشاء مجلد جديد…</option>
          </select>
        </div>

        {folder === NEW_FOLDER ? (
          <div className="space-y-2">
            <Label htmlFor="archive-new-folder">اسم المجلد الجديد</Label>
            <Input
              id="archive-new-folder"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="min-h-11"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="archive-note">ملاحظة (اختياري)</Label>
          <Textarea
            id="archive-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </ResponsiveModal>
  );
}
