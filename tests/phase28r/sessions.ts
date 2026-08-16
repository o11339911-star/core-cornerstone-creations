/** Phase 28-R session revocation (TEST PATH ONLY). No token value is ever printed. */
import { readFileSync, writeFileSync } from "node:fs";
import { PREFIX, record, results, rest, signIn } from "./harness";
const reg = JSON.parse(readFileSync("tests/phase28r/registry.json", "utf8"));
const URL_ = process.env["SUPABASE_URL"]!, S = process.env["SUPABASE_SERVICE_ROLE_KEY"]!, A = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const U = (t: string) => ({ kind: "user", token: t }) as const;

const who = "alpha-member";
const sess = await signIn(`${PREFIX}${who}-${reg.run_id}@example.com`);
const before = await rest(U(sess.access), "profiles?select=id&limit=1");
record({ batch: "28-I", id: "I1", title: "قراءة صالحة قبل إبطال الجلسة", expect: "نجاح", status: before.ok ? "PASS" : "FAIL", evidence: `HTTP ${before.status}` });

const out = await fetch(`${URL_}/auth/v1/logout?scope=global`, {
  method: "POST", headers: { apikey: A, Authorization: `Bearer ${sess.access}` },
});
record({ batch: "28-I", id: "I2", title: "إبطال جميع الجلسات بالمسار الرسمي (logout global)", expect: "قبول", status: out.status < 400 ? "PASS" : "FAIL", evidence: `HTTP ${out.status}` });

const refresh = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
  method: "POST", headers: { apikey: A, "Content-Type": "application/json" },
  body: JSON.stringify({ refresh_token: sess.refresh }),
});
const rBody = await refresh.json().catch(() => ({}));
record({ batch: "28-I", id: "I3", title: "رفض تجديد الجلسة بالتوكن القديم", expect: "رفض", status: !refresh.ok ? "PASS" : "FAIL", evidence: `HTTP ${refresh.status} :: ${rBody.error_code ?? rBody.msg ?? ""}` });

const afterDeleteUserRead = async () => rest(U(sess.access), "profiles?select=id&limit=1");
const midRead = await afterDeleteUserRead();
record({ batch: "28-I", id: "I4", title: "سلوك التوكن القديم بعد الإبطال وقبل الحذف", expect: "توثيق فعلي", status: "INFO", evidence: `HTTP ${midRead.status} :: ${midRead.ok ? `rows=${(midRead.body as any[]).length}` : midRead.reason}` });

const del = await fetch(`${URL_}/auth/v1/admin/users/${reg.users[who]}`, { method: "DELETE", headers: { apikey: S, Authorization: `Bearer ${S}` } });
record({ batch: "28-I", id: "I5", title: "حذف المستخدم بالمسار الإداري", expect: "قبول", status: del.status < 400 ? "PASS" : "INFO", evidence: `HTTP ${del.status}` });

const readAfter = await rest(U(sess.access), "profiles?select=id&limit=1");
const writeAfter = await rest(U(sess.access), "projects", {
  method: "POST", prefer: "return=representation",
  body: JSON.stringify({ owner_id: reg.users[who], created_by: reg.users[who], entity_id: reg.entities.alpha, name: "TEST-28R بعد الحذف", status: "draft" }),
});
record({ batch: "28-I", id: "I6", title: "قراءة بالتوكن القديم بعد حذف المستخدم", expect: "لا بيانات", status: !readAfter.ok || (readAfter.body as any[]).length === 0 ? "PASS" : "FAIL", evidence: `HTTP ${readAfter.status} :: ${readAfter.ok ? `rows=${(readAfter.body as any[]).length}` : readAfter.reason}` });
record({ batch: "28-I", id: "I7", title: "كتابة بالتوكن القديم بعد حذف المستخدم", expect: "رفض خادمي", status: !writeAfter.ok ? "PASS" : "FAIL", evidence: writeAfter.ok ? "ALLOWED (خط أحمر)" : `HTTP ${writeAfter.status} :: ${writeAfter.reason}` });

writeFileSync("tests/phase28r/results-sessions.json", JSON.stringify(results, null, 2));
