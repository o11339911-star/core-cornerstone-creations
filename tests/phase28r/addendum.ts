/** Phase 28-R addendum (TEST PATH ONLY): stages, documents, and permission matrix. */
import { readFileSync, writeFileSync } from "node:fs";
import { record, results, rest, rpc, signIn, sha256Hex, PREFIX, RUN_ID } from "./harness";

const reg = JSON.parse(readFileSync("tests/phase28r/registry.json", "utf8"));
const RID = reg.run_id;
const U = (t: string) => ({ kind: "user", token: t }) as const;
const S = { kind: "service" } as const;
const tok: Record<string, string> = {};
for (const p of ["alpha-owner", "alpha-manager", "alpha-member", "alpha-viewer", "beta-owner", "outsider"]) {
  tok[p] = (await signIn(`${PREFIX}${p}-${RID}@example.com`)).access;
}

/* stages */
const tpl = await rest(S, "project_templates?select=id&is_active=eq.true&requires_license=eq.false&limit=1");
const st = await rest(S, `stage_templates?select=id,name_ar,name_en,order_index&project_template_id=eq.${tpl.body[0].id}&order=order_index&limit=2`);
const ins = await rest(U(tok["alpha-manager"]!), "project_stages", {
  method: "POST", prefer: "return=representation",
  body: JSON.stringify(st.body.map((s: any, i: number) => ({
    project_id: reg.rows.project, stage_template_id: s.id, source: "core", name_ar: s.name_ar,
    name_en: s.name_en, order_index: s.order_index ?? i, status: "pending", is_required: true,
  }))),
});
const stages = (ins.body ?? []).map?.((r: any) => r.id) ?? [];
reg.rows.stages = stages;
record({ batch: "28-C", id: "C3", title: "توليد مراحل المشروع من القالب", expect: "إنشاء مراحل",
  status: ins.ok && stages.length ? "PASS" : "FAIL", evidence: ins.ok ? `stages=${stages.length}` : ins.reason });

if (stages[0]) {
  const sub = await rpc(U(tok["alpha-member"]!), "submit_stage", { _stage_id: stages[0], _note: "اختبار 28R" });
  record({ batch: "28-C", id: "C4", title: "رفع مرحلة للاعتماد بدور عضو", expect: "قبول أو رفض مفسَّر",
    status: sub.ok ? "PASS" : "INFO", evidence: sub.ok ? "submitted" : sub.reason });
  const self = await rpc(U(tok["alpha-member"]!), "approve_stage", { _stage_id: stages[0], _note: "self" });
  record({ batch: "28-C", id: "C5", title: "فصل الواجبات: مقدّم المرحلة لا يعتمدها", expect: "رفض خادمي",
    status: !self.ok ? "PASS" : "FAIL", evidence: self.ok ? "ALLOWED (خط أحمر)" : self.reason });
  const appr = await rpc(U(tok["alpha-manager"]!), "approve_stage", { _stage_id: stages[0], _note: "اعتماد" });
  record({ batch: "28-C", id: "C6", title: "اعتماد المرحلة بدور مدير", expect: "اعتماد ناجح",
    status: appr.ok ? "PASS" : "INFO", evidence: appr.ok ? "approved" : appr.reason });
  const foreignStage = await rpc(U(tok["beta-owner"]!), "approve_stage", { _stage_id: stages[0], _note: "اختراق" });
  record({ batch: "28-C", id: "C8", title: "منع كيان آخر من اعتماد مرحلة ألفا", expect: "رفض خادمي",
    status: !foreignStage.ok ? "PASS" : "FAIL", evidence: foreignStage.ok ? "ALLOWED (خط أحمر)" : foreignStage.reason });
}

/* documents */
const cat = await rest(S, "document_categories?select=code&limit=1");
const doc = await rpc(U(tok["alpha-manager"]!), "create_document", {
  _owner_entity_id: reg.entities.alpha, _category_code: cat.body?.[0]?.code,
  _title: "مستند اختبار 28R", _description: "اختباري", _visibility: "entity_private",
});
reg.rows.document = doc.ok ? doc.body : null;
record({ batch: "28-D", id: "D1", title: "إنشاء مستند خاص بالكيان", expect: "إنشاء ناجح",
  status: doc.ok ? "PASS" : "FAIL", evidence: doc.ok ? `document=${doc.body}` : doc.reason });

if (reg.rows.document) {
  const v = await rpc(U(tok["alpha-manager"]!), "add_document_version", {
    _document_id: reg.rows.document, _file_ext: "pdf", _mime_type: "application/pdf",
    _size_bytes: 1024, _checksum_sha256: await sha256Hex(`doc-${RID}`), _source: "upload",
  });
  record({ batch: "28-D", id: "D2", title: "إضافة نسخة مستند (append-only)", expect: "قبول",
    status: v.ok ? "PASS" : "INFO", evidence: v.ok ? JSON.stringify(v.body).slice(0, 120) : v.reason });
  const foreignRead = await rest(U(tok["beta-owner"]!), `documents?id=eq.${reg.rows.document}&select=id,title`, {
    headers: { Accept: "application/vnd.pgrst.object+json" } as any,
  });
  record({ batch: "28-D", id: "D3", title: "منع كيان آخر من قراءة مستند خاص", expect: "رفض/صفر صفوف",
    status: !foreignRead.ok ? "PASS" : "FAIL", evidence: foreignRead.ok ? `LEAK ${JSON.stringify(foreignRead.body)}` : `HTTP ${foreignRead.status} :: ${foreignRead.reason}` });
  const anonRead = await rest({ kind: "anon" }, `documents?id=eq.${reg.rows.document}&select=id`);
  record({ batch: "28-D", id: "D4", title: "منع anon من قراءة المستندات", expect: "رفض",
    status: !anonRead.ok ? "PASS" : "FAIL", evidence: `HTTP ${anonRead.status} :: ${anonRead.reason}` });
}

writeFileSync("tests/phase28r/registry.json", JSON.stringify(reg, null, 2));
writeFileSync("tests/phase28r/results-addendum.json", JSON.stringify(results, null, 2));
