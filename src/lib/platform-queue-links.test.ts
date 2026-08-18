import { describe, expect, it } from "vitest";

import { queueSourceLink } from "./platform-queue-links";

const ID = "11111111-1111-4111-8111-111111111111";
const ENTITY = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";

describe("queueSourceLink", () => {
  it("يفتح الطلب الأصلي بنفس المعرّف حين يكون المصدر جدول requests", () => {
    const link = queueSourceLink({ source_table: "requests", source_id: ID, entity_id: ENTITY });
    expect(link).toMatchObject({ kind: "request", params: { requestId: ID } });
  });

  it("يفتح الكيان الأصلي حين يكون المصدر جدول entities", () => {
    const link = queueSourceLink({ source_table: "entities", source_id: ENTITY });
    expect(link).toMatchObject({ kind: "entity", params: { entityId: ENTITY } });
  });

  it("يوجّه طلبات الخصوصية إلى شاشة DSR ولا يكشف الصف مباشرة", () => {
    expect(queueSourceLink({ source_table: "dsr_requests", source_id: ID })).toMatchObject({ kind: "dsr" });
  });

  it("يرجع إلى السياق المرتبط حين لا يوجد مسار للأصل", () => {
    expect(
      queueSourceLink({ source_table: "report_templates", source_id: ID, project_id: PROJECT }),
    ).toMatchObject({ kind: "project", params: { projectId: PROJECT } });
  });

  it("fail-closed: معرّف غير صالح وبلا سياق يعني لا رابط", () => {
    expect(queueSourceLink({ source_table: "requests", source_id: "not-a-uuid" })).toBeNull();
    expect(queueSourceLink({ source_table: "", source_id: "" })).toBeNull();
  });
});
