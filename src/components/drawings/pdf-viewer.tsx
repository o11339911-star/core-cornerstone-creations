import { useT } from "@/i18n";

/** معاينة PDF داخل المتصفح من رابط موقّع مؤقت — لا تُستخدم لأي صيغة CAD. */
export default function PdfViewer({ url, title }: { url: string; title?: string | undefined }) {
  const t = useT();
  return (
    <iframe
      src={url}
      title={title ?? t("drawings.preview")}
      className="h-[360px] w-full rounded-xl border border-border bg-white sm:h-[440px]"
    />
  );
}
