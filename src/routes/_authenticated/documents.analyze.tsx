import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ErrorState } from "@/components/rakeez";
import { DocumentAnalyzer } from "@/components/documents/DocumentAnalyzer";

const searchSchema = z.object({
  propertyId: z.string().uuid().optional(),
  target: z.enum(["deed", "building_license"]).optional(),
});

export const Route = createFileRoute("/_authenticated/documents/analyze")({
  component: DocumentAnalyzePage,
  errorComponent: ErrorState,
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "رفع وتحليل مستند | ركيز" },
      {
        name: "description",
        content: "ارفع صك ملكية أو رخصة بناء ودع ركيز يقترح الحقول تلقائيًا من نص الملف قبل اعتمادها على العقار.",
      },
      { property: "og:title", content: "رفع وتحليل مستند | ركيز" },
      {
        property: "og:description",
        content: "تحليل محلي لملفات الصكوك والرخص مع مراجعة الحقول قبل الاعتماد النهائي على ملف العقار.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DocumentAnalyzePage() {
  const { propertyId, target } = Route.useSearch();
  return <DocumentAnalyzer initialPropertyId={propertyId} initialTarget={target} />;
}
