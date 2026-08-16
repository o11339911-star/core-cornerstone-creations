import { useMemo, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, ErrorState, HeroBadge, PageHero, SectionCard } from "@/components/rakeez";
import { ArchiveButton } from "@/components/archive/archive-button";
import { FileSearch, FileText, UploadCloud } from "lucide-react";
import {
  DOC_VISIBILITIES,
  approveDocument,
  createDocument,
  getDocumentDownloadUrl,
  listDocumentCategories,
  listDocuments,
  listMyDocumentEntities,
  reserveDocumentVersion,
  softDeleteDocument,
  type DocumentListItem,
  type DocVisibility,
} from "@/lib/documents.functions";

const documentsSearchSchema = z.object({
  entityId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/documents/")({
  component: DocumentsPage,
  errorComponent: ErrorState,
  validateSearch: (search) => documentsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "مكتبة المستندات | ركيز" },
      {
        name: "description",
        content:
          "مكتبة مستندات ركيز: إصدارات غير قابلة للتعديل، ربط بالمشاريع والعقود والمراحل، ومستويات رؤية دقيقة لكل وثيقة.",
      },
      { property: "og:title", content: "مكتبة المستندات | ركيز" },
      {
        property: "og:description",
        content: "أرشيف موحّد للتقارير والمخططات والشهادات مع تتبّع كامل للإصدارات والصلاحيات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const VISIBILITY_LABEL: Record<DocVisibility, string> = {
  entity_private: "خاص بالكيان",
  requester_private: "خاص بمقدّم الطلب",
  party_limited: "أطراف محددة",
  project_wide: "كل أطراف المشروع",
  public_approved: "عام معتمد",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  superseded: "مُستبدل",
  archived: "مؤرشف",
};

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function DocumentsPage() {
  const { entityId: entityIdFilter } = Route.useSearch();
  const queryClient = useQueryClient();
  const fetchDocuments = useServerFn(listDocuments);
  const fetchCategories = useServerFn(listDocumentCategories);
  const fetchEntities = useServerFn(listMyDocumentEntities);
  const createDoc = useServerFn(createDocument);
  const reserveVersion = useServerFn(reserveDocumentVersion);
  const download = useServerFn(getDocumentDownloadUrl);
  const approve = useServerFn(approveDocument);
  const remove = useServerFn(softDeleteDocument);

  const [entityId, setEntityId] = useState<string>("");
  const [categoryCode, setCategoryCode] = useState<string>("");
  const [visibility, setVisibility] = useState<DocVisibility>("entity_private");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filterVisibility, setFilterVisibility] = useState<string>("all");

  const entitiesQuery = useQuery({ queryKey: ["doc-entities"], queryFn: () => fetchEntities() });
  const categoriesQuery = useQuery({
    queryKey: ["doc-categories"],
    queryFn: () => fetchCategories(),
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", filterVisibility, entityIdFilter],
    queryFn: () =>
      fetchDocuments({
        data: {
          ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
          ...(filterVisibility === "all"
            ? {}
            : { visibility: filterVisibility as DocVisibility }),
        },
      }),
  });

  const categories = categoriesQuery.data ?? [];
  const activeCategory = useMemo(
    () => categories.find((c) => c.code === categoryCode),
    [categories, categoryCode],
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!entityId) throw new Error("اختر الكيان المالك");
      if (!categoryCode) throw new Error("اختر تصنيف المستند");
      if (!title.trim()) throw new Error("أدخل عنوان المستند");
      if (!file) throw new Error("اختر ملفًا للرفع");

      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const checksum = await sha256Hex(file);

      const { documentId } = await createDoc({
        data: {
          ownerEntityId: entityId,
          categoryCode,
          title: title.trim(),
          description: description.trim() || null,
          visibility: visibility === "public_approved" ? "entity_private" : visibility,
        },
      });

      const reserved = await reserveVersion({
        data: {
          documentId,
          fileExt: ext,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksumSha256: checksum,
        },
      });

      const { supabase } = await import("@/integrations/supabase/client");
      const upload = await supabase.storage
        .from(reserved.storage_bucket)
        .upload(reserved.storage_path, file, ...(file.type ? [{ contentType: file.type }] : []));
      if (upload.error) throw new Error(upload.error.message);
      return documentId;
    },
    onSuccess: () => {
      toast.success("تم رفع المستند وإنشاء الإصدار الأول");
      setTitle("");
      setDescription("");
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMutation = useMutation({
    mutationFn: (documentId: string) => approve({ data: { documentId } }),
    onSuccess: () => {
      toast.success("تم اعتماد المستند ونشره");
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      remove({ data: { documentId, reason: "حذف من مكتبة المستندات" } }),
    onSuccess: () => {
      toast.success("تم حذف المستند مؤقتًا");
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openVersion = async (versionId: string) => {
    try {
      const { url } = await download({ data: { versionId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const columns = [
    {
      id: "title",
      header: "المستند",
      cell: (row: DocumentListItem) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.title}</span>
          {row.description ? (
            <span className="text-xs text-muted-foreground">{row.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "category",
      header: "التصنيف",
      cell: (row: DocumentListItem) =>
        categories.find((c) => c.code === row.category_code)?.name_ar ?? row.category_code,
    },
    {
      id: "visibility",
      header: "الرؤية",
      cell: (row: DocumentListItem) => (
        <Badge variant="secondary">{VISIBILITY_LABEL[row.visibility]}</Badge>
      ),
    },
    {
      id: "status",
      header: "الحالة",
      cell: (row: DocumentListItem) => STATUS_LABEL[row.status] ?? row.status,
    },
    {
      id: "actions",
      header: "إجراءات",
      cell: (row: DocumentListItem) => (
        <div className="flex flex-wrap gap-2">
          {row.current_version_id ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void openVersion(row.current_version_id as string)}
            >
              فتح الإصدار الحالي
            </Button>
          ) : null}
          {!row.approved_at ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => approveMutation.mutate(row.id)}
              disabled={approveMutation.isPending}
            >
              اعتماد ونشر
            </Button>
          ) : null}
          <ArchiveButton
            compact
            title={row.title}
            kind="document"
            sourceTable="documents"
            sourceId={row.id}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMutation.mutate(row.id)}
            disabled={deleteMutation.isPending}
          >
            حذف
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title="مكتبة المستندات"
        subtitle="أرشيف موحّد للتقارير والمخططات والشهادات، بإصدارات غير قابلة للتعديل ورؤية محددة لكل مستند."
        badge={<HeroBadge tone="neutral">{documentsQuery.data?.length ?? 0}</HeroBadge>}
      />

      <SectionCard
        icon={UploadCloud}
        title="إضافة مستند جديد"
        action={
          <Button asChild className="min-h-11">
            <Link to="/documents/analyze">
              <FileSearch className="me-2 size-4" />
              رفع وتحليل
            </Link>
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>الكيان المالك</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الكيان" />
              </SelectTrigger>
              <SelectContent>
                {(entitiesQuery.data ?? []).map((entity) => (
                  <SelectItem key={entity.entity_id} value={entity.entity_id}>
                    {entity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>التصنيف</Label>
            <Select value={categoryCode} onValueChange={setCategoryCode}>
              <SelectTrigger>
                <SelectValue placeholder="اختر التصنيف" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.code} value={category.code}>
                    {category.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeCategory ? (
              <p className="text-xs text-muted-foreground">
                الحد الأقصى: {activeCategory.max_size_mb} ميجابايت
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>عنوان المستند</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>مستوى الرؤية</Label>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as DocVisibility)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_VISIBILITIES.filter((v) => v !== "public_approved").map((value) => (
                  <SelectItem key={value} value={value}>
                    {VISIBILITY_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              النشر العام لا يتم إلا عبر اعتماد صريح بعد الرفع.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>الوصف</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>الملف</Label>
            <Input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <Button
          className="mt-4 min-h-11"
          onClick={() => uploadMutation.mutate()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? "جارٍ الرفع…" : "رفع المستند"}
        </Button>
      </SectionCard>

      <SectionCard
        icon={FileText}
        title="المستندات المتاحة لك"
        count={documentsQuery.data?.length ?? 0}
        action={
          <Select value={filterVisibility} onValueChange={setFilterVisibility}>
            <SelectTrigger className="min-h-11 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل مستويات الرؤية</SelectItem>
              {DOC_VISIBILITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {VISIBILITY_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <DataTable
          columns={columns}
          rows={documentsQuery.data ?? []}
          isLoading={documentsQuery.isLoading}
          emptyTitle="لا توجد مستندات بعد"
          emptyDescription="ابدأ برفع أول مستند إلى مكتبة الكيان."
          getRowId={(row: DocumentListItem) => row.id}
        />
      </SectionCard>
    </div>
  );
}
