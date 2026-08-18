import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck2, CalendarClock, CalendarPlus, Loader2, Phone } from "lucide-react";

import { toLatinDigits } from "@/lib/format";
import { useAccountUi } from "@/lib/account-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CardsSkeleton,
  ErrorState,
  Field,
  FieldGrid,
  HeroBadge,
  PageHero,
  ISO_DATETIME_LOCAL_RE,
  LatinDateTimePicker,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import {
  bookAppointment,
  cancelAppointment,
  confirmAppointment,
  listAppointments,
  lookupProviderEntity,
} from "@/lib/appointments.functions";

export const Route = createFileRoute("/_authenticated/appointments")({
  component: AppointmentsPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "المواعيد | ركيز" },
      {
        name: "description",
        content:
          "حجز الزيارات والاستشارات والاجتماعات بتوقيت الرياض، مع تذكير قبل الموعد وسياسة إلغاء اختيارية.",
      },
      { property: "og:title", content: "المواعيد | ركيز" },
      {
        property: "og:description",
        content: "احجز موعدًا مع مقدّم خدمة برقمه المكوّن من عشرة أرقام، والتوقيت المرجعي محفوظ بدقة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const KINDS: Array<{ value: string; label: string }> = [
  { value: "visit", label: "زيارة موقع" },
  { value: "consultation", label: "استشارة" },
  { value: "meeting", label: "اجتماع" },
];

const STATUS_LABEL: Record<string, string> = {
  proposed: "بانتظار التأكيد",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  postponed: "مؤجل",
  completed: "منتهي",
};

const STATUS_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "proposed", label: "بانتظار التأكيد" },
  { value: "confirmed", label: "مؤكد" },
  { value: "cancelled", label: "ملغي" },
  { value: "completed", label: "منتهي" },
] as const;

const RIYADH = "Asia/Riyadh";

const fmt = (iso: string) =>
  toLatinDigits(
    new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      timeZone: RIYADH,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso)),
  );

/** تاريخ اليوم في الرياض بصيغة YYYY-MM-DD وبأرقام لاتينية مضمونة. */
function todayRiyadh(): string {
  const parts = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: RIYADH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const digitsOnly = (v: string) => toLatinDigits(v).replace(/[^0-9]/g, "");

function AppointmentsPage() {
  const qc = useQueryClient();
  const { activeEntity, loading: accountLoading } = useAccountUi();
  const fetchList = useServerFn(listAppointments);
  const book = useServerFn(bookAppointment);
  const lookup = useServerFn(lookupProviderEntity);
  const confirm = useServerFn(confirmAppointment);
  const cancel = useServerFn(cancelAppointment);

  const [form, setForm] = useState({
    providerNumber: "",
    kind: "consultation",
    title: "",
    startsAt: "",
    cancelHours: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerName, setProviderName] = useState<string | null>(null);
  const [providerState, setProviderState] = useState<"idle" | "loading" | "none" | "found">("idle");
  const [created, setCreated] = useState<{
    title: string;
    startsAt: string;
    provider: string;
    createdAt: string;
  } | null>(null);

  const list = useQuery({ queryKey: ["appointments"], queryFn: () => fetchList() });

  // بحث تلقائي عند اكتمال عشرة أرقام، دون كشف معرّف الكيان في المتصفح.
  useEffect(() => {
    const n = form.providerNumber;
    if (n.length !== 10) {
      setProviderName(null);
      setProviderState(n.length === 0 ? "idle" : "loading");
      return;
    }
    let cancelled = false;
    setProviderState("loading");
    const t = setTimeout(() => {
      void lookup({ data: { number: n } })
        .then((res) => {
          if (cancelled) return;
          if (res.status === "found" && res.name) {
            setProviderName(res.name);
            setProviderState("found");
          } else {
            setProviderName(null);
            setProviderState("none");
          }
        })
        .catch(() => {
          if (!cancelled) setProviderState("none");
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.providerNumber, lookup]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["appointments"] });
  const failure = (e: Error) =>
    toast.error(
      e.message === "APPOINTMENT_CANCEL_WINDOW_PASSED"
        ? "انقضت مهلة الإلغاء المتفق عليها لهذا الموعد"
        : e.message === "ENTITY_READ_ONLY"
          ? "حساب الكيان في وضع القراءة فقط بعد انتهاء الاشتراك"
          : e.message === "NOT_A_MEMBER_OF_ENTITY"
            ? "لا تملك صلاحية الحجز باسم الحساب النشط"
            : e.message === "PROVIDER_UNREGISTERED"
              ? "لا يوجد كيان مسجّل بهذا الرقم"
              : e.message === "PROVIDER_THROTTLED"
                ? "تجاوزت عدد محاولات البحث المسموح بها، حاول لاحقًا"
                : "تعذّر تنفيذ الإجراء، حاول مرة أخرى",
    );

  const create = useMutation({
    mutationFn: () =>
      book({
        data: {
          requesterEntityId: activeEntity?.id as string,
          providerNumber: form.providerNumber,
          kind: form.kind,
          title: form.title.trim(),
          startsAtLocal: form.startsAt,
          cancelHours: form.cancelHours ? Number(form.cancelHours) : null,
          notes: null,
        },
      }),
    onSuccess: (res) => {
      toast.success("تم حجز الموعد وجُدول التذكير");
      setCreated({
        title: form.title.trim(),
        startsAt: res.startsAt,
        provider: providerName ?? "",
        createdAt: new Date().toISOString(),
      });
      setForm((f) => ({ ...f, title: "", startsAt: "" }));
      invalidate();
    },
    onError: failure,
  });

  const doConfirm = useMutation({
    mutationFn: (id: string) => confirm({ data: { appointmentId: id } }),
    onSuccess: () => {
      toast.success("تم تأكيد الموعد");
      invalidate();
    },
    onError: failure,
  });

  const doCancel = useMutation({
    mutationFn: (id: string) => cancel({ data: { appointmentId: id, reason: "إلغاء من الواجهة" } }),
    onSuccess: () => {
      toast.success("تم إلغاء الموعد");
      invalidate();
    },
    onError: failure,
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!activeEntity?.id) next['account'] = "بدّل إلى حساب منشأة لحجز موعد باسمها";
    if (form.providerNumber.length !== 10)
      next['providerNumber'] = "أدخل عشرة أرقام بالضبط (0-9) لسجل مقدّم الخدمة";
    else if (providerState !== "found") next['providerNumber'] = "لا يوجد كيان مسجّل بهذا الرقم";
    if (form.title.trim().length < 3) next['title'] = "أدخل عنوانًا واضحًا للموعد";
    if (!ISO_DATETIME_LOCAL_RE.test(form.startsAt))
      next['startsAt'] = "حدد تاريخ ووقت الموعد من التقويم";
    else if (form.startsAt.slice(0, 10) < todayRiyadh())
      next['startsAt'] = "اختر تاريخًا في المستقبل بتوقيت الرياض";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const rows = (list.data ?? []).filter((a) =>
    statusFilter === "all" ? true : a.status === statusFilter,
  );

  return (
    <div className="space-y-6">
      <PageHero
        title="المواعيد"
        subtitle="الحجز والعرض بتوقيت الرياض، والتخزين بتوقيت عالمي مرجعي. التذكير مجدول تلقائيًا، وسياسة الإلغاء اختيارية."
        badge={<HeroBadge>{activeEntity?.name ?? "حساب شخصي"}</HeroBadge>}
      >
        <p className="mt-3 text-sm text-muted-foreground">
          بعد تأكيد الموعد يصبح الاتصال الصوتي الداخلي متاحًا من صفحة الاتصال، بلا كشف أرقام الجوال.
        </p>
      </PageHero>

      {created ? (
        <SectionCard icon={CalendarCheck2} title="تم حجز الموعد">
          <FieldGrid>
            <Field label="الموعد" value={created.title} />
            <Field label="مقدّم الخدمة" value={created.provider || "—"} />
            <Field label="الموعد بتوقيت الرياض" value={<span dir="ltr">{fmt(created.startsAt)}</span>} />
            <Field label="تاريخ الحجز" value={<span dir="ltr">{fmt(created.createdAt)}</span>} />
            <Field label="الحالة" value="بانتظار التأكيد" />
          </FieldGrid>
          <p className="mt-3 text-xs text-muted-foreground">
            الرقم المرجعي الموحّد ورمز التحقق (QR) للمواعيد غير مفعّلين بعد لأن تعديل قاعدة البيانات
            المطلوب لهما غير متاح حاليًا.
          </p>
        </SectionCard>
      ) : null}

      <SectionCard icon={CalendarPlus} title="حجز موعد">
        {!accountLoading && !activeEntity?.id ? (
          <p className="mb-4 rounded-lg bg-secondary p-3 text-sm text-primary">
            الحجز يتم باسم منشأة. بدّل إلى حساب المنشأة من مبدّل الحسابات ثم أعد المحاولة.
          </p>
        ) : null}
        <FieldGrid>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">رقم كيان مقدّم الخدمة (10 أرقام)</span>
            <Input
              dir="ltr"
              className="text-start"
              inputMode="numeric"
              maxLength={10}
              value={form.providerNumber}
              onChange={(e) =>
                setForm({ ...form, providerNumber: digitsOnly(e.target.value).slice(0, 10) })
              }
              placeholder="7000000001"
            />
            {form.providerNumber.length === 10 && providerState === "loading" ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" /> جارٍ البحث…
              </span>
            ) : null}
            {providerState === "found" && providerName ? (
              <span className="text-xs font-medium text-primary">{providerName}</span>
            ) : null}
            {errors['providerNumber'] ? (
              <span className="text-xs text-destructive">{errors['providerNumber']}</span>
            ) : null}
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">نوع الموعد</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">العنوان</span>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="استشارة تصميم"
            />
            {errors['title'] ? (
              <span className="text-xs text-destructive">{errors['title']}</span>
            ) : null}
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">الموعد (بتوقيت الرياض)</span>
            <LatinDateTimePicker
              value={form.startsAt}
              onChange={(v) => setForm({ ...form, startsAt: v })}
              min={todayRiyadh()}
              invalid={!!errors['startsAt']}
            />
            {errors['startsAt'] ? (
              <span className="text-xs text-destructive">{errors['startsAt']}</span>
            ) : null}
          </label>


          <label className="space-y-1.5 text-sm">
            <span className="font-medium">مهلة الإلغاء بالساعات (اختياري)</span>
            <Input
              dir="ltr"
              className="text-start"
              inputMode="numeric"
              maxLength={3}
              value={form.cancelHours}
              onChange={(e) => setForm({ ...form, cancelHours: digitsOnly(e.target.value).slice(0, 3) })}
              placeholder="بدون سياسة إلغاء"
            />
          </label>
        </FieldGrid>

        {errors['account'] ? (
          <p className="mt-3 text-xs text-destructive">{errors['account']}</p>
        ) : null}

        <div className="mt-4">
          <Button
            onClick={() => {
              if (validate()) create.mutate();
            }}
            disabled={create.isPending}
          >
            {create.isPending ? "جارٍ الحجز…" : "حجز الموعد"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={CalendarClock} title="مواعيدي" count={rows.length}>
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
                statusFilter === f.value
                  ? "border-primary bg-secondary text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {list.isLoading ? (
          <CardsSkeleton cards={3} />
        ) : list.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">تعذّر تحميل المواعيد.</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <SoftEmpty
            icon={CalendarClock}
            message="لا مواعيد في هذا التصنيف — احجز موعدًا مع مقدّم خدمة ليظهر هنا."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((a) => (
              <div key={a.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{a.title}</h3>
                  <Badge variant="secondary">{STATUS_LABEL[a.status] ?? "بانتظار التأكيد"}</Badge>
                </div>
                <div className="mt-3">
                  <FieldGrid>
                    <Field
                      label="الموعد بتوقيت الرياض"
                      value={<span dir="ltr">{fmt(a.starts_at)}</span>}
                    />
                    <Field
                      label="مهلة الإلغاء تنتهي"
                      value={
                        a.cancel_deadline_at ? (
                          <span dir="ltr">{fmt(a.cancel_deadline_at)}</span>
                        ) : (
                          "بدون سياسة إلغاء"
                        )
                      }
                    />
                  </FieldGrid>
                </div>
                {a.status === "proposed" || a.status === "confirmed" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {a.status === "proposed" ? (
                      <Button
                        size="sm"
                        onClick={() => doConfirm.mutate(a.id)}
                        disabled={doConfirm.isPending}
                      >
                        تأكيد
                      </Button>
                    ) : null}
                    {a.status === "confirmed" ? (
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/calls" className="inline-flex items-center gap-2">
                          <Phone className="size-4" aria-hidden="true" />
                          اتصال صوتي
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doCancel.mutate(a.id)}
                      disabled={doCancel.isPending}
                    >
                      إلغاء
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
