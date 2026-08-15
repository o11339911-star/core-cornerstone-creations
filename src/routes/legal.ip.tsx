import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, LegalUnavailable } from "@/components/legal/legal-document-page";
import { getLegalDocument, type LegalDocument } from "@/lib/legal.functions";

export const Route = createFileRoute("/legal/ip")({
  loader: async () => ({ doc: await getLegalDocument({ data: { code: "ip" } }) }),
  head: () => {
    const title = "سياسة الملكية الفكرية — ركيز";
    const description =
      "ملكية المخططات والتقارير ووسائط 360 والمحتوى التسويقي على منصة ركيز، ورخص الاستخدام وإجراء الإبلاغ عن التعدي.";
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
  component: IpPage,
  errorComponent: () => <LegalUnavailable title="سياسة الملكية الفكرية" />,
  notFoundComponent: () => <LegalUnavailable title="سياسة الملكية الفكرية" />,
});

function IpPage() {
  const { doc } = Route.useLoaderData() as { doc: LegalDocument | null };
  if (!doc) return <LegalUnavailable title="سياسة الملكية الفكرية" />;
  return <LegalDocumentPage doc={doc} />;
}
