import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, PageHero, SectionCard, SoftEmpty } from "@/components/rakeez";
import { ClipboardCheck, ListTodo, PackageCheck, Archive, RotateCcw } from "lucide-react";
import {
  closeProject,
  decideAcceptance,
  decideProjectReopen,
  listAcceptances,
  listClosureItems,
  listPunchItems,
  listReopenRequests,
  raisePunchItem,
  recordAcceptanceInspection,
  requestAcceptance,
  requestProjectReopen,
  setClosureItemStatus,
  setPunchItemStatus,
} from "@/lib/closure.functions";
import { formatRiyadh } from "@/lib/riyadh-time";

export const Route = createFileRoute("/_authenticated/projects/$projectId/closure")({
  component: ClosurePage,
  errorComponent: ErrorState,
  head: () => ({
    meta: [
      { title: "الاستلام والإغلاق | ركيز" },
      {
        name: "description",
        content:
          "قائمة تحقق الإغلاق، الاستلام الابتدائي والنهائي، النواقص بأدلة قبل/بعد، وإعادة الفتح المقيدة.",
      },
      { property: "og:title", content: "الاستلام والإغلاق | ركيز" },
      {
        property: "og:description",
        content: "إدارة استلام المشروع وإغلاقه وأرشفته بضوابط فصل واجبات كاملة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PHASE_AR: Record<string, string> = { provisional: "استلام ابتدائي", final: "استلام نهائي" };
const ACC_STATUS_AR: Record<string, string> = {
  requested: "مطلوب",
  inspected: "تمت المعاينة",
  accepted_with_defects: "مقبول مع ملاحظات",
  accepted: "مقبول",
  rejected: "مرفوض",
};
const ITEM_STATUS_AR: Record<string, string> = {
  pending: "معلّق",
  satisfied: "مستوفى",
  waived: "مُعفى",
};
const PUNCH_STATUS_AR: Record<string, string> = {
  open: "مفتوح",
  in_progress: "قيد المعالجة",
  submitted: "بانتظار الاعتماد",
  verified: "معتمد",
  rejected: "مرفوض",
  closed: "مغلق",
};
const SEVERITY_AR: Record<string, string> = {
  minor: "بسيط",
  major: "جوهري",
  critical: "حرج",
};

function ClosurePage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const fetchAcceptances = useServerFn(listAcceptances);
  const fetchItems = useServerFn(listClosureItems);
  const fetchPunch = useServerFn(listPunchItems);
  const fetchReopen = useServerFn(listReopenRequests);

  const acceptances = useQuery({
    queryKey: ["acceptances", projectId],
    queryFn: () => fetchAcceptances({ data: { projectId } }),
  });
  const items = useQuery({
    queryKey: ["closure-items", projectId],
    queryFn: () => fetchItems({ data: { projectId } }),
  });
  const punch = useQuery({
    queryKey: ["punch-items", projectId],
    queryFn: () => fetchPunch({ data: { projectId } }),
  });
  const reopens = useQuery({
    queryKey: ["reopen-requests", projectId],
    queryFn: () => fetchReopen({ data: { projectId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["acceptances", projectId] });
    void qc.invalidateQueries({ queryKey: ["closure-items", projectId] });
    void qc.invalidateQueries({ queryKey: ["punch-items", projectId] });
    void qc.invalidateQueries({ queryKey: ["reopen-requests", projectId] });
  };

  function useAction<T>(fn: (input: T) => Promise<unknown>, okMsg: string) {
    return useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(okMsg);
        invalidate();
      },
      onError: (e: Error) => toast.error(e.message),
    });
  }
  const run = useAction;

  const askAcceptance = run(useServerFn(requestAcceptance), "تم فتح طلب الاستلام");
  const inspect = run(useServerFn(recordAcceptanceInspection), "تم تسجيل المعاينة");
  const decide = run(useServerFn(decideAcceptance), "تم تسجيل القرار");
  const setItem = run(useServerFn(setClosureItemStatus), "تم تحديث بند القائمة");
  const addPunch = run(useServerFn(raisePunchItem), "تم تسجيل النقص");
  const setPunch = run(useServerFn(setPunchItemStatus), "تم تحديث حالة النقص");
  const close = run(useServerFn(closeProject), "تم إغلاق المشروع وأرشفته");
  const askReopen = run(useServerFn(requestProjectReopen), "تم رفع طلب إعادة الفتح");
  const decideReopen = run(useServerFn(decideProjectReopen), "تم البتّ في طلب إعادة الفتح");

  const [punchTitle, setPunchTitle] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <PageHero
        title="الاستلام والإغلاق"
        subtitle="لا يُغلق المشروع إلا باستلام نهائي معتمد، وبلا نواقص مفتوحة، وبعد استيفاء البنود الإلزامية. بعد الإغلاق تصبح بيانات المشروع للقراءة فقط على مستوى القاعدة."
      />

      <SectionCard
        icon={ClipboardCheck}
        title="الاستلام"
        count={acceptances.data?.length ?? 0}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => askAcceptance.mutate({ data: { projectId, phase: "provisional" } })}
            >
              طلب استلام ابتدائي
            </Button>
            <Button
              size="sm"
              onClick={() => askAcceptance.mutate({ data: { projectId, phase: "final" } })}
            >
              طلب استلام نهائي
            </Button>
          </div>
        }
      >
        {acceptances.data && acceptances.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {acceptances.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{PHASE_AR[a.phase]}</p>
                  <p className="text-xs text-muted-foreground">
                    طُلب: {formatRiyadh(a.requested_at)}
                    {a.decided_at ? ` · القرار: ${formatRiyadh(a.decided_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={a.status === "accepted" ? "default" : "secondary"}>
                    {ACC_STATUS_AR[a.status] ?? a.status}
                  </Badge>
                  {a.status === "requested" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => inspect.mutate({ data: { acceptanceId: a.id, note: null } })}
                    >
                      تسجيل معاينة
                    </Button>
                  ) : null}
                  {a.status === "inspected" || a.status === "accepted_with_defects" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          decide.mutate({
                            data: { acceptanceId: a.id, decision: "accepted", note: null },
                          })
                        }
                      >
                        قبول
                      </Button>
                      {a.status === "inspected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            decide.mutate({
                              data: {
                                acceptanceId: a.id,
                                decision: "accepted_with_defects",
                                note: null,
                              },
                            })
                          }
                        >
                          قبول مع ملاحظات
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <SoftEmpty icon={ClipboardCheck} message="لا توجد طلبات استلام بعد." />
        )}
      </SectionCard>

      <SectionCard icon={ListTodo} title="قائمة تحقق الإغلاق" count={items.data?.length ?? 0}>
        {items.data && items.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.data.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{it.name_ar}</p>
                  <p className="text-xs text-muted-foreground">
                    {PHASE_AR[it.phase]} · {it.is_required ? "إلزامي" : "اختياري"}
                    {it.waiver_reason ? ` · سبب الإعفاء: ${it.waiver_reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={it.status === "pending" ? "secondary" : "default"}>
                    {ITEM_STATUS_AR[it.status] ?? it.status}
                  </Badge>
                  {it.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setItem.mutate({
                          data: {
                            itemId: it.id,
                            status: "satisfied",
                            documentId: null,
                            reason: null,
                          },
                        })
                      }
                    >
                      تعليم كمستوفى
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <SoftEmpty icon={ListTodo} message="تُنشأ بنود القائمة تلقائيًا عند فتح طلب الاستلام حسب نوع المشروع." />
        )}
      </SectionCard>

      <SectionCard icon={PackageCheck} title="النواقص" count={punch.data?.length ?? 0}>
        <div className="flex flex-wrap gap-2">
          <Input
            value={punchTitle}
            onChange={(e) => setPunchTitle(e.target.value)}
            placeholder="عنوان النقص"
            className="max-w-sm"
          />
          <Button
            size="sm"
            disabled={punchTitle.trim().length < 3}
            onClick={() => {
              addPunch.mutate({
                data: {
                  projectId,
                  title: punchTitle.trim(),
                  description: null,
                  severity: "minor",
                  acceptanceId: null,
                  assignedUserId: null,
                },
              });
              setPunchTitle("");
            }}
          >
            تسجيل نقص
          </Button>
        </div>
        {punch.data && punch.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {punch.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    الخطورة: {SEVERITY_AR[p.severity] ?? p.severity} · رُصد:{" "}
                    {formatRiyadh(p.raised_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={p.status === "closed" ? "default" : "secondary"}>
                    {PUNCH_STATUS_AR[p.status] ?? p.status}
                  </Badge>
                  {p.status === "submitted" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPunch.mutate({ data: { itemId: p.id, status: "verified" } })
                      }
                    >
                      اعتماد المعالجة
                    </Button>
                  ) : null}
                  {p.status === "verified" ? (
                    <Button
                      size="sm"
                      onClick={() => setPunch.mutate({ data: { itemId: p.id, status: "closed" } })}
                    >
                      إغلاق النقص
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <SoftEmpty icon={PackageCheck} message="لا توجد نواقص مسجلة." />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          لا يمكن اعتماد أي نقص قبل رفع دليل «قبل» ودليل «بعد»، ولا يجوز أن يغلقه نفس المسؤول عن
          معالجته.
        </p>
      </SectionCard>

      <SectionCard icon={Archive} title="إغلاق المشروع وأرشفته">
        <Textarea
          value={closeNote}
          onChange={(e) => setCloseNote(e.target.value)}
          placeholder="ملاحظة الإغلاق (اختياري)"
          rows={2}
        />
        <Button onClick={() => close.mutate({ data: { projectId, note: closeNote || null } })}>
          إغلاق نهائي وأرشفة
        </Button>
      </SectionCard>

      <SectionCard icon={RotateCcw} title="إعادة الفتح" count={reopens.data?.length ?? 0}>
        <Textarea
          value={reopenReason}
          onChange={(e) => setReopenReason(e.target.value)}
          placeholder="سبب إعادة الفتح (10 أحرف على الأقل)"
          rows={2}
        />
        <Button
          variant="outline"
          disabled={reopenReason.trim().length < 10}
          onClick={() => {
            askReopen.mutate({ data: { projectId, reason: reopenReason.trim() } });
            setReopenReason("");
          }}
        >
          طلب إعادة فتح
        </Button>
        {reopens.data && reopens.data.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {reopens.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    طُلب: {formatRiyadh(r.requested_at)}
                    {r.decided_at ? ` · القرار: ${formatRiyadh(r.decided_at)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                    {r.status === "pending"
                      ? "بانتظار الموافقة"
                      : r.status === "approved"
                        ? "معتمد"
                        : "مرفوض"}
                  </Badge>
                  {r.status === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          decideReopen.mutate({
                            data: { requestId: r.id, approve: true, note: null },
                          })
                        }
                      >
                        اعتماد
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          decideReopen.mutate({
                            data: { requestId: r.id, approve: false, note: null },
                          })
                        }
                      >
                        رفض
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          لا يعتمد طلب إعادة الفتح من مقدّمه، ويُسجَّل كل قرار في سجل التدقيق.
        </p>
      </SectionCard>
    </main>
  );
}
