import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, LegalUnavailable } from "@/components/legal/legal-document-page";
import { getLegalDocument, type LegalDocument } from "@/lib/legal.functions";

export const Route = createFileRoute("/legal/terms")({
  loader: async () => ({ doc: await getLegalDocument({ data: { code: "terms" } }) }),
  head: () => {
    const title = "شروط الاستخدام — ركيز";
    const description =
      "شروط استخدام منصة ركيز: طبيعة الخدمة التنظيمية، مسؤوليات الكيانات والأطراف، حدود المسؤولية، وقواعد إنهاء الوصول.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: TermsPage,
  errorComponent: () => <LegalUnavailable title="شروط الاستخدام" />,
  notFoundComponent: () => <LegalUnavailable title="شروط الاستخدام" />,
});

function TermsPage() {
  const { doc } = Route.useLoaderData() as { doc: LegalDocument | null };
  if (!doc) return <LegalUnavailable title="شروط الاستخدام" />;
  return <LegalDocumentPage doc={doc} />;
}
