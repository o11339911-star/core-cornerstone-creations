import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, LegalUnavailable } from "@/components/legal/legal-document-page";
import { getLegalDocument, type LegalDocument } from "@/lib/legal.functions";

export const Route = createFileRoute("/legal/privacy")({
  loader: async () => ({ doc: await getLegalDocument({ data: { code: "privacy" } }) }),
  head: () => {
    const title = "سياسة الخصوصية — ركيز";
    const description =
      "كيف تجمع منصة ركيز بيانات المشاريع والعقارات والوسائط والمالية وتعالجها وتحتفظ بها، وحقوقك في الوصول والتصحيح والحذف والتصدير.";
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
  component: PrivacyPage,
  errorComponent: () => <LegalUnavailable title="سياسة الخصوصية" />,
  notFoundComponent: () => <LegalUnavailable title="سياسة الخصوصية" />,
});

function PrivacyPage() {
  const { doc } = Route.useLoaderData() as { doc: LegalDocument | null };
  if (!doc) return <LegalUnavailable title="سياسة الخصوصية" />;
  return <LegalDocumentPage doc={doc} />;
}
