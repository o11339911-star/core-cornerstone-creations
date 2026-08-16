/**
 * Phase 28-R pilot run (TEST PATH ONLY — not application code).
 *   bun tests/phase28r/run.ts
 * Writes tests/phase28r/registry.json (every temporary id) and results.json.
 */
import { writeFileSync } from "node:fs";
import {
  ENTITY_PREFIX,
  PASSWORD,
  PREFIX,
  RUN_ID,
  authApi,
  record,
  results,
  rest,
  rpc,
  sha256Hex,
  signIn,
  storageProbe,
} from "./harness";

const SERVICE = { kind: "service" } as const;
const ANON = { kind: "anon" } as const;
const U = (t: string) => ({ kind: "user", token: t }) as const;

const registry: Record<string, any> = { run_id: RUN_ID, users: {}, entities: {}, rows: {} };
const save = () => {
  writeFileSync("tests/phase28r/registry.json", JSON.stringify(registry, null, 2));
  writeFileSync("tests/phase28r/results.json", JSON.stringify(results, null, 2));
};

const email = (k: string) => `${PREFIX}${k}-${RUN_ID}@example.com`;
const tokens: Record<string, { access: string; refresh: string }> = {};

async function main() {
  /* ================================================= 28-A identity/onboarding */
  const people = ["alpha-owner", "alpha-manager", "alpha-member", "alpha-viewer", "beta-owner", "outsider"];
  for (const p of people) {
    const res = await authApi("admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: email(p),
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: `TEST-28R ${p}`, test_run_id: RUN_ID },
      }),
    });
    if (!res.ok) throw new Error(`provision ${p} failed: ${JSON.stringify(res.body).slice(0, 200)}`);
    registry.users[p] = res.body.id;
  }
  record({
    batch: "28-A", id: "A1", title: "إنشاء 6 حسابات اختبار اصطناعية",
    expect: "إنشاء ناجح بمعرّفات مسجلة", status: Object.keys(registry.users).length === 6 ? "PASS" : "FAIL",
    evidence: `users=${Object.keys(registry.users).length} run_id=${RUN_ID}`,
  });

  for (const p of people) tokens[p] = await signIn(email(p));
  record({
    batch: "28-A", id: "A2", title: "تسجيل الدخول بكلمة المرور لكل الحسابات",
    expect: "جلسة صالحة لكل حساب", status: "PASS", evidence: `sessions=${Object.keys(tokens).length} (لا تُطبع التوكنات)`,
  });

  const prof = await rest(U(tokens["alpha-owner"]!.access), `profiles?id=eq.${registry.users["alpha-owner"]}&select=id`);
  record({
    batch: "28-A", id: "A3", title: "إنشاء صف الملف الشخصي تلقائيًا",
    expect: "صف profiles موجود للمستخدم", status: Array.isArray(prof.body) && prof.body.length === 1 ? "PASS" : "FAIL",
    evidence: `rows=${Array.isArray(prof.body) ? prof.body.length : prof.reason}`,
  });

  const selfOther = await rest(U(tokens["outsider"]!.access), `profiles?id=eq.${registry.users["alpha-owner"]}&select=id,phone`);
  record({
    batch: "28-A", id: "A4", title: "منع قراءة ملف مستخدم آخر بلا علاقة",
    expect: "صفر صفوف بحكم RLS", status: Array.isArray(selfOther.body) && selfOther.body.length === 0 ? "PASS" : "FAIL",
    evidence: `rows=${Array.isArray(selfOther.body) ? selfOther.body.length : selfOther.reason}`,
  });

  /* =============================================== 28-B entities & memberships */
  for (const [k, name, type] of [
    ["alpha", `${ENTITY_PREFIX}-ALPHA-${RUN_ID}`, "developer"],
    ["beta", `${ENTITY_PREFIX}-BETA-${RUN_ID}`, "design_office"],
  ] as const) {
    const r = await rest(SERVICE, "entities", {
      method: "POST", prefer: "return=representation",
      body: JSON.stringify({ name, type, status: "active" }),
    });
    registry.entities[k] = r.body?.[0]?.id;
  }
  const roles: Array<[string, string, string]> = [
    ["alpha-owner", "alpha", "owner"],
    ["alpha-manager", "alpha", "manager"],
    ["alpha-member", "alpha", "member"],
    ["alpha-viewer", "alpha", "viewer"],
    ["beta-owner", "beta", "owner"],
  ];
  for (const [p, e, role] of roles) {
    await rest(SERVICE, "entity_memberships", {
      method: "POST",
      body: JSON.stringify({ user_id: registry.users[p], entity_id: registry.entities[e], role, status: "active" }),
    });
  }
  record({
    batch: "28-B", id: "B1", title: "كيانان اختباريان وخمس عضويات بأدوار مختلفة",
    expect: "تهيئة ناجحة", status: registry.entities.alpha && registry.entities.beta ? "PASS" : "FAIL",
    evidence: `alpha=${registry.entities.alpha} beta=${registry.entities.beta} memberships=${roles.length}`,
  });

  const inv = await rpc(U(tokens["alpha-owner"]!.access), "create_entity_invitation", {
    _entity_id: registry.entities.alpha, _email: email("invitee"), _role: "member", _valid_days: 3,
  });
  record({
    batch: "28-B", id: "B2", title: "دعوة عضو عبر المسار الرسمي (المالك)",
    expect: "إنشاء دعوة ناجح", status: inv.ok ? "PASS" : "FAIL", evidence: inv.ok ? "invitation created" : inv.reason,
  });
  if (inv.ok) registry.rows.invitation = inv.body;

  const invDenied = await rpc(U(tokens["alpha-viewer"]!.access), "create_entity_invitation", {
    _entity_id: registry.entities.alpha, _email: email("nope"), _role: "member", _valid_days: 3,
  });
  record({
    batch: "28-B", id: "B3", title: "منع المشاهد من دعوة أعضاء",
    expect: "رفض خادمي صريح", status: !invDenied.ok ? "PASS" : "FAIL",
    evidence: invDenied.ok ? "ALLOWED (خط أحمر)" : invDenied.reason,
  });

  const crossMember = await rpc(U(tokens["beta-owner"]!.access), "create_entity_invitation", {
    _entity_id: registry.entities.alpha, _email: email("nope2"), _role: "member", _valid_days: 3,
  });
  record({
    batch: "28-B", id: "B4", title: "منع مالك كيان آخر من الدعوة داخل ألفا",
    expect: "رفض خادمي صريح", status: !crossMember.ok ? "PASS" : "FAIL",
    evidence: crossMember.ok ? "ALLOWED (خط أحمر)" : crossMember.reason,
  });

  /* ================================================= 28-C projects and stages */
  const tpl = await rest(SERVICE, "project_templates?select=id,code&is_active=eq.true&requires_license=eq.false&limit=1");
  const templateId = tpl.body?.[0]?.id;
  const mk = await rest(U(tokens["alpha-manager"]!.access), "projects", {
    method: "POST", prefer: "return=representation",
    body: JSON.stringify({
      owner_id: registry.users["alpha-manager"], created_by: registry.users["alpha-manager"],
      entity_id: registry.entities.alpha, project_template_id: templateId,
      name: `${ENTITY_PREFIX} مشروع تجريبي ${RUN_ID}`, status: "draft", city: "الرياض",
    }),
  });
  registry.rows.project = mk.body?.[0]?.id;
  record({
    batch: "28-C", id: "C1", title: "إنشاء مشروع داخل كيان ألفا بدور مدير",
    expect: "إنشاء ناجح", status: mk.ok && registry.rows.project ? "PASS" : "FAIL",
    evidence: mk.ok ? `project=${registry.rows.project}` : mk.reason,
  });

  const viewerProject = await rest(U(tokens["alpha-viewer"]!.access), "projects", {
    method: "POST", prefer: "return=representation",
    body: JSON.stringify({
      owner_id: registry.users["alpha-viewer"], created_by: registry.users["alpha-viewer"],
      entity_id: registry.entities.alpha, project_template_id: templateId,
      name: `${ENTITY_PREFIX} مشروع ممنوع ${RUN_ID}`, status: "draft",
    }),
  });
  record({
    batch: "28-C", id: "C2", title: "منع المشاهد من إنشاء مشروع",
    expect: "رفض خادمي (RLS)", status: !viewerProject.ok ? "PASS" : "FAIL",
    evidence: viewerProject.ok ? "ALLOWED (خط أحمر)" : viewerProject.reason,
  });
  if (viewerProject.ok) registry.rows.viewerProject = viewerProject.body?.[0]?.id;

  const stTpl = await rest(SERVICE, `stage_templates?select=id,name_ar,name_en,order_index&project_template_id=eq.${templateId}&order=order_index&limit=2`);
  const stageRows = (stTpl.body ?? []).map((s: any, i: number) => ({
    project_id: registry.rows.project, stage_template_id: s.id, source: "core", name_ar: s.name_ar,
    name_en: s.name_en, order_index: s.order_index ?? i, status: "pending", is_required: true,
  }));
  const stIns = await rest(U(tokens["alpha-manager"]!.access), "project_stages", {
    method: "POST", prefer: "return=representation", body: JSON.stringify(stageRows),
  });
  registry.rows.stages = (stIns.body ?? []).map?.((s: any) => s.id) ?? [];
  record({
    batch: "28-C", id: "C3", title: "توليد مراحل المشروع من القالب",
    expect: "إنشاء مراحل ناجح", status: stIns.ok && registry.rows.stages.length ? "PASS" : "FAIL",
    evidence: stIns.ok ? `stages=${registry.rows.stages.length}` : stIns.reason,
  });

  const stageId = registry.rows.stages?.[0];
  if (stageId) {
    const sub = await rpc(U(tokens["alpha-member"]!.access), "submit_stage", { _stage_id: stageId, _note: "اختبار 28R" });
    record({
      batch: "28-C", id: "C4", title: "رفع مرحلة للاعتماد بدور عضو",
      expect: "قبول أو رفض خادمي مفسَّر", status: sub.ok ? "PASS" : "INFO",
      evidence: sub.ok ? "submitted" : sub.reason,
    });
    const selfApprove = await rpc(U(tokens["alpha-member"]!.access), "approve_stage", { _stage_id: stageId, _note: "self" });
    record({
      batch: "28-C", id: "C5", title: "فصل الواجبات: مقدّم المرحلة لا يعتمدها",
      expect: "رفض خادمي", status: !selfApprove.ok ? "PASS" : "FAIL",
      evidence: selfApprove.ok ? "ALLOWED (خط أحمر)" : selfApprove.reason,
    });
    const appr = await rpc(U(tokens["alpha-manager"]!.access), "approve_stage", { _stage_id: stageId, _note: "اعتماد 28R" });
    record({
      batch: "28-C", id: "C6", title: "اعتماد المرحلة بدور مدير",
      expect: "اعتماد ناجح", status: appr.ok ? "PASS" : "INFO", evidence: appr.ok ? "approved" : appr.reason,
    });
  }

  const completion = await rpc(U(tokens["alpha-manager"]!.access), "project_completion", { _project_id: registry.rows.project });
  record({
    batch: "28-C", id: "C7", title: "احتساب نسبة إنجاز المشروع",
    expect: "قيمة رقمية", status: completion.ok ? "PASS" : "FAIL",
    evidence: completion.ok ? JSON.stringify(completion.body).slice(0, 120) : completion.reason,
  });

  /* ================================================ 28-E requests & messaging */
  const rtype = await rest(SERVICE, "request_types?select=code&limit=1");
  const req = await rpc(U(tokens["alpha-manager"]!.access), "create_request", {
    _project_id: registry.rows.project, _request_type_code: rtype.body?.[0]?.code,
    _subject: `${ENTITY_PREFIX} طلب تجريبي`, _body: "نص اختباري", _submit: true,
  });
  registry.rows.request = req.ok ? (typeof req.body === "string" ? req.body : req.body?.id ?? req.body) : null;
  record({
    batch: "28-E", id: "E1", title: "إنشاء طلب رسمي داخل المشروع",
    expect: "إنشاء ناجح", status: req.ok ? "PASS" : "FAIL", evidence: req.ok ? `request=${registry.rows.request}` : req.reason,
  });
  if (registry.rows.request) {
    const msg = await rpc(U(tokens["alpha-manager"]!.access), "post_request_message", {
      _request_id: registry.rows.request, _body: "رسالة اختبار 28R",
    });
    record({
      batch: "28-E", id: "E2", title: "إرسال رسالة داخل مراسلة الطلب",
      expect: "قبول", status: msg.ok ? "PASS" : "INFO", evidence: msg.ok ? "message posted" : msg.reason,
    });
    const foreignMsg = await rpc(U(tokens["beta-owner"]!.access), "post_request_message", {
      _request_id: registry.rows.request, _body: "اختراق",
    });
    record({
      batch: "28-E", id: "E3", title: "منع كيان آخر من الكتابة في مراسلة الطلب",
      expect: "رفض خادمي", status: !foreignMsg.ok ? "PASS" : "FAIL",
      evidence: foreignMsg.ok ? "ALLOWED (خط أحمر)" : foreignMsg.reason,
    });
  }

  /* ==================================================== 28-G drawings module */
  const draw = await rpc(U(tokens["alpha-manager"]!.access), "create_drawing", {
    _project_id: registry.rows.project, _owner_entity_id: registry.entities.alpha,
    _drawing_no: `28R-A-001`, _discipline: "architectural", _title: "مخطط اختبار 28R", _sheet_no: "A-01",
  });
  registry.rows.drawing = draw.ok ? draw.body : null;
  record({
    batch: "28-G", id: "G1", title: "إنشاء سجل مخطط",
    expect: "إنشاء ناجح", status: draw.ok ? "PASS" : "FAIL", evidence: draw.ok ? `drawing=${draw.body}` : draw.reason,
  });

  if (registry.rows.drawing) {
    const checksum = await sha256Hex(`28r-${RUN_ID}`);
    const ver = await rpc(U(tokens["alpha-manager"]!.access), "add_drawing_version", {
      _drawing_id: registry.rows.drawing, _file_ext: "dwg", _mime_type: "application/acad",
      _size_bytes: 2048, _checksum_sha256: checksum, _revision_label: "R0",
    });
    const vrow = Array.isArray(ver.body) ? ver.body[0] : ver.body;
    registry.rows.versionId = vrow?.version_id;
    registry.rows.storagePath = vrow?.storage_path;
    record({
      batch: "28-G", id: "G2", title: "تسجيل نسخة DWG جديدة",
      expect: "نسخة + مسار تخزين خاص", status: ver.ok && registry.rows.versionId ? "PASS" : "FAIL",
      evidence: ver.ok ? `version=${vrow?.version_no} path=${String(registry.rows.storagePath).slice(0, 60)}…` : ver.reason,
    });

    const viewerVer = await rpc(U(tokens["alpha-viewer"]!.access), "add_drawing_version", {
      _drawing_id: registry.rows.drawing, _file_ext: "dwg", _mime_type: "application/acad",
      _size_bytes: 1024, _checksum_sha256: await sha256Hex("viewer"), _revision_label: "R9",
    });
    record({
      batch: "28-G", id: "G3", title: "منع المشاهد من رفع نسخة مخطط",
      expect: "رفض خادمي", status: !viewerVer.ok ? "PASS" : "FAIL",
      evidence: viewerVer.ok ? "ALLOWED (خط أحمر)" : viewerVer.reason,
    });

    const foreignVer = await rpc(U(tokens["beta-owner"]!.access), "add_drawing_version", {
      _drawing_id: registry.rows.drawing, _file_ext: "dwg", _mime_type: "application/acad",
      _size_bytes: 1024, _checksum_sha256: await sha256Hex("beta"), _revision_label: "R8",
    });
    record({
      batch: "28-G", id: "G4", title: "منع كيان آخر من رفع نسخة على مخطط ألفا",
      expect: "رفض خادمي", status: !foreignVer.ok ? "PASS" : "FAIL",
      evidence: foreignVer.ok ? "ALLOWED (خط أحمر)" : foreignVer.reason,
    });

    // upload a tiny synthetic object so the direct-link probes hit a real path
    if (registry.rows.storagePath) {
      const up = await fetch(`${process.env["SUPABASE_URL"]}/storage/v1/object/cad-originals/${registry.rows.storagePath}`, {
        method: "POST",
        headers: {
          apikey: process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
          Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"]}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array([0x30, 0x30, 0x28, 0x52]),
      });
      registry.rows.uploaded = up.ok;
    }
    const anonObj = await storageProbe(null, "cad-originals", registry.rows.storagePath);
    record({
      batch: "28-G", id: "G5", title: "رابط مباشر لملف CAD بلا مصادقة",
      expect: "رفض", status: anonObj.status >= 400 ? "PASS" : "FAIL",
      evidence: `HTTP ${anonObj.status} :: ${anonObj.body.slice(0, 140)}`,
    });
    const betaObj = await storageProbe(U(tokens["beta-owner"]!.access), "cad-originals", registry.rows.storagePath);
    record({
      batch: "28-G", id: "G6", title: "رابط مباشر لملف CAD من كيان آخر",
      expect: "رفض", status: betaObj.status >= 400 ? "PASS" : "FAIL",
      evidence: `HTTP ${betaObj.status} :: ${betaObj.body.slice(0, 140)}`,
    });

    const selfStatus = await rpc(U(tokens["alpha-manager"]!.access), "set_drawing_status", {
      _drawing_id: registry.rows.drawing, _to_status: "under_review", _note: "مراجعة",
    });
    record({
      batch: "28-G", id: "G7", title: "تحويل حالة المخطط إلى قيد المراجعة",
      expect: "قبول", status: selfStatus.ok ? "PASS" : "INFO", evidence: selfStatus.ok ? "under_review" : selfStatus.reason,
    });
    const sod = await rpc(U(tokens["alpha-manager"]!.access), "set_drawing_status", {
      _drawing_id: registry.rows.drawing, _to_status: "approved_internal", _note: "اعتماد ذاتي",
    });
    record({
      batch: "28-G", id: "G8", title: "فصل الواجبات: رافع النسخة لا يعتمدها داخليًا",
      expect: "رفض خادمي", status: !sod.ok ? "PASS" : "FAIL",
      evidence: sod.ok ? "ALLOWED (خط أحمر)" : sod.reason,
    });
    const conv = await rpc(U(tokens["alpha-manager"]!.access), "enqueue_drawing_conversion", {
      _document_version_id: registry.rows.versionId,
    });
    const convRow = Array.isArray(conv.body) ? conv.body[0] : conv.body;
    record({
      batch: "28-G", id: "G9", title: "بقاء تكامل APS معطّلًا (fail-closed)",
      expect: "الحالة disabled", status: convRow?.status === "disabled" ? "PASS" : "FAIL",
      evidence: conv.ok ? JSON.stringify(convRow) : conv.reason,
    });
  }

  /* ================================================ 28-H cross-entity isolation */
  const probes: Array<[string, string, () => Promise<{ ok: boolean; status: number; body: any; reason: string }>]> = [
    ["H1", "قراءة مشروع ألفا صفًا مفردًا من بيتا", () =>
      rest({ kind: "user", token: tokens["beta-owner"]!.access }, `projects?id=eq.${registry.rows.project}&select=id,name`, {
        headers: { Accept: "application/vnd.pgrst.object+json" } as any,
      })],
    ["H2", "قراءة سجل مخطط ألفا من بيتا", () =>
      rest({ kind: "user", token: tokens["beta-owner"]!.access }, `drawing_records?id=eq.${registry.rows.drawing}&select=id,title`, {
        headers: { Accept: "application/vnd.pgrst.object+json" } as any,
      })],
    ["H3", "تعديل اسم مشروع ألفا من بيتا", () =>
      rest({ kind: "user", token: tokens["beta-owner"]!.access }, `projects?id=eq.${registry.rows.project}`, {
        method: "PATCH", prefer: "return=representation", body: JSON.stringify({ name: "اختراق" }),
      })],
    ["H4", "حذف مشروع ألفا من مستخدم خارجي", () =>
      rest({ kind: "user", token: tokens["outsider"]!.access }, `projects?id=eq.${registry.rows.project}`, {
        method: "DELETE", prefer: "return=representation",
      })],
    ["H5", "قراءة مشروع ألفا بمفتاح anon فقط", () =>
      rest(ANON, `projects?id=eq.${registry.rows.project}&select=id`, {
        headers: { Accept: "application/vnd.pgrst.object+json" } as any,
      })],
    ["H6", "استدعاء RPC داخلية من كيان آخر (project_completion)", () =>
      rpc({ kind: "user", token: tokens["beta-owner"]!.access }, "project_completion", { _project_id: registry.rows.project })],
  ];
  for (const [id, title, fn] of probes) {
    const r = await fn();
    const emptyWrite =
      r.ok && ((Array.isArray(r.body) && r.body.length === 0) || r.body === null);
    const rejected = !r.ok;
    record({
      batch: "28-H", id, title,
      expect: "رفض خادمي موثّق (لا بيانات)",
      status: rejected ? "PASS" : emptyWrite ? "PASS" : "FAIL",
      evidence: rejected ? `HTTP ${r.status} :: ${r.reason}` : emptyWrite
        ? `HTTP ${r.status} :: صفر صفوف متأثرة (RLS تُخفي الصف قبل الكتابة)`
        : `LEAK: ${JSON.stringify(r.body).slice(0, 200)}`,
    });
  }

  save();
  console.log("\nrun complete");
}

main().catch((e) => {
  console.error("HARNESS ABORT:", e.message);
  save();
  process.exit(1);
});
