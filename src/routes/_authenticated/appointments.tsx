import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Loader2,
  Phone,
  QrCode as QrIcon,
} from "lucide-react";

import { toLatinDigits } from "@/lib/format";
import { useAccountUi } from "@/lib/account-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AppointmentCard,
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
  listMyAppointments,
  lookupProviderEntity,
  rescheduleAppointment,
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
  proposed: "بانتظار الموافقة",
  confirmed: "مؤكد",
  cancelled: "ملغي",
  postponed: "بانتظار الموافقة على الموعد الجديد",
  completed: "منتهي",
};

const STATUS_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "proposed", label: "بانتظار الموافقة" },
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
  const fetchList = useServerFn(listMyAppointments);
  const book = useServerFn(bookAppointment);
  const lookup = useServerFn(lookupProviderEntity);
  const confirm = useServerFn(confirmAppointment);
  const cancel = useServerFn(cancelAppointment);
  const reschedule = useServerFn(rescheduleAppointment);

  const [openCard, setOpenCard] = useState<string | null>(null);

  const [form, setForm] = useState({
    providerNumber: "",
    kind: "consultation",
    title: "",
    startsAt: "",
    cancelHours: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
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
        : e.message === "CONFIRM_BY_REQUESTER_FORBIDDEN" || e.message === "CONFIRM_NOT_YOUR_TURN"
        ? "التأكيد من اختصاص الطرف الآخر، ولا يمكن تأكيد موعد أنت طالبه"
        : e.message === "FORBIDDEN"
        ? "لا تملك صلاحية على هذا الموعد"
        : e.message === "APPOINTMENT_IN_THE_PAST"
        ? "اختر موعدًا في المستقبل بتوقيت الرياض"
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

  const doReschedule = useMutation({
    mutationFn: (v: { id: string; at: string }) =>
      reschedule({
        data: { appointmentId: v.id, newStartsAtLocal: v.at, reason: "إعادة جدولة من الواجهة" },
      }),
    onSuccess: () => {
      toast.success("تم اقتراح موعد جديد — بانتظار موافقة الطرف الآخر");
      setRescheduleFor(null);
      setRescheduleAt("");
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
            <Field label="الحالة" value="بانتظار الموافقة" />
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
                  <Badge variant="secondary">{STATUS_LABEL[a.status] ?? "بانتظار الموافقة"}</Badge>
                  <Badge variant="outline">
                    {a.my_side === "requester" ? "أنا الطالب" : "أنا مقدّم الخدمة"}
                  </Badge>
                  {a.pending_party ? (
                    <Badge variant="outline">
                      {a.pending_party === a.my_side
                        ? "بانتظار موافقتك"
                        : "بانتظار موافقة الطرف الآخر"}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-3">
                  <FieldGrid>
                    <Field
                      label="الموعد بتوقيت الرياض"
                      value={<span dir="ltr">{fmt(a.starts_at)}</span>}
                    />
                    {a.previous_starts_at ? (
                      <Field
                        label="الموعد السابق (سجل)"
                        value={<span dir="ltr">{fmt(a.previous_starts_at)}</span>}
                      />
                    ) : null}
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

                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenCard(openCard === a.id ? null : a.id)}
                    aria-expanded={openCard === a.id}
                  >
                    <QrIcon className="size-4" aria-hidden="true" />
                    {openCard === a.id ? "إخفاء بطاقة الموعد" : "بطاقة الموعد ورمز التحقق"}
                  </Button>
                </div>
                {openCard === a.id ? (
                  <div className="mt-3">
                    <AppointmentCard appointmentId={a.id} />
                  </div>
                ) : null}

                {a.can_cancel || a.can_reschedule || a.can_confirm ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {a.can_confirm ? (
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
                    {a.can_reschedule ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRescheduleError(null);
                          setRescheduleAt("");
                          setRescheduleFor(rescheduleFor === a.id ? null : a.id);
                        }}
                      >
                        إعادة جدولة
                      </Button>
                    ) : null}
                    {a.can_cancel ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => doCancel.mutate(a.id)}
                        disabled={doCancel.isPending}
                      >
                        إلغاء
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {rescheduleFor === a.id ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-border/60 bg-secondary/40 p-3">
                    <span className="text-sm font-medium">اقترح موعدًا جديدًا</span>
                    <LatinDateTimePicker
                      value={rescheduleAt}
                      onChange={setRescheduleAt}
                      min={todayRiyadh()}
                      invalid={!!rescheduleError}
                    />
                    {rescheduleError ? (
                      <span className="block text-xs text-destructive">{rescheduleError}</span>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      إعادة الجدولة لا تُعد تأكيدًا — يعود الموعد «بانتظار الموافقة» من الطرف الآخر،
                      ويُحفظ الموعد السابق في السجل.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={doReschedule.isPending}
                        onClick={() => {
                          if (!ISO_DATETIME_LOCAL_RE.test(rescheduleAt)) {
                            setRescheduleError("حدد تاريخ ووقت الموعد الجديد من التقويم");
                            return;
                          }
                          if (rescheduleAt.slice(0, 10) < todayRiyadh()) {
                            setRescheduleError("اختر تاريخًا في المستقبل بتوقيت الرياض");
                            return;
                          }
                          setRescheduleError(null);
                          doReschedule.mutate({ id: a.id, at: rescheduleAt });
                        }}
                      >
                        {doReschedule.isPending ? "جارٍ الإرسال…" : "إرسال الموعد الجديد"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRescheduleFor(null)}>
                        تراجع
                      </Button>
                    </div>
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
