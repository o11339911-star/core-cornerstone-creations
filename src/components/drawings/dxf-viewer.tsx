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
import type { DxfScene } from "@/lib/drawings/dxf-geometry";
import type { DxfWorkerResponse } from "@/lib/drawings/dxf.worker";
import { ViewerFrame, ViewerMessage } from "./viewer-frame";

type Status = "loading" | "parsing" | "ready" | "error" | "too_large" | "capacity" | "empty";

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const LINE_COLOR = "#1f2a37";
const MARKER_PX = 4;
const ZOOM_INTENSITY = 0.0015;
const MIN_SCALE = 1e-6;
const MAX_SCALE = 1e9;

export default function DxfViewer({
  url,
  sizeBytes,
}: {
  url: string;
  sizeBytes?: number | null | undefined;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<View>({ scale: 1, offsetX: 0, offsetY: 0 });
  const sceneRef = useRef<DxfScene | null>(null);
  const hiddenRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const wheelRef = useRef<(event: WheelEvent) => void>(() => {});

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
      const first = path.points[0];
      if (!first) continue;
      const sx = first[0] * scale + offsetX;
      const sy = height - (first[1] * scale + offsetY);
      if (path.marker) {
        // علامة نقطة مرئية فعليًا: صليب صغير بحجم ثابت على الشاشة.
        ctx.moveTo(sx - MARKER_PX, sy);
        ctx.lineTo(sx + MARKER_PX, sy);
        ctx.moveTo(sx, sy - MARKER_PX);
        ctx.lineTo(sx, sy + MARKER_PX);
        continue;
      }
      ctx.moveTo(sx, sy);
      for (let i = 1; i < path.points.length; i += 1) {
        const p = path.points[i]!;
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
    let worker: Worker | null = null;
    const controller = new AbortController();
    const stop = () => {
      controller.abort();
      worker?.terminate();
      worker = null;
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      stop();
      setErrorKey("drawings.viewerTimeout");
      setStatus("error");
    }, DXF_TIMEOUT_MS);
    setStatus("loading");

    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("fetch_failed");
        // فحص الحجم الحقيقي بالبايت قبل أي فك ترميز.
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        if (buffer.byteLength > DXF_MAX_BYTES) {
          window.clearTimeout(timer);
          setStatus("too_large");
          return;
        }

        setStatus("parsing");
        worker = new Worker(new URL("@/lib/drawings/dxf.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = (event: MessageEvent<DxfWorkerResponse>) => {
          if (cancelled) return;
          window.clearTimeout(timer);
          const data = event.data;
          worker?.terminate();
          worker = null;
          if (!data.ok) {
            if (data.code === "capacity") {
              setStatus("capacity");
              return;
            }
            setErrorKey("drawings.viewerParseError");
            setStatus("error");
            return;
          }
          sceneRef.current = data.scene;
          setScene(data.scene);
          setHidden(new Set());
          if (data.scene.paths.length === 0) {
            setStatus("empty");
            return;
          }
          setStatus("ready");
          window.requestAnimationFrame(fit);
        };
        worker.onerror = () => {
          if (cancelled) return;
          window.clearTimeout(timer);
          setErrorKey("drawings.viewerParseError");
          setStatus("error");
        };
        worker.postMessage({ buffer }, [buffer]);
      } catch (error) {
        if (cancelled) return;
        window.clearTimeout(timer);
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setErrorKey(aborted ? "drawings.viewerTimeout" : "drawings.viewerParseError");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop();
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
      const scale = Math.min(Math.max(view.scale * factor, MIN_SCALE), MAX_SCALE);
      viewRef.current = {
        scale,
        offsetX: px - worldX * scale,
        offsetY: height - py - worldY * scale,
      };
      draw();
    },
    [draw],
  );

  // عجلة الفأرة/اللمس: مستمع أصلي غير سلبي حتى يعمل preventDefault فعليًا،
  // ومقدار التكبير يتناسب مع شدة الحركة بدل معامل ثابت لكل حدث.
  wheelRef.current = (event: WheelEvent) => {
    if (status !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
    zoomBy(Math.exp(-dy * ZOOM_INTENSITY), event.clientX - rect.left, event.clientY - rect.top);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      wheelRef.current(event);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

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
    scene && scene.layers.length > 0 && status === "ready" ? (
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
          {status === "loading" || status === "parsing" ? (
            <ViewerMessage
              title={t(status === "loading" ? "drawings.viewerLoading" : "drawings.dxfParsing")}
            />
          ) : null}
          {status === "too_large" ? (
            <ViewerMessage
              title={t("drawings.viewerTooLarge")}
              body={`${t("drawings.viewerLimitLabel")}: ${formatMb(DXF_MAX_BYTES)} MB`}
            />
          ) : null}
          {status === "capacity" ? (
            <ViewerMessage
              title={t("drawings.viewerCapacity")}
              body={t("drawings.viewerCapacityBody")}
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
