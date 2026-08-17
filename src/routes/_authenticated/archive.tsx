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
import {
  ErrorState,
  HeroBadge,
  PageHero,
  ResponsiveModal,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { DownloadDialog, type DownloadTarget } from "@/components/archive/download-dialog";
import { OfficeEditor, type OfficeTarget } from "@/components/archive/office-editor";
import { supabase } from "@/integrations/supabase/client";
import {
  DOCX_MIME,
  XLSX_MIME,
  createDocxBlob,
  createXlsxBlob,
  isMacroFile,
  officeKindOf,
  withExtension,
} from "@/lib/office-files";
import { useAccountUi } from "@/lib/account-ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  addToArchive,
  createArchiveFolder,
  copyArchiveFile,
  getArchiveFileUrl,
  listArchiveVersions,
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
  excel:
    ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

const CREATE_ACTIONS = [
  { key: "word" as const, label: "مستند Word جديد", icon: FileText },
  { key: "excel" as const, label: "مصنف Excel جديد", icon: FileSpreadsheet },
];

const MAX_BYTES = 25 * 1024 * 1024;

// مفاتيح Supabase Storage تقبل ASCII فقط؛ الأسماء العربية تُحفظ في العنوان لا في المسار
function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^A-Za-z0-9]+/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
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
  const copyFile = useServerFn(copyArchiveFile);
  const fetchVersions = useServerFn(listArchiveVersions);
  const uploadPrefix = useServerFn(getArchiveUploadPrefix);

  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [folderDialog, setFolderDialog] = React.useState(false);
  const [folderName, setFolderName] = React.useState("");
  const [renameTarget, setRenameTarget] = React.useState<{ id: string; title: string } | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [accept, setAccept] = React.useState<string>("");
  const [createKind, setCreateKind] = React.useState<"word" | "excel" | null>(null);
  const [createName, setCreateName] = React.useState("");
  const [createFolderId, setCreateFolderId] = React.useState<string | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<{ id: string; title: string } | null>(null);
  const [officeTarget, setOfficeTarget] = React.useState<OfficeTarget | null>(null);
  const [downloadTarget, setDownloadTarget] = React.useState<DownloadTarget | null>(null);
  const [detailsTarget, setDetailsTarget] = React.useState<{
    id: string;
    title: string;
    reference: string;
    archivedAt: string;
    originalNumber: string | null;
    copiedFrom: string | null;
  } | null>(null);

  const versions = useQuery({
    queryKey: ["archive", "versions", detailsTarget?.id],
    queryFn: () => fetchVersions({ data: { itemId: detailsTarget!.id } }),
    enabled: !!detailsTarget,
  });

  // «نسخ ملف» هو الإجراء الوحيد الذي ينشئ بطاقة وملفًا جديدين بمرجع جديد
  const copyMutation = useMutation({
    mutationFn: async (item: { id: string; title: string; storagePath: string }) => {
      const url = await signUrl({ data: { path: item.storagePath } });
      const res = await fetch(url);
      if (!res.ok) throw new Error("تعذّر قراءة الملف الأصلي.");
      const blob = await res.blob();
      const title = `نسخة من ${item.title}`;
      const prefix = await uploadPrefix({ data: { entityId } });
      const path = `${prefix}/${crypto.randomUUID()}-${safeName(title)}`;
      const { error } = await supabase.storage
        .from("archive")
        .upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: false });
      if (error) throw new Error(error.message);
      try {
        await copyFile({
          data: {
            sourceItemId: item.id,
            title,
            storagePath: path,
            mimeType: blob.type || null,
            sizeBytes: blob.size,
          },
        });
      } catch (e) {
        await supabase.storage.from("archive").remove([path]);
        throw e;
      }
    },
    onSuccess: () => {
      toast.success("تم إنشاء نسخة جديدة بمرجع مستقل");
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: (e: unknown) =>
      toast.error("تعذّر نسخ الملف", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

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

  const moveMutation = useMutation({
    mutationFn: (v: { id: string; folderId: string | null }) =>
      patchItem({ data: { itemId: v.id, folderId: v.folderId } }),
    onSuccess: () => {
      toast.success("تم نقل العنصر");
      setMoveTarget(null);
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: () => toast.error("تعذّر نقل العنصر"),
  });

  const createOfficeMutation = useMutation({
    mutationFn: async (v: { kind: "word" | "excel"; name: string; folderId: string | null }) => {
      const fileName =
        v.kind === "word" ? withExtension(v.name, ".docx") : withExtension(v.name, ".xlsx");
      const blob =
        v.kind === "word"
          ? await createDocxBlob(v.name.trim())
          : createXlsxBlob(v.name.trim(), ["البند", "الوصف", "القيمة"]);
      const mime = v.kind === "word" ? DOCX_MIME : XLSX_MIME;
      const prefix = await uploadPrefix({ data: { entityId } });
      const path = `${prefix}/${crypto.randomUUID()}-${safeName(fileName)}`;
      const { error } = await supabase.storage.from("archive").upload(path, blob, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      try {
        await addItem({
          data: {
            entityId,
            folderId: v.folderId,
            newFolderName: null,
            title: fileName,
            kind: "file",
            sourceTable: null,
            sourceId: null,
            storagePath: path,
            mimeType: mime,
            sizeBytes: blob.size,
            note: null,
          },
        });
      } catch (e) {
        // لا نترك ملفًا يتيمًا في المخزن عند فشل إنشاء السجل
        await supabase.storage.from("archive").remove([path]);
        throw e;
      }
    },
    onSuccess: () => {
      toast.success("تم إنشاء الملف في الأرشيف");
      setCreateKind(null);
      setCreateName("");
      void qc.invalidateQueries({ queryKey: ["archive"] });
    },
    onError: (e: unknown) =>
      toast.error("تعذّر إنشاء الملف", {
        description: e instanceof Error ? e.message : undefined,
      }),
  });

  const openCreate = (kind: "word" | "excel") => {
    setSheetOpen(false);
    setCreateKind(kind);
    setCreateName("");
    setCreateFolderId(folderId);
  };

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
      try {
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
      } catch (e) {
        await supabase.storage.from("archive").remove([path]);
        throw e;
      }
      toast.success("تم رفع الملف إلى الأرشيف");
      void qc.invalidateQueries({ queryKey: ["archive"] });
    } catch (e) {
      toast.error("تعذّر رفع الملف", {
        description: e instanceof Error ? e.message : undefined,
      });
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
      {CREATE_ACTIONS.map((a) => (
        <ContextMenuItem key={a.key} onSelect={() => openCreate(a.key)}>
          <a.icon className="me-2 size-4" aria-hidden="true" /> {a.label}
        </ContextMenuItem>
      ))}
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
            onClick={() => openCreate("word")}
          >
            <FileText className="size-4" aria-hidden="true" /> مستند Word جديد
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => openCreate("excel")}
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" /> مصنف Excel جديد
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
              <ErrorState description="تعذّر تحميل الأرشيف" onRetry={() => void items.refetch()} />
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
                        <bdi dir="ltr">{item.archive_reference}</bdi>
                        {" · "}
                        <bdi dir="ltr">{formatDateTime(item.archived_at ?? item.created_at)}</bdi>
                        {item.size_bytes
                          ? ` · ${formatNumber(Math.round(item.size_bytes / 1024))} KB`
                          : ""}
                      </p>
                    </div>
                    {item.storage_path &&
                    officeKindOf(item.title, item.mime_type) &&
                    !isMacroFile(item.title) ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 shrink-0 gap-2"
                        aria-label={`فتح وتعديل ${item.title}`}
                        onClick={() =>
                          setOfficeTarget({
                            id: item.id,
                            title: item.title,
                            storagePath: item.storage_path as string,
                            kind: officeKindOf(item.title, item.mime_type) as "word" | "excel",
                            folderId: item.folder_id,
                          })
                        }
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        <span className="hidden sm:inline">فتح وتعديل</span>
                      </Button>
                    ) : null}
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
                        {item.storage_path && officeKindOf(item.title, item.mime_type) ? (
                          <DropdownMenuItem
                            disabled={isMacroFile(item.title)}
                            onSelect={() =>
                              setOfficeTarget({
                                id: item.id,
                                title: item.title,
                                storagePath: item.storage_path as string,
                                kind: officeKindOf(item.title, item.mime_type) as "word" | "excel",
                                folderId: item.folder_id,
                              })
                            }
                          >
                            <Pencil className="me-2 size-4" aria-hidden="true" /> فتح وتعديل
                          </DropdownMenuItem>
                        ) : null}
                        {item.storage_path ? (
                          <DropdownMenuItem
                            onSelect={() =>
                              setDownloadTarget({
                                id: item.id,
                                title: item.title,
                                storagePath: item.storage_path as string,
                                reference: item.archive_reference,
                                archivedAt: item.archived_at ?? item.created_at,
                                mimeType: item.mime_type,
                              })
                            }
                          >
                            <Download className="me-2 size-4" aria-hidden="true" /> تنزيل
                          </DropdownMenuItem>
                        ) : null}
                        {item.storage_path ? (
                          <DropdownMenuItem
                            disabled={copyMutation.isPending}
                            onSelect={() =>
                              copyMutation.mutate({
                                id: item.id,
                                title: item.title,
                                storagePath: item.storage_path as string,
                              })
                            }
                          >
                            <Copy className="me-2 size-4" aria-hidden="true" /> نسخ ملف
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onSelect={() =>
                            setDetailsTarget({
                              id: item.id,
                              title: item.title,
                              reference: item.archive_reference,
                              archivedAt: item.archived_at ?? item.created_at,
                              originalNumber: item.original_file_number,
                              copiedFrom: item.copied_from_id,
                            })
                          }
                        >
                          <Info className="me-2 size-4" aria-hidden="true" /> تفاصيل وسجل التعديلات
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setMoveTarget({ id: item.id, title: item.title })}
                        >
                          <FolderPlus className="me-2 size-4" aria-hidden="true" /> نقل إلى مجلد
                        </DropdownMenuItem>
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
      <DownloadDialog target={downloadTarget} onClose={() => setDownloadTarget(null)} />

      <ResponsiveModal
        open={detailsTarget !== null}
        onOpenChange={(o) => !o && setDetailsTarget(null)}
        title="تفاصيل الملف"
        description="سجل تعديلات الملف داخلي ولا يكرر الملف في القائمة."
      >
        {detailsTarget ? (
          <div className="space-y-4 pb-2">
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">اسم الملف</dt>
                <dd className="font-medium text-foreground">{detailsTarget.title}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">رقم الملف</dt>
                <dd className="font-medium text-foreground">
                  <bdi dir="ltr">{detailsTarget.reference}</bdi>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">تاريخ الأرشفة</dt>
                <dd className="font-medium text-foreground">
                  <bdi dir="ltr">{formatDateTime(detailsTarget.archivedAt)}</bdi>
                </dd>
              </div>
              {detailsTarget.originalNumber ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">رقم الأصل</dt>
                  <dd className="font-medium text-foreground">
                    <bdi dir="ltr">{detailsTarget.originalNumber}</bdi>
                  </dd>
                </div>
              ) : null}
              {detailsTarget.copiedFrom ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">المصدر</dt>
                  <dd className="font-medium text-foreground">نسخة من ملف آخر في الأرشيف</dd>
                </div>
              ) : null}
            </dl>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">سجل تعديلات الملف</p>
              {versions.isPending ? (
                <Skeleton className="h-16 w-full rounded-xl" />
              ) : versions.isError ? (
                <ErrorState
                  description="تعذّر تحميل سجل التعديلات"
                  onRetry={() => void versions.refetch()}
                />
              ) : !versions.data?.length ? (
                <p className="text-xs text-muted-foreground">لا توجد تعديلات محفوظة بعد.</p>
              ) : (
                <ul className="space-y-2">
                  {versions.data.map((v) => (
                    <li key={v.id} className="rounded-xl border border-border p-3 text-xs">
                      <p className="font-medium text-foreground">
                        التعديل رقم <bdi dir="ltr">{formatNumber(v.version_no)}</bdi> — {v.title}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        <bdi dir="ltr">{formatDateTime(v.created_at)}</bdi>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </ResponsiveModal>

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
          {CREATE_ACTIONS.map((a) => (
            <Button
              key={a.key}
              type="button"
              variant="outline"
              className="min-h-12 justify-start gap-2"
              onClick={() => openCreate(a.key)}
            >
              <a.icon className="size-4" aria-hidden="true" /> {a.label}
            </Button>
          ))}
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
        open={createKind !== null}
        onOpenChange={(o) => !o && setCreateKind(null)}
        title={createKind === "excel" ? "مصنف Excel جديد" : "مستند Word جديد"}
        description="سيُنشأ ملف حقيقي داخل مخزن الأرشيف الخاص بالحساب النشط، ويمكن فتحه وتعديله داخل المنصة أو تنزيله."
        footer={
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={createOfficeMutation.isPending || createName.trim().length < 1}
            onClick={() =>
              createKind &&
              createOfficeMutation.mutate({
                kind: createKind,
                name: createName,
                folderId: createFolderId,
              })
            }
          >
            {createOfficeMutation.isPending ? "جارٍ الإنشاء…" : "إنشاء الملف"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="office-name">اسم الملف</Label>
            <Input
              id="office-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={createKind === "excel" ? "جدول الكميات" : "محضر اجتماع"}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="office-folder">المجلد</Label>
            <select
              id="office-folder"
              value={createFolderId ?? ""}
              onChange={(e) => setCreateFolderId(e.target.value || null)}
              className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
            >
              <option value="">بدون مجلد</option>
              {(folders.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={moveTarget !== null}
        onOpenChange={(o) => !o && setMoveTarget(null)}
        title="نقل إلى مجلد"
      >
        <div className="space-y-2">
          <Label htmlFor="move-folder">اختر المجلد</Label>
          <select
            id="move-folder"
            defaultValue=""
            onChange={(e) =>
              moveTarget &&
              moveMutation.mutate({ id: moveTarget.id, folderId: e.target.value || null })
            }
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="">بدون مجلد</option>
            {(folders.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
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

      <OfficeEditor
        target={officeTarget}
        entityId={entityId}
        onClose={() => setOfficeTarget(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["archive"] })}
      />
    </div>
  );
}
