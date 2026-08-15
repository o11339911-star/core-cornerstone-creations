import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage, LegalUnavailable } from "@/components/legal/legal-document-page";
import { getLegalDocument, type LegalDocument } from "@/lib/legal.functions";

export const Route = createFileRoute("/legal/complaints")({
  loader: async () => ({ doc: await getLegalDocument({ data: { code: "complaints" } }) }),
  head: () => {
    const title = "سياسة الشكاوى والتظلمات — ركيز";
    const description =
      "كيف تقدّم شكوى أو تظلمًا على منصة ركيز، ومسار المعالجة داخل طابور المنصة، ومدد الرد، ومسار التصعيد.";
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
  component: ComplaintsPage,
  errorComponent: () => <LegalUnavailable title="سياسة الشكاوى والتظلمات" />,
  notFoundComponent: () => <LegalUnavailable title="سياسة الشكاوى والتظلمات" />,
});

function ComplaintsPage() {
  const { doc } = Route.useLoaderData() as { doc: LegalDocument | null };
  if (!doc) return <LegalUnavailable title="سياسة الشكاوى والتظلمات" />;
  return <LegalDocumentPage doc={doc} />;
}
