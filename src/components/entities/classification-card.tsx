import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, Loader2, Search, Star, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, SoftEmpty } from "@/components/rakeez";
import {
  getEntityActivities,
  getEntityLegalForm,
  listLegalForms,
  searchEconomicActivities,
  setEntityClassification,
  type ActivitySuggestion,
} from "@/lib/classification.functions";

type Props = { entityId: string; canManage: boolean };

/**
 * الشكل النظامي (الصفة القانونية) والنشاط الاقتصادي كحقلين منفصلين تمامًا.
 * لا إسناد تلقائي: البحث يقترح فقط، والمستخدم هو من يؤكد النشاط الأساسي والثانوي.
 */
export function EntityClassificationCard({ entityId, canManage }: Props) {
  const qc = useQueryClient();
  const fetchForms = useServerFn(listLegalForms);
  const fetchLegalForm = useServerFn(getEntityLegalForm);
  const searchFn = useServerFn(searchEconomicActivities);
  const fetchActivities = useServerFn(getEntityActivities);
  const saveFn = useServerFn(setEntityClassification);

  const [legalForm, setLegalForm] = React.useState<string>("");
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [primary, setPrimary] = React.useState<ActivitySuggestion | null>(null);
  const [secondary, setSecondary] = React.useState<ActivitySuggestion[]>([]);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const forms = useQuery({ queryKey: ["legal-forms"], queryFn: () => fetchForms() });

  const currentForm = useQuery({
    queryKey: ["entity-legal-form", entityId],
    queryFn: () => fetchLegalForm({ data: { entityId } }),
  });

  React.useEffect(() => {
    if (currentForm.data && !dirty) setLegalForm(currentForm.data.legalFormCode ?? "");
  }, [currentForm.data, dirty]);

  const current = useQuery({
    queryKey: ["entity-activities", entityId],
    queryFn: () => fetchActivities({ data: { entityId } }),
  });

  React.useEffect(() => {
    if (!current.data || dirty) return;
    const p = current.data.find((a) => a.is_primary);
    setPrimary(
      p
        ? {
            code: p.activity_code,
            parent_code: null,
            level: 0,
            name_ar: p.name_ar ?? p.activity_code,
            name_en: "",
            path_ar: p.name_ar ?? p.activity_code,
          }
        : null,
    );
    setSecondary(
      current.data
        .filter((a) => !a.is_primary)
        .map((a) => ({
          code: a.activity_code,
          parent_code: null,
          level: 0,
          name_ar: a.name_ar ?? a.activity_code,
          name_en: "",
          path_ar: a.name_ar ?? a.activity_code,
        })),
    );
  }, [current.data, dirty]);

  const results = useQuery({
    queryKey: ["activity-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced, limit: 20 } }),
    enabled: debounced.length >= 2,
  });

  const SAVE_ERRORS: Record<string, string> = {
    FORBIDDEN: "لا تملك صلاحية تعديل تصنيف هذا الكيان.",
    INVALID_LEGAL_FORM: "الشكل النظامي المختار غير معتمد.",
    INVALID_ACTIVITY_CODE: "أحد رموز النشاط غير موجود في القاموس المعتمد.",
    TARGET_NOT_FOUND: "الكيان غير موجود.",
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          entityId,
          legalFormCode: legalForm || null,
          // لا نكتب فوق القيم المحفوظة قبل اكتمال تحميل الحالة الحالية
          setLegalForm: currentForm.isSuccess,
          applyActivities: current.isSuccess,
          primaryCode: primary?.code ?? null,
          secondaryCodes: secondary.map((s) => s.code),
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["entity-activities", entityId] }),
        qc.invalidateQueries({ queryKey: ["entity-legal-form", entityId] }),
        qc.invalidateQueries({ queryKey: ["entity-official", entityId] }),
      ]);
      toast.success("تم حفظ التصنيف");
    },
    onError: (error: Error) =>
      toast.error(SAVE_ERRORS[error.message] ?? "تعذّر حفظ التصنيف. حاول مرة أخرى."),
  });

  const addPrimary = (a: ActivitySuggestion) => {
    setPrimary(a);
    setSecondary((prev) => prev.filter((s) => s.code !== a.code));
    setDirty(true);
  };
  const addSecondary = (a: ActivitySuggestion) => {
    if (primary?.code === a.code) return;
    setSecondary((prev) => (prev.some((s) => s.code === a.code) ? prev : [...prev, a]));
    setDirty(true);
  };

  return (
    <SectionCard icon={Building2} title="الشكل النظامي والنشاط الاقتصادي">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="legal-form">الشكل النظامي / الصفة القانونية</Label>
          {forms.isPending ? (
            <Skeleton className="h-11 w-full rounded-xl" />
          ) : (
            <select
              id="legal-form"
              value={legalForm}
              disabled={!canManage}
              onChange={(e) => {
                setLegalForm(e.target.value);
                setDirty(true);
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">غير محدد</option>
              {(forms.data ?? []).map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name_ar}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">
            الشكل النظامي صفة قانونية فقط، ولا يُخلط بأنشطة مثل «مطور عقاري» أو «مقاول».
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="activity-search">ابحث عن النشاط الاقتصادي</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
            />
            <Input
              id="activity-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="مثال: مطور عقاري، مقاول، ناقل، مكتب هندسي"
              className="min-h-11 ps-9"
              disabled={!canManage}
              autoComplete="off"
            />
          </div>

          {debounced.length >= 2 ? (
            results.isPending ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : results.isError ? (
              <p role="alert" className="text-xs text-destructive">
                تعذّر البحث في قاموس الأنشطة.
              </p>
            ) : (results.data ?? []).length === 0 ? (
              <SoftEmpty icon={Search} message="لا توجد نتائج مطابقة." />
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border p-2">
                {(results.data ?? []).map((a) => (
                  <li
                    key={a.code}
                    className="flex flex-col gap-2 rounded-lg p-2 hover:bg-secondary/60 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{a.name_ar}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        <bdi dir="ltr">{a.code}</bdi> · {a.path_ar}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={!canManage}
                        onClick={() => addPrimary(a)}
                      >
                        <Star className="me-1 size-4" aria-hidden="true" /> أساسي
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        disabled={!canManage}
                        onClick={() => addSecondary(a)}
                      >
                        ثانوي
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">النشاط الأساسي</p>
          {primary ? (
            <Chip
              label={`${primary.name_ar} (${primary.code})`}
              onRemove={
                canManage
                  ? () => {
                      setPrimary(null);
                      setDirty(true);
                    }
                  : undefined
              }
            />
          ) : (
            <p className="text-xs text-muted-foreground">لم يُحدَّد بعد — اختر من نتائج البحث.</p>
          )}

          <p className="pt-2 text-sm font-semibold text-foreground">الأنشطة الثانوية</p>
          {secondary.length ? (
            <div className="flex flex-wrap gap-2">
              {secondary.map((s) => (
                <Chip
                  key={s.code}
                  label={`${s.name_ar} (${s.code})`}
                  onRemove={
                    canManage
                      ? () => {
                          setSecondary((prev) => prev.filter((x) => x.code !== s.code));
                          setDirty(true);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا توجد أنشطة ثانوية.</p>
          )}
        </div>

        {canManage ? (
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <>
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> جارٍ الحفظ…
              </>
            ) : (
              <>
                <Check className="me-2 size-4" aria-hidden="true" /> حفظ التصنيف
              </>
            )}
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove?: (() => void) | undefined }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-medium text-primary">
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`إزالة ${label}`}
          className="flex size-5 items-center justify-center rounded-full hover:bg-primary/10"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
