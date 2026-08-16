import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import {
  IFC_MAX_BYTES,
  IFC_TIMEOUT_MS,
  checkSize,
  formatMb,
} from "@/lib/drawings/viewer-limits";
import type { IfcWorkerResponse } from "@/lib/drawings/ifc.worker";
import { ViewerFrame, ViewerMessage } from "./viewer-frame";

type Stage =
  | "downloading"
  | "converting"
  | "rendering"
  | "ready"
  | "error"
  | "too_large"
  | "capacity"
  | "empty";

/**
 * عارض IFC تجريبي (Pilot): التحليل واستخراج الهندسة داخل Web Worker عبر
 * `web-ifc` بملف WASM مستضاف محليًا (`/wasm/web-ifc.wasm`) — لا CDN ولا إرسال
 * أي بايت خارج المتصفح. الإلغاء حقيقي: `terminate()` للـWorker.
 *
 * لا قياس ولا استخراج كميات ولا واجهة خصائص عناصر — غير منفَّذة ولا يُدّعى وجودها.
 */
export default function IfcViewer({
  url,
  sizeBytes,
}: {
  url: string;
  sizeBytes?: number | null | undefined;
}) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const sizeCheck = useMemo(() => checkSize(sizeBytes, IFC_MAX_BYTES), [sizeBytes]);
  const [stage, setStage] = useState<Stage>("downloading");
  const [errorKey, setErrorKey] = useState("drawings.ifcParseError");
  const [storeys, setStoreys] = useState<string[]>([]);
  const [meshCount, setMeshCount] = useState(0);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!sizeCheck.ok) {
      setStage("too_large");
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
    stopRef.current = () => {
      cancelled = true;
      stop();
      setErrorKey("drawings.viewerCancelled");
      setStage("error");
    };

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      stop();
      setErrorKey("drawings.viewerTimeout");
      setStage("error");
    }, IFC_TIMEOUT_MS);

    setStage("downloading");
    setStoreys([]);
    setMeshCount(0);

    const build = async (meshes: IfcMeshes, names: string[]) => {
      const [THREE, controlsMod] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      const host = hostRef.current;
      if (cancelled || !host) return;

      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0xffffff, 1);
      renderer.domElement.setAttribute("tabindex", "0");
      renderer.domElement.classList.add("outline-none");
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const dir = new THREE.DirectionalLight(0xffffff, 1.1);
      dir.position.set(1, 2, 1.5);
      scene.add(dir);

      const camera = new THREE.PerspectiveCamera(55, width / height, 0.05, 10_000);
      const controls = new controlsMod.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      const group = new THREE.Group();
      scene.add(group);
      for (const mesh of meshes) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
        const [r, g, b, a] = mesh.color;
        const material = new THREE.MeshLambertMaterial({
          color: new THREE.Color(r, g, b),
          transparent: a < 1,
          opacity: a,
          side: THREE.DoubleSide,
        });
        const object = new THREE.Mesh(geometry, material);
        object.matrix.fromArray(mesh.matrix);
        object.matrixAutoUpdate = false;
        group.add(object);
      }

      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 1);
      const fit = () => {
        camera.position.set(
          center.x + radius * 1.6,
          center.y + radius * 1.2,
          center.z + radius * 1.6,
        );
        camera.near = radius / 100;
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
      };
      fit();
      fitRef.current = fit;

      let frame = 0;
      const loop = () => {
        frame = requestAnimationFrame(loop);
        controls.update();
        renderer.render(scene, camera);
      };
      loop();

      const observer = new ResizeObserver(() => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      observer.observe(host);

      disposeRef.current = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        group.traverse((child) => {
          const asMesh = child as { geometry?: { dispose: () => void }; material?: unknown };
          asMesh.geometry?.dispose();
          (asMesh.material as { dispose?: () => void } | undefined)?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };

      setStoreys(names);
      setMeshCount(meshes.length);
      setStage(meshes.length === 0 ? "empty" : "ready");
    };

    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("fetch_failed");
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        if (buffer.byteLength > IFC_MAX_BYTES) {
          window.clearTimeout(timer);
          setStage("too_large");
          return;
        }

        setStage("converting");
        worker = new Worker(new URL("@/lib/drawings/ifc.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = (event: MessageEvent<IfcWorkerResponse>) => {
          if (cancelled) return;
          window.clearTimeout(timer);
          const data = event.data;
          worker?.terminate();
          worker = null;
          if (!data.ok) {
            if (data.code === "capacity") {
              setStage("capacity");
              return;
            }
            setErrorKey("drawings.ifcParseError");
            setStage("error");
            return;
          }
          setStage("rendering");
          void build(data.meshes, data.storeys);
        };
        worker.onerror = () => {
          if (cancelled) return;
          window.clearTimeout(timer);
          setErrorKey("drawings.ifcParseError");
          setStage("error");
        };
        worker.postMessage({ buffer }, [buffer]);
      } catch (error) {
        if (cancelled) return;
        window.clearTimeout(timer);
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setErrorKey(aborted ? "drawings.viewerCancelled" : "drawings.ifcParseError");
        setStage("error");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop();
      stopRef.current = null;
      fitRef.current = null;
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [url, token, sizeCheck.ok]);

  const cancel = useCallback(() => stopRef.current?.(), []);
  const busy = stage === "downloading" || stage === "converting" || stage === "rendering";

  const toolbar =
    stage === "ready" ? (
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => fitRef.current?.()}>
        <Maximize2 className="size-4" aria-hidden="true" />
        {t("drawings.fitToView")}
      </Button>
    ) : busy ? (
      <Button variant="ghost" size="sm" className="min-h-11" onClick={cancel}>
        <X className="size-4" aria-hidden="true" />
        {t("drawings.cancel")}
      </Button>
    ) : undefined;

  const side =
    stage === "ready" && storeys.length > 0 ? (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-foreground">{t("drawings.ifcStoreys")}</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
          {storeys.map((name, index) => (
            <li key={`${name}-${index}`} className="truncate" dir="ltr">
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">{t("drawings.ifcStoreysNote")}</p>
      </div>
    ) : null;

  return (
    <div className="space-y-2">
      <ViewerFrame toolbar={toolbar} side={side}>
        <div
          ref={hostRef}
          className="absolute inset-0 bg-white"
          role="img"
          aria-label={t("drawings.ifcCanvasLabel")}
        />
        {busy ? (
          <ViewerMessage
            title={
              stage === "downloading"
                ? t("drawings.viewerLoading")
                : stage === "converting"
                  ? t("drawings.ifcConverting")
                  : t("drawings.ifcRendering")
            }
            body={t("drawings.ifcPilotNote")}
          />
        ) : null}
        {stage === "too_large" ? (
          <ViewerMessage
            title={t("drawings.viewerTooLarge")}
            body={`${t("drawings.viewerLimitLabel")}: ${formatMb(IFC_MAX_BYTES)} MB`}
          />
        ) : null}
        {stage === "capacity" ? (
          <ViewerMessage
            title={t("drawings.viewerCapacity")}
            body={t("drawings.viewerCapacityBody")}
          />
        ) : null}
        {stage === "empty" ? (
          <ViewerMessage title={t("drawings.viewerEmpty")} body={t("drawings.ifcEmptyBody")} />
        ) : null}
        {stage === "error" ? (
          <ViewerMessage
            tone="error"
            title={t(errorKey)}
            body={t("drawings.viewerErrorBody")}
            action={{ label: t("drawings.retry"), onClick: () => setToken((n) => n + 1) }}
          />
        ) : null}
      </ViewerFrame>
      {stage === "ready" ? (
        <p className="text-xs text-muted-foreground">
          {t("drawings.ifcMeshes")}: <span dir="ltr">{meshCount.toLocaleString("en-US")}</span> ·{" "}
          {t("drawings.ifcPilotNote")}
        </p>
      ) : null}
    </div>
  );
}

type IfcMeshes = Extract<IfcWorkerResponse, { ok: true }>["meshes"];
