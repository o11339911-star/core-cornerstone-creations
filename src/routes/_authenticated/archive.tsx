import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive as ArchiveIcon,
  Download,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Presentation,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState, HeroBadge, PageHero, ResponsiveModal, SectionCard, SoftEmpty } from "@/components/rakeez";
import { supabase } from "@/integrations/supabase/client";
import { useAccountUi } from "@/lib/account-ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  addToArchive,
  createArchiveFolder,
  getArchiveFileUrl,
  getArchiveUploadPrefix,
  listArchiveFolders,
  listArchiveItems,
  removeArchiveItem,
  renameArchiveFolder,
  updateArchiveItem,
} from "@/lib/archive.functions";

export const Route = createFileRoute("/_authenticated/archive")({
  component: ArchivePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الأرشيف | ركيز" },
      {
        name: "description",
        content:
          "أرشيف مستقل لكل حساب شخصي أو كيان تجاري: مجلدات وملفات ومشاريع وعقارات وطلبات وعقود وإعلانات ومراسلات.",
      },
      { property: "og:title", content: "الأرشيف | ركيز" },
      {
        property: "og:description",
        content: "نظّم ملفاتك وعناصرك في مجلدات مرتبطة بالحساب النشط مع تخزين خاص محمي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACCEPTS = {
  any: "",
  image: "image/*",
  pdf: "application/pdf",
  word: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  excel: ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  slides:
    ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
type AcceptKey = keyof typeof ACCEPTS;

const UPLOAD_ACTIONS: Array<{ key: AcceptKey; label: string; icon: typeof FileText }> = [
  { key: "word", label: "رفع مستند Word", icon: FileText },
  { key: "excel", label: "رفع جدول Excel", icon: FileSpreadsheet },
  { key: "slides", label: "رفع عرض تقديمي", icon: Presentation },
  { key: "pdf", label: "رفع ملف PDF", icon: FileText },
  { key: "image", label: "رفع صورة", icon: ImageIcon },
  { key: "any", label: "رفع ملف عام", icon: Upload },
];

const MAX_BYTES = 25 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^\w.\-\u0600-\u06FF ]+/g, "_").slice(-120);
}

function ArchivePage() {
  const qc = useQueryClient();
  const { activeEntity, loading } = useAccountUi();
  const entityId = activeEntity?.id ?? null;

  const fetchFolders = useServerFn(listArchiveFolders);
  const fetchItems = useServerFn(listArchiveItems);
  const createFolder = useServerFn(createArchiveFolder);
  const renameFolder = useServerFn(renameArchiveFolder);
  const addItem = useServerFn(addToArchive);
  const patchItem = useServerFn(updateArchiveItem);
  const deleteItem = useServerFn(removeArchiveItem);
  const signUrl = useServerFn(getArchiveFileUrl);
  const uploadPrefix = useServerFn(getArchiveUploadPrefix);

  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [folderDialog, setFolderDialog] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [renameTarget, setRenameTarget] = React.useState<{ id: string; title: string } | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [accept, setAccept] = React.useState<string>("");

  const folders = useQuery({
    queryKey: ["archive", "folders", entityId],
    queryFn: () => fetchFolders({ data: { entityId } }),
    enabled: !loading,
  });

  const items = useQuery({
    queryKey: ["archive", "items", entityId, folderId, q.trim()],
    queryFn: () => fetchItems({ data: { entityId, folderId, q: q.trim() } }),
    enabled: !loading,
  });

  const folderMutation = useMutation({
    mutationFn: () => createFolder({ data: { entityId, name: folderName.trim(), parentId: null } }),
    onSuccess: () => {
      toast.success("تم إنشاء المجلد");
      setFolderDialog(false);
      setFolderName("");
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: () => toast.error("تعذّر إنشاء المجلد"),
  });

  const renameMutation = useMutation({
    mutationFn: (v: { id: string; title: string }) =>
      patchItem({ data: { itemId: v.id, title: v.title } }),
    onSuccess: () => {
      toast.success("تم تغيير الاسم");
      setRenameTarget(null);
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: () => toast.error("تعذّر تغيير الاسم"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem({ data: { itemId: id } }),
    onSuccess: () => {
      toast.success("تم حذف العنصر من الأرشيف");
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: () => toast.error("تعذّر حذف العنصر"),
  });

  const pickFile = (key: AcceptKey) => {
    setAccept(ACCEPTS[key]);
    setSheetOpen(false);
    // يجب انتظار تحديث السمة قبل فتح المتصفح للملفات
    requestAnimationFrame(() => fileRef.current?.click());
  };

  const onFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("حجم الملف يتجاوز 25 ميجابايت");
      return;
    }
    setUploading(true);
    try {
      const prefix = await uploadPrefix({ data: { entityId } });
      const path = `${prefix}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await supabase.storage.from("archive").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw new Error(error.message);
      await addItem({
        data: {
          entityId,
          folderId,
          newFolderName: null,
          title: file.name,
          kind: "file",
          sourceTable: null,
          sourceId: null,
          storagePath: path,
          mimeType: file.type || null,
          sizeBytes: file.size,
          note: null,
        },
      });
      toast.success("تم رفع الملف إلى الأرشيف");
      void qc.invalidateQueries({ queryKey: ["archive"] });
    } catch {
      toast.error("تعذّر رفع الملف");
    } finally {
      setUploading(false);
    }
  };

  const download = async (path: string) => {
    try {
      const url = await signUrl({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("تعذّر فتح الملف");
    }
  };

  const menuItems = (
    <>
      <ContextMenuLabel>إنشاء</ContextMenuLabel>
      <ContextMenuItem onSelect={() => setFolderDialog(true)}>
        <FolderPlus className="me-2 size-4" aria-hidden="true" /> مجلد جديد
      </ContextMenuItem>
      <ContextMenuSeparator />
      {UPLOAD_ACTIONS.map((a) => (
        <ContextMenuItem key={a.key} onSelect={() => pickFile(a.key)}>
          <a.icon className="me-2 size-4" aria-hidden="true" /> {a.label}
        </ContextMenuItem>
      ))}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-6">
      <PageHero
        title="الأرشيف"
        subtitle={
          activeEntity
            ? `أرشيف مستقل للكيان: ${activeEntity.name}`
            : "أرشيفك الشخصي المرتبط بحسابك وحده"
        }
        badge={<HeroBadge tone="neutral">الحساب النشط</HeroBadge>}
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11 gap-2"
            onClick={() => pickFile("any")}
            disabled={uploading}
          >
            <Upload className="size-4" aria-hidden="true" />
            {uploading ? "جارٍ الرفع…" : "رفع ملف"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => setFolderDialog(true)}
          >
            <FolderPlus className="size-4" aria-hidden="true" /> مجلد جديد
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2 lg:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" /> خيارات الإضافة
          </Button>
        </div>
      </PageHero>

      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        {...(accept ? { accept } : {})}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />

      <SectionCard icon={ArchiveIcon} title="المجلدات" count={folders.data?.length ?? 0}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
              folderId === null
                ? "border-primary bg-secondary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            كل العناصر
          </button>
          {(folders.data ?? []).map((f) => (
            <button
              key={f.id}
              type="button"
              onDoubleClick={() => {
                const name = window.prompt("اسم المجلد الجديد", f.name);
                if (name && name.trim()) {
                  void renameFolder({ data: { folderId: f.id, name: name.trim() } }).then(() => {
                    toast.success("تم تغيير اسم المجلد");
                    void qc.invalidateQueries({ queryKey: ["archive"] });
                  });
                }
              }}
              onClick={() => setFolderId(f.id)}
              className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
                folderId === f.id
                  ? "border-primary bg-secondary text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="relative">
        <label htmlFor="archive-search" className="sr-only">
          بحث في الأرشيف
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-muted-foreground"
        />
        <Input
          id="archive-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم العنصر"
          className="h-13 rounded-xl bg-card ps-12"
          autoComplete="off"
        />
      </div>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <section
            aria-label="عناصر الأرشيف"
            className="min-h-[12rem] rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            {items.isPending ? (
              <div className="space-y-3" role="status" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : items.isError ? (
              <ErrorState
                description="تعذّر تحميل الأرشيف"
                onRetry={() => void items.refetch()}
              />
            ) : !items.data?.length ? (
              <SoftEmpty
                icon={ArchiveIcon}
                message="لا توجد عناصر بعد — ارفع ملفًا أو استخدم زر «إضافة إلى الأرشيف» من أي صفحة."
                action={
                  <Button type="button" className="min-h-11" onClick={() => pickFile("any")}>
                    رفع ملف
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {items.data.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                      <FileText className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        <bdi dir="ltr">{formatDateTime(item.created_at)}</bdi>
                        {item.size_bytes
                          ? ` · ${formatNumber(Math.round(item.size_bytes / 1024))} KB`
                          : ""}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11 shrink-0"
                          aria-label={`خيارات ${item.title}`}
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="truncate">{item.title}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {item.storage_path ? (
                          <DropdownMenuItem
                            onSelect={() => void download(item.storage_path as string)}
                          >
                            <Download className="me-2 size-4" aria-hidden="true" /> تنزيل
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={() => setRenameTarget({ id: item.id, title: item.title })}
                        >
                          <Pencil className="me-2 size-4" aria-hidden="true" /> إعادة تسمية
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => deleteMutation.mutate(item.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="me-2 size-4" aria-hidden="true" /> حذف من الأرشيف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">{menuItems}</ContextMenuContent>
      </ContextMenu>

      {/* Action Sheet للجوال */}
      <ResponsiveModal
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="إضافة إلى الأرشيف"
        description="اختر نوع العنصر الذي تريد إضافته"
      >
        <div className="grid gap-2 pb-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 justify-start gap-2"
            onClick={() => {
              setSheetOpen(false);
              setFolderDialog(true);
            }}
          >
            <FolderPlus className="size-4" aria-hidden="true" /> مجلد جديد
          </Button>
          {UPLOAD_ACTIONS.map((a) => (
            <Button
              key={a.key}
              type="button"
              variant="outline"
              className="min-h-12 justify-start gap-2"
              onClick={() => pickFile(a.key)}
            >
              <a.icon className="size-4" aria-hidden="true" /> {a.label}
            </Button>
          ))}
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={folderDialog}
        onOpenChange={setFolderDialog}
        title="مجلد جديد"
        footer={
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={folderMutation.isPending || folderName.trim().length < 1}
            onClick={() => folderMutation.mutate()}
          >
            {folderMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="new-folder-name">اسم المجلد</Label>
          <Input
            id="new-folder-name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            className="min-h-11"
          />
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={renameTarget !== null}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        title="إعادة تسمية العنصر"
        footer={
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={renameMutation.isPending || !renameTarget?.title.trim()}
            onClick={() => renameTarget && renameMutation.mutate(renameTarget)}
          >
            {renameMutation.isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="rename-item">الاسم الجديد</Label>
          <Input
            id="rename-item"
            value={renameTarget?.title ?? ""}
            onChange={(e) =>
              setRenameTarget((prev) => (prev ? { ...prev, title: e.target.value } : prev))
            }
            className="min-h-11"
          />
        </div>
      </ResponsiveModal>
    </div>
  );
}
