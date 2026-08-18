import { useEffect, useMemo, useState } from "react";

type Matrix = { size: number; data: Uint8Array };

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
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setMatrix(null);
    setFailed(false);
    void (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const out = QR.create(value, { errorCorrectionLevel: "M" });
        if (alive) setMatrix({ size: out.modules.size, data: out.modules.data });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value]);

  const path = useMemo(() => {
    if (!matrix) return "";
    let d = "";
    for (let y = 0; y < matrix.size; y += 1) {
      for (let x = 0; x < matrix.size; x += 1) {
        if (matrix.data[y * matrix.size + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return d;
  }, [matrix]);

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

  if (!matrix) {
    return (
      <div
        className="animate-pulse rounded-lg bg-muted"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    <svg
      role="img"
      aria-label={alt}
      width={size}
      height={size}
      viewBox={`0 0 ${matrix.size} ${matrix.size}`}
      className="rounded-lg bg-white p-1"
      shapeRendering="crispEdges"
    >
      <rect width={matrix.size} height={matrix.size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
