import { Suspense, lazy } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { normalizeFormat } from "@/lib/drawings/providers";
import { DXF_MAX_BYTES, IFC_MAX_BYTES, formatMb } from "@/lib/drawings/viewer-limits";

/** كل عارض يُحمَّل كسولًا: لا شيء منه في الحزمة الابتدائية. */
const PdfViewer = lazy(() => import("./pdf-viewer"));
const DxfViewer = lazy(() => import("./dxf-viewer"));
const IfcViewer = lazy(() => import("./ifc-viewer"));

function ViewerFallback() {
  return <Skeleton className="h-[360px] w-full rounded-xl sm:h-[440px]" />;
}

function Notice({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex h-[200px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-white px-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body ? <p className="max-w-sm text-xs text-muted-foreground">{body}</p> : null}
    </div>
  );
}

/**
 * يوجّه كل صيغة إلى عارضها الصحيح اعتمادًا على صيغة النسخة المختارة نفسها،
 * لا على صيغة أحدث نسخة.
 */
export function DrawingViewer({
  format,
  url,
  sizeBytes,
  title,
  apsEnabled,
}: {
  format: string | null | undefined;
  url: string | null;
  sizeBytes?: number | null;
  title?: string;
  apsEnabled: boolean;
}) {
  const t = useT();
  const kind = normalizeFormat(format);

  if (kind === "dwg") {
    return (
      <Notice
        title={t("drawings.dwgNoPreview")}
        body={t(apsEnabled ? "drawings.providerApsPending" : "drawings.providerApsDisabled")}
      />
    );
  }

  if (!kind) {
    return <Notice title={t("drawings.providerUnsupportedFormat")} />;
  }

  if (!url) {
    return <Notice title={t("drawings.viewerNeedsOpen")} body={t("drawings.viewerNeedsOpenBody")} />;
  }

  return (
    <Suspense fallback={<ViewerFallback />}>
      {kind === "pdf" ? <PdfViewer url={url} title={title} /> : null}
      {kind === "dxf" ? <DxfViewer url={url} sizeBytes={sizeBytes} /> : null}
      {kind === "ifc" ? <IfcViewer url={url} sizeBytes={sizeBytes} /> : null}
    </Suspense>
  );
}

export function viewerLimitLabel(format: string | null | undefined): string | null {
  const kind = normalizeFormat(format);
  if (kind === "dxf") return `${formatMb(DXF_MAX_BYTES)} MB`;
  if (kind === "ifc") return `${formatMb(IFC_MAX_BYTES)} MB`;
  return null;
}
