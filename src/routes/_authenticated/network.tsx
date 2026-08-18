import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BookUser,
  Check,
  Loader2,
  Mail,
  Phone,
  PhoneCall,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { toLatinDigits } from "@/lib/format";
import { useAccountUi } from "@/lib/account-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CardsSkeleton,
  ErrorState,
  Field,
  FieldGrid,
  HeroBadge,
  PageHero,
  ResponsiveModal,
  SectionCard,
  SoftEmpty,
} from "@/components/rakeez";
import {
  deleteNetworkContact,
  listNetworkContacts,
  listNetworkLinks,
  requestNetworkLink,
  respondNetworkLink,
  revokeNetworkLink,
  saveNetworkContact,
  searchNetwork,
  type NetworkSearchHit,
} from "@/lib/network.functions";

export const Route = createFileRoute("/_authenticated/network")({
  component: NetworkPage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "شبكة التواصل | ركيز" },
      {
        name: "description",
        content:
          "دليل علاقات واتصال للأفراد والكيانات: جهات اتصال خاصة، وطلبات تواصل بموافقة صريحة قبل مشاركة أي وسيلة اتصال.",
      },
      { property: "og:title", content: "شبكة التواصل | ركيز" },
      {
        property: "og:description",
        content: "أضف جهات اتصالك الخاصة، وابحث عن شخص أو كيان في ركيز، وأرسل طلب تواصل آمنًا.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS = [
  { value: "contacts", label: "جهات اتصالي" },
  { value: "links", label: "طلبات التواصل" },
  { value: "search", label: "بحث في ركيز" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الرد",
  accepted: "تم التواصل",
  rejected: "مرفوض",
  revoked: "منتهٍ",
};

const emptyContact = {
  fullName: "",
  organization: "",
  roleTitle: "",
  email: "",
  phone: "",
  activity: "",
  address: "",
  notes: "",
};

function NetworkPage() {
  const qc = useQueryClient();
  const { activeEntity } = useAccountUi();
  const fetchContacts = useServerFn(listNetworkContacts);
  const fetchLinks = useServerFn(listNetworkLinks);
  const saveContact = useServerFn(saveNetworkContact);
  const removeContact = useServerFn(deleteNetworkContact);
  const doSearch = useServerFn(searchNetwork);
  const askLink = useServerFn(requestNetworkLink);
  const answerLink = useServerFn(respondNetworkLink);
  const endLink = useServerFn(revokeNetworkLink);

  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("contacts");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyContact);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<NetworkSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  const contacts = useQuery({ queryKey: ["network", "contacts"], queryFn: () => fetchContacts() });
  const links = useQuery({ queryKey: ["network", "links"], queryFn: () => fetchLinks() });

  const invalidate = (key: string) => void qc.invalidateQueries({ queryKey: ["network", key] });

  const create = useMutation({
    mutationFn: () =>
      saveContact({
        data: {
          id: null,
          ownerEntityId: activeEntity?.id ?? null,
          fullName: form.fullName.trim(),
          organization: form.organization.trim() || null,
          roleTitle: form.roleTitle.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          activity: form.activity.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        },
      }),
    onSuccess: (res) => {
      if (!res.available) {
        toast.error("إضافة جهات الاتصال غير متاحة في حسابك حاليًا");
        return;
      }
      toast.success("أُضيفت جهة الاتصال إلى دفترك الخاص");
      setForm(emptyContact);
      setOpen(false);
      invalidate("contacts");
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "EMAIL_INVALID"
          ? "صيغة البريد الإلكتروني غير صحيحة"
          : e.message === "PHONE_INVALID"
            ? "صيغة رقم الجوال غير صحيحة"
            : "تعذّر حفظ جهة الاتصال، حاول مرة أخرى",
      ),
  });

  const doDelete = useMutation({
    mutationFn: (id: string) => removeContact({ data: { id } }),
    onSuccess: () => {
      toast.success("حُذفت جهة الاتصال");
      invalidate("contacts");
    },
    onError: () => toast.error("تعذّر حذف جهة الاتصال"),
  });

  const request = useMutation({
    mutationFn: (hit: NetworkSearchHit) =>
      askLink({
        data: {
          targetKind: hit.kind,
          targetId: hit.id,
          requesterEntityId: activeEntity?.id ?? null,
          message: null,
        },
      }),
    onSuccess: (res) => {
      if (!res.available) {
        toast.error("طلبات التواصل غير متاحة في حسابك حاليًا");
        return;
      }
      toast.success("أُرسل طلب التواصل، وسيصل إشعار للطرف الآخر");
      invalidate("links");
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("LINK_ALREADY_EXISTS")
          ? "يوجد طلب أو ارتباط قائم مع هذا الطرف"
          : "تعذّر إرسال طلب التواصل",
      ),
  });

  const respond = useMutation({
    mutationFn: (input: { linkId: string; accept: boolean }) =>
      answerLink({
        data: {
          linkId: input.linkId,
          accept: input.accept,
          shareEmail: false,
          sharePhone: false,
          shareInternalCall: true,
        },
      }),
    onSuccess: (_res, input) => {
      toast.success(input.accept ? "قُبل طلب التواصل" : "رُفض طلب التواصل");
      invalidate("links");
    },
    onError: () => toast.error("تعذّر تنفيذ الإجراء"),
  });

  const shareUpdate = useMutation({
    mutationFn: (input: { linkId: string; email: boolean; phone: boolean }) =>
      answerLink({
        data: {
          linkId: input.linkId,
          accept: true,
          shareEmail: input.email,
          sharePhone: input.phone,
          shareInternalCall: true,
        },
      }),
    onSuccess: () => {
      toast.success("حُدِّثت وسائل الاتصال المسموح بمشاركتها");
      invalidate("links");
    },
    onError: () => toast.error("تعذّر تحديث المشاركة"),
  });

  const revoke = useMutation({
    mutationFn: (linkId: string) => endLink({ data: { linkId } }),
    onSuccess: () => {
      toast.success("أُنهي ارتباط التواصل");
      invalidate("links");
    },
    onError: () => toast.error("تعذّر إنهاء الارتباط"),
  });

  const runSearch = async () => {
    const q = term.trim();
    if (q.length < 3) {
      toast.error("اكتب ثلاثة أحرف أو أرقام على الأقل للبحث");
      return;
    }
    setSearching(true);
    try {
      const res = await doSearch({ data: { query: q } });
      setHits(res.available ? res.hits : []);
    } catch {
      toast.error("تعذّر تنفيذ البحث، حاول مرة أخرى");
    } finally {
      setSearching(false);
    }
  };

  const submit = () => {
    const next: Record<string, string> = {};
    if (form.fullName.trim().length < 2) next['fullName'] = "أدخل اسم جهة الاتصال";
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  const contactRows = contacts.data?.contacts ?? [];
  const linkRows = links.data?.links ?? [];
  const incoming = linkRows.filter((l) => !l.outgoing);
  const outgoing = linkRows.filter((l) => l.outgoing);

  return (
    <div className="space-y-6">
      <PageHero
        title="شبكة التواصل"
        subtitle="دليل علاقاتك في ركيز: جهات اتصال خاصة بك، وارتباطات تواصل بين الحسابات لا تكشف بريدًا ولا جوالًا إلا بموافقة صريحة."
        badge={<HeroBadge>{activeEntity?.name ?? "حساب شخصي"}</HeroBadge>}
      >
        <div className="mt-4">
          <Button onClick={() => setOpen(true)} className="gap-2">
            <UserPlus className="size-4" aria-hidden="true" />
            إضافة جهة اتصال خاصة
          </Button>
        </div>
      </PageHero>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${
              tab === t.value
                ? "border-primary bg-secondary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "contacts" ? (
        <SectionCard icon={BookUser} title="جهات اتصالي" count={contactRows.length}>
          {contacts.isLoading ? (
            <CardsSkeleton cards={3} />
          ) : contacts.isError ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">تعذّر تحميل جهات الاتصال.</p>
              <Button variant="outline" onClick={() => void contacts.refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : contactRows.length === 0 ? (
            <SoftEmpty
              icon={BookUser}
              message="لم تُضف أي جهة اتصال بعد — ابدأ بإضافة جهة خاصة من زر الإضافة أعلاه."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {contactRows.map((c) => (
                <div key={c.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{c.full_name}</h3>
                    <Badge variant="secondary">جهة خاصة</Badge>
                  </div>
                  <div className="mt-3">
                    <FieldGrid>
                      <Field label="المنشأة" value={c.organization ?? "—"} />
                      <Field label="الصفة" value={c.role_title ?? "—"} />
                      <Field
                        label="البريد"
                        value={c.email ? <span dir="ltr">{c.email}</span> : "—"}
                      />
                      <Field
                        label="الجوال"
                        value={c.phone ? <span dir="ltr">{toLatinDigits(c.phone)}</span> : "—"}
                      />
                      <Field label="النشاط" value={c.activity ?? "—"} />
                      <Field label="العنوان" value={c.address ?? "—"} />
                    </FieldGrid>
                  </div>
                  {c.notes ? (
                    <p className="mt-3 text-sm text-muted-foreground">{c.notes}</p>
                  ) : null}
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doDelete.mutate(c.id)}
                      disabled={doDelete.isPending}
                    >
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "links" ? (
        <div className="space-y-6">
          <SectionCard icon={Users} title="طلبات واردة" count={incoming.length}>
            {links.isLoading ? (
              <CardsSkeleton cards={2} />
            ) : incoming.length === 0 ? (
              <SoftEmpty icon={Users} message="لا توجد طلبات تواصل واردة حاليًا." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {incoming.map((l) => (
                  <div key={l.id} className="rounded-xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{l.counterpart_name ?? "طرف مسجّل"}</h3>
                      <Badge variant="secondary">{STATUS_LABEL[l.status] ?? "بانتظار الرد"}</Badge>
                    </div>
                    {l.message ? (
                      <p className="mt-2 text-sm text-muted-foreground">{l.message}</p>
                    ) : null}
                    {l.status === "pending" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => respond.mutate({ linkId: l.id, accept: true })}
                          disabled={respond.isPending}
                          className="gap-2"
                        >
                          <Check className="size-4" aria-hidden="true" />
                          قبول
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => respond.mutate({ linkId: l.id, accept: false })}
                          disabled={respond.isPending}
                          className="gap-2"
                        >
                          <X className="size-4" aria-hidden="true" />
                          رفض
                        </Button>
                      </div>
                    ) : null}
                    {l.status === "accepted" ? (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          حدد وسائل الاتصال التي تسمح بمشاركتها مع هذا الطرف.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={l.share_email ? "default" : "outline"}
                            onClick={() =>
                              shareUpdate.mutate({
                                linkId: l.id,
                                email: !l.share_email,
                                phone: l.share_phone,
                              })
                            }
                            className="gap-2"
                          >
                            <Mail className="size-4" aria-hidden="true" />
                            البريد
                          </Button>
                          <Button
                            size="sm"
                            variant={l.share_phone ? "default" : "outline"}
                            onClick={() =>
                              shareUpdate.mutate({
                                linkId: l.id,
                                email: l.share_email,
                                phone: !l.share_phone,
                              })
                            }
                            className="gap-2"
                          >
                            <Phone className="size-4" aria-hidden="true" />
                            الجوال
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revoke.mutate(l.id)}
                            disabled={revoke.isPending}
                          >
                            إنهاء الارتباط
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={PhoneCall} title="طلباتي وارتباطاتي" count={outgoing.length}>
            {links.isLoading ? (
              <CardsSkeleton cards={2} />
            ) : outgoing.length === 0 ? (
              <SoftEmpty
                icon={PhoneCall}
                message="لم ترسل طلب تواصل بعد — ابحث عن شخص أو كيان ثم أرسل طلبًا."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {outgoing.map((l) => (
                  <div key={l.id} className="rounded-xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{l.counterpart_name ?? "طرف مسجّل"}</h3>
                      <Badge variant="secondary">{STATUS_LABEL[l.status] ?? "بانتظار الرد"}</Badge>
                    </div>
                    <div className="mt-3">
                      <FieldGrid>
                        <Field
                          label="الرقم المرجعي"
                          value={
                            l.reference ? (
                              <span dir="ltr">Rakiz {toLatinDigits(l.reference)}</span>
                            ) : (
                              "—"
                            )
                          }
                        />
                        <Field
                          label="البريد"
                          value={l.email ? <span dir="ltr">{l.email}</span> : "غير مشارك"}
                        />
                        <Field
                          label="الجوال"
                          value={
                            l.phone ? (
                              <span dir="ltr">{toLatinDigits(l.phone)}</span>
                            ) : (
                              "غير مشارك"
                            )
                          }
                        />
                        <Field
                          label="الاتصال الداخلي"
                          value={l.share_internal_call && l.status === "accepted" ? "متاح" : "غير متاح"}
                        />
                      </FieldGrid>
                    </div>
                    {l.status === "accepted" ? (
                      <div className="mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revoke.mutate(l.id)}
                          disabled={revoke.isPending}
                        >
                          إنهاء الارتباط
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "search" ? (
        <SectionCard icon={Search} title="البحث عن شخص أو كيان في ركيز">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[15rem] flex-1 space-y-1.5 text-sm">
              <span className="font-medium">الاسم أو رقم الهوية/السجل</span>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="اسم الجهة أو 7000000001"
              />
            </label>
            <Button onClick={() => void runSearch()} disabled={searching} className="gap-2">
              {searching ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              بحث
            </Button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            نتيجة البحث تعرض بطاقة مختصرة فقط. لا يظهر البريد ولا الجوال قبل قبول طلب التواصل.
          </p>

          <div className="mt-5">
            {hits === null ? null : hits.length === 0 ? (
              <SoftEmpty icon={Search} message="لا توجد نتائج مطابقة — جرّب اسمًا أو رقمًا آخر." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {hits.map((h) => (
                  <div
                    key={`${h.kind}-${h.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4"
                  >
                    <div>
                      <h3 className="font-semibold">{h.name ?? "طرف مسجّل"}</h3>
                      <p className="text-xs text-muted-foreground">
                        {h.kind === "entity" ? "كيان مسجّل" : "شخص مسجّل"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => request.mutate(h)}
                      disabled={request.isPending}
                    >
                      طلب تواصل
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="إضافة جهة اتصال خاصة"
        description="تُحفظ في دفترك أنت فقط، ولا تمنح أي وصول داخل المنصة."
      >
        <div className="space-y-4">
          <FieldGrid>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">الاسم</span>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
              {errors['fullName'] ? (
                <span className="text-xs text-destructive">{errors['fullName']}</span>
              ) : null}
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">المنشأة</span>
              <Input
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">الصفة</span>
              <Input
                value={form.roleTitle}
                onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">البريد الإلكتروني</span>
              <Input
                dir="ltr"
                className="text-start"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">رقم الجوال</span>
              <Input
                dir="ltr"
                className="text-start"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: toLatinDigits(e.target.value).replace(/[^0-9+]/g, "") })
                }
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">النشاط أو التصنيف</span>
              <Input
                value={form.activity}
                onChange={(e) => setForm({ ...form, activity: e.target.value })}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">العنوان</span>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
          </FieldGrid>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">ملاحظات خاصة</span>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "جارٍ الحفظ…" : "حفظ جهة الاتصال"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
