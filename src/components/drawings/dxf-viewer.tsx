import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/i18n";
import {
  DXF_MAX_BYTES,
  DXF_TIMEOUT_MS,
  checkSize,
  formatMb,
} from "@/lib/drawings/viewer-limits";
import { buildDxfScene, type DxfScene } from "@/lib/drawings/dxf-geometry";
import { ViewerFrame, ViewerMessage } from "./viewer-frame";

type Status = "loading" | "ready" | "error" | "too_large" | "empty";

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const LINE_COLOR = "#1f2a37";

export default function DxfViewer({
  url,
  sizeBytes,
  compact = false,
}: {
  url: string;
  sizeBytes?: number | null;
  compact?: boolean;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<View>({ scale: 1, offsetX: 0, offsetY: 0 });
  const sceneRef = useRef<DxfScene | null>(null);
  const hiddenRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [scene, setScene] = useState<DxfScene | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>("loading");
  const [errorKey, setErrorKey] = useState<string>("drawings.viewerParseError");
  const [reloadToken, setReloadToken] = useState(0);

  const sizeCheck = useMemo(() => checkSize(sizeBytes, DXF_MAX_BYTES), [sizeBytes]);

  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const current = sceneRef.current;
    if (!canvas || !current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const { scale, offsetX, offsetY } = viewRef.current;
    ctx.lineWidth = 1;
    ctx.strokeStyle = LINE_COLOR;
    ctx.beginPath();
    for (const path of current.paths) {
      if (hiddenRef.current.has(path.layer)) continue;
      const pts = path.points;
      const first = pts[0];
      if (!first) continue;
      ctx.moveTo(first[0] * scale + offsetX, height - (first[1] * scale + offsetY));
      for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i]!;
        ctx.lineTo(p[0] * scale + offsetX, height - (p[1] * scale + offsetY));
      }
    }
    ctx.stroke();
  }, []);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const current = sceneRef.current;
    if (!canvas || !current?.bounds) return;
    const { minX, minY, maxX, maxY } = current.bounds;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const scale = Math.min(width / spanX, height / spanY) * 0.9;
    viewRef.current = {
      scale,
      offsetX: (width - spanX * scale) / 2 - minX * scale,
      offsetY: (height - spanY * scale) / 2 - minY * scale,
    };
    draw();
  }, [draw]);

  useEffect(() => {
    if (!sizeCheck.ok) {
      setStatus("too_large");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), DXF_TIMEOUT_MS);
    setStatus("loading");

    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("fetch_failed");
        const text = await response.text();
        if (text.length > DXF_MAX_BYTES) throw new Error("too_large");
        const mod = await import("dxf-parser");
        const Parser = (mod.default ?? mod) as unknown as new () => {
          parseSync: (input: string) => unknown;
        };
        const parsed = new Parser().parseSync(text);
        const built = buildDxfScene(parsed);
        if (cancelled) return;
        sceneRef.current = built;
        setScene(built);
        setHidden(new Set());
        if (built.paths.length === 0) {
          setStatus("empty");
          return;
        }
        setStatus("ready");
        window.requestAnimationFrame(fit);
      } catch (error) {
        if (cancelled) return;
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setErrorKey(aborted ? "drawings.viewerTimeout" : "drawings.viewerParseError");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      sceneRef.current = null;
    };
  }, [url, reloadToken, sizeCheck.ok, fit]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || status !== "ready") return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [status, draw]);

  useEffect(() => {
    draw();
  }, [hidden, draw]);

  const zoomBy = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const px = cx ?? width / 2;
      const py = cy ?? height / 2;
      const view = viewRef.current;
      const worldX = (px - view.offsetX) / view.scale;
      const worldY = (height - py - view.offsetY) / view.scale;
      const scale = Math.min(Math.max(view.scale * factor, 1e-6), 1e9);
      viewRef.current = {
        scale,
        offsetX: px - worldX * scale,
        offsetY: height - py - worldY * scale,
      };
      draw();
    },
    [draw],
  );

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (status !== "ready") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (status !== "ready") return;
    const step = 40;
    const view = viewRef.current;
    if (event.key === "ArrowLeft") viewRef.current = { ...view, offsetX: view.offsetX + step };
    else if (event.key === "ArrowRight") viewRef.current = { ...view, offsetX: view.offsetX - step };
    else if (event.key === "ArrowUp") viewRef.current = { ...view, offsetY: view.offsetY - step };
    else if (event.key === "ArrowDown") viewRef.current = { ...view, offsetY: view.offsetY + step };
    else if (event.key === "+" || event.key === "=") zoomBy(1.2);
    else if (event.key === "-") zoomBy(1 / 1.2);
    else if (event.key === "0") {
      fit();
      return;
    } else return;
    event.preventDefault();
    draw();
  };

  const toggleLayer = (name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toolbar = (
    <>
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => zoomBy(1.2)}>
        <Plus className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t("drawings.zoomIn")}</span>
      </Button>
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => zoomBy(1 / 1.2)}>
        <Minus className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t("drawings.zoomOut")}</span>
      </Button>
      <Button variant="outline" size="sm" className="min-h-11" onClick={fit}>
        <Maximize2 className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t("drawings.fitToView")}</span>
      </Button>
      <Button variant="ghost" size="sm" className="min-h-11" onClick={fit}>
        <RotateCcw className="size-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t("drawings.resetView")}</span>
      </Button>
    </>
  );

  const layersPanel =
    !compact && scene && scene.layers.length > 0 ? (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-foreground">{t("drawings.layers")}</p>
        <ul className="max-h-40 space-y-1.5 overflow-y-auto pe-1">
          {scene.layers.map((layer) => (
            <li key={layer.name} className="flex items-center gap-2">
              <Checkbox
                id={`layer-${layer.name}`}
                checked={!hidden.has(layer.name)}
                onCheckedChange={() => toggleLayer(layer.name)}
              />
              <label
                htmlFor={`layer-${layer.name}`}
                className="min-w-0 flex-1 cursor-pointer truncate text-xs text-foreground"
                dir="ltr"
              >
                {layer.name}
              </label>
              <span className="text-[11px] text-muted-foreground" dir="ltr">
                {layer.entityCount.toLocaleString("en-US")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="space-y-2">
      <ViewerFrame toolbar={status === "ready" ? toolbar : undefined} side={layersPanel}>
        <div ref={wrapRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="img"
            aria-label={t("drawings.dxfCanvasLabel")}
            className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            onPointerDown={(event) => {
              if (status !== "ready") return;
              dragRef.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              const dx = event.clientX - drag.x;
              const dy = event.clientY - drag.y;
              dragRef.current = { x: event.clientX, y: event.clientY };
              const view = viewRef.current;
              viewRef.current = { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY - dy };
              draw();
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          />
          {status === "loading" ? <ViewerMessage title={t("drawings.viewerLoading")} /> : null}
          {status === "too_large" && !sizeCheck.ok ? (
            <ViewerMessage
              title={t("drawings.viewerTooLarge")}
              body={`${t("drawings.viewerLimitLabel")}: ${formatMb(DXF_MAX_BYTES)} MB`}
            />
          ) : null}
          {status === "empty" ? (
            <ViewerMessage
              title={t("drawings.viewerEmpty")}
              body={t("drawings.viewerEmptyBody")}
            />
          ) : null}
          {status === "error" ? (
            <ViewerMessage
              tone="error"
              title={t(errorKey)}
              body={t("drawings.viewerErrorBody")}
              action={{
                label: t("drawings.retry"),
                onClick: () => setReloadToken((n) => n + 1),
              }}
            />
          ) : null}
        </div>
      </ViewerFrame>

      {scene && status === "ready" ? (
        <p className="text-xs text-muted-foreground">
          {t("drawings.dxfDrawn")}:{" "}
          <span dir="ltr">{scene.supportedCount.toLocaleString("en-US")}</span>
          {scene.unsupportedTotal > 0 ? (
            <>
              {" · "}
              {t("drawings.dxfUnsupported")}:{" "}
              <span dir="ltr">
                {scene.unsupportedTotal.toLocaleString("en-US")} (
                {scene.unsupported
                  .slice(0, 4)
                  .map((item) => `${item.type} ${item.count.toLocaleString("en-US")}`)
                  .join(", ")}
                )
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
