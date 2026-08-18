import { useEffect, useState } from "react";

/** رمز تحقق (QR) يُولَّد في المتصفح فقط — لا يحوي إلا رابط التحقق العام. */
export function QrCode({
  value,
  size = 148,
  alt = "رمز التحقق",
}: {
  value: string;
  size?: number;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    void (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const url = await QR.toDataURL(value, { width: size, margin: 1 });
        if (alive) setSrc(url);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground"
        style={{ width: size, height: size }}
      >
        تعذّر توليد رمز التحقق
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className="animate-pulse rounded-lg bg-muted"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return <img src={src} alt={alt} width={size} height={size} className="rounded-lg bg-white p-1" />;
}
