import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus } from "lucide-react";

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
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import { getMyMemberships } from "@/lib/auth.functions";
import {
  cancelAppointment,
  confirmAppointment,
  listAppointments,
  proposeAppointment,
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
          "حجز الزيارات والاستشارات والاجتماعات بمنطقة زمنية لكل طرف، مع تذكير قبل الموعد وإلغاء بمهلة معلنة.",
      },
      { property: "og:title", content: "المواعيد | ركيز" },
      {
        property: "og:description",
        content: "التوقيت المرجعي UTC يُعرض بتوقيت كل طرف، والإلغاء مرفوض بعد انقضاء المهلة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TZ = [
  "Asia/Riyadh",
  "Asia/Dubai",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Istanbul",
  "America/New_York",
];

const KINDS: Array<{ value: string; label: string }> = [
  { value: "visit", label: "زيارة موقع" },
  { value: "consultation", label: "استشارة" },
  { value: "meeting", label: "اجتماع" },
];

const STATUS_LABEL: Record<string, string> = {
  proposed: "مقترح",
  confirmed: "مؤكد",
  cancelled: "ملغى",
  completed: "منتهٍ",
};

const fmt = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

function AppointmentsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listAppointments);
  const fetchMemberships = useServerFn(getMyMemberships);
  const propose = useServerFn(proposeAppointment);
  const confirm = useServerFn(confirmAppointment);
  const cancel = useServerFn(cancelAppointment);

  const [form, setForm] = useState({
    requesterEntityId: "",
    providerEntityId: "",
    kind: "consultation",
    title: "",
    startsAt: "",
    requesterTimezone: "Asia/Riyadh",
    providerTimezone: "Europe/London",
    durationMinutes: "60",
    cancelHours: "24",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const memberships = useQuery({ queryKey: ["my-memberships"], queryFn: () => fetchMemberships() });
  const list = useQuery({ queryKey: ["appointments"], queryFn: () => fetchList() });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["appointments"] });
  const failure = (e: Error) =>
    toast.error(
      e.message === "APPOINTMENT_CANCEL_WINDOW_PASSED"
        ? "انقضت مهلة الإلغاء المتفق عليها لهذا الموعد"
        : e.message === "ENTITY_READ_ONLY"
          ? "حساب الكيان في وضع القراءة فقط بعد انتهاء الاشتراك"
          : e.message === "NOT_A_MEMBER_OF_ENTITY"
            ? "لا تنتمي إلى الكيان الطالب"
            : "تعذّر تنفيذ الإجراء، حاول مرة أخرى",
    );

  const create = useMutation({
    mutationFn: () =>
      propose({
        data: {
          requesterEntityId: form.requesterEntityId,
          providerEntityId: form.providerEntityId,
          kind: form.kind,
          title: form.title.trim(),
          startsAt: new Date(form.startsAt).toISOString(),
          requesterTimezone: form.requesterTimezone,
          providerTimezone: form.providerTimezone,
          durationMinutes: Number(form.durationMinutes),
          listingId: null,
          cancelHours: Number(form.cancelHours),
          notes: null,
        },
      }),
    onSuccess: () => {
      toast.success("أُرسل اقتراح الموعد وجُدول التذكير");
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
    if (!form.requesterEntityId) next['requesterEntityId'] = "اختر كيانك الطالب";
    if (!form.providerEntityId) next['providerEntityId'] = "أدخل معرّف كيان مقدّم الخدمة";
    if (form.title.trim().length < 3) next['title'] = "أدخل عنوانًا واضحًا للموعد";
    if (!form.startsAt) next['startsAt'] = "حدد تاريخ ووقت البداية";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const rows = list.data ?? [];

  return (
    <div className="space-y-6">
      <PageHero
        title="المواعيد"
        subtitle="UTC هو المرجع الوحيد للوقت، ويُعرض لكل طرف بمنطقته الزمنية. التذكير مجدول تلقائيًا، والإلغاء يحترم المهلة المعلنة."
        badge={<HeroBadge>المرحلة 24</HeroBadge>}
      >
        <p className="mt-3 text-sm text-muted-foreground">
          الاتصال المرئي المدمج مؤجَّل ولا يُدَّعى وجوده.
        </p>
      </PageHero>

      <SectionCard icon={CalendarPlus} title="اقتراح موعد">
        <FieldGrid>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">كياني (الطالب)</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.requesterEntityId}
              onChange={(e) => setForm({ ...form, requesterEntityId: e.target.value })}
            >
              <option value="">اختر الكيان…</option>
              {(memberships.data ?? []).map((m) => (
                <option key={m.entity.id} value={m.entity.id}>
                  {m.entity.name}
                </option>
              ))}
            </select>
            {errors['requesterEntityId'] ? (
              <span className="text-xs text-destructive">{errors['requesterEntityId']}</span>
            ) : null}
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">كيان مقدّم الخدمة</span>
            <Input
              dir="ltr"
              className="text-start"
              value={form.providerEntityId}
              onChange={(e) => setForm({ ...form, providerEntityId: e.target.value })}
              placeholder="معرّف الكيان"
            />
            {errors['providerEntityId'] ? (
              <span className="text-xs text-destructive">{errors['providerEntityId']}</span>
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
            <span className="font-medium">البداية (بتوقيت جهازك)</span>
            <Input
              type="datetime-local"
              dir="ltr"
              className="text-start"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
            {errors['startsAt'] ? (
              <span className="text-xs text-destructive">{errors['startsAt']}</span>
            ) : null}
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">المدة (دقيقة)</span>
            <Input
              dir="ltr"
              className="text-start"
              inputMode="numeric"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">منطقتي الزمنية</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.requesterTimezone}
              onChange={(e) => setForm({ ...form, requesterTimezone: e.target.value })}
            >
              {TZ.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">منطقة الطرف الآخر</span>
            <select
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.providerTimezone}
              onChange={(e) => setForm({ ...form, providerTimezone: e.target.value })}
            >
              {TZ.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">مهلة الإلغاء (ساعة)</span>
            <Input
              dir="ltr"
              className="text-start"
              inputMode="numeric"
              value={form.cancelHours}
              onChange={(e) => setForm({ ...form, cancelHours: e.target.value })}
            />
          </label>
        </FieldGrid>

        <div className="mt-4">
          <Button
            onClick={() => {
              if (validate()) create.mutate();
            }}
            disabled={create.isPending}
          >
            {create.isPending ? "جارٍ الإرسال…" : "اقتراح الموعد"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard icon={CalendarClock} title="مواعيدي" count={rows.length}>
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
            message="لا مواعيد بعد — اقترح موعدًا مع مقدّم خدمة ليظهر هنا."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((a) => (
              <div key={a.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{a.title}</h3>
                  <Badge variant="secondary">{STATUS_LABEL[a.status] ?? a.status}</Badge>
                </div>
                <div className="mt-3">
                  <FieldGrid>
                    <Field
                      label={`توقيت الطالب (${a.requester_timezone})`}
                      value={<span dir="ltr">{fmt(a.starts_at, a.requester_timezone)}</span>}
                    />
                    <Field
                      label={`توقيت المزوّد (${a.provider_timezone})`}
                      value={<span dir="ltr">{fmt(a.starts_at, a.provider_timezone)}</span>}
                    />
                    <Field
                      label="مهلة الإلغاء تنتهي"
                      value={
                        a.cancel_deadline_at ? (
                          <span dir="ltr">{fmt(a.cancel_deadline_at, a.requester_timezone)}</span>
                        ) : (
                          "غير محددة"
                        )
                      }
                    />
                    <Field label="المدة" value={`${a.duration_minutes} دقيقة`} />
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
