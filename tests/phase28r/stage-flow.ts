/** Phase 28-R stage flow follow-up (TEST PATH ONLY). */
import { readFileSync, writeFileSync } from "node:fs";
import { PREFIX, record, results, rest, rpc, signIn } from "./harness";
const reg = JSON.parse(readFileSync("tests/phase28r/registry.json", "utf8"));
const U = (t: string) => ({ kind: "user", token: t }) as const;
const t = async (p: string) => (await signIn(`${PREFIX}${p}-${reg.run_id}@example.com`)).access;
const mgr = await t("alpha-manager"), own = await t("alpha-owner");
const s = reg.rows.stages[0];
const prog = await rest(U(mgr), `project_stages?id=eq.${s}`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ status: "in_progress" }) });
record({ batch: "28-C", id: "C3b", title: "بدء تنفيذ المرحلة بدور مدير", expect: "قبول", status: prog.ok && prog.body?.length ? "PASS" : "FAIL", evidence: prog.ok ? `updated=${prog.body?.length}` : prog.reason });
const sub = await rpc(U(mgr), "submit_stage", { _stage_id: s, _note: "رفع للاعتماد" });
record({ batch: "28-C", id: "C4b", title: "رفع مرحلة للاعتماد بدور مدير", expect: "قبول", status: sub.ok ? "PASS" : "FAIL", evidence: sub.ok ? "submitted" : sub.reason });
const self = await rpc(U(mgr), "approve_stage", { _stage_id: s, _note: "self" });
record({ batch: "28-C", id: "C5b", title: "فصل الواجبات: المدير الذي رفع لا يعتمد", expect: "رفض خادمي", status: !self.ok ? "PASS" : "FAIL", evidence: self.ok ? "ALLOWED (خط أحمر)" : self.reason });
const appr = await rpc(U(own), "approve_stage", { _stage_id: s, _note: "اعتماد المالك" });
record({ batch: "28-C", id: "C6b", title: "اعتماد المرحلة بدور مالك مختلف", expect: "قبول", status: appr.ok ? "PASS" : "FAIL", evidence: appr.ok ? "approved" : appr.reason });
writeFileSync("tests/phase28r/results-stageflow.json", JSON.stringify(results, null, 2));
