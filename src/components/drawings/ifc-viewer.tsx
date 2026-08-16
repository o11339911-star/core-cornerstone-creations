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
import { ViewerFrame, ViewerMessage } from "./viewer-frame";

type Stage = "downloading" | "initializing" | "converting" | "ready" | "error" | "too_large" | "empty";

interface Cleanup {
  dispose: () => void;
  fit: () => void;
}

/**
 * عارض IFC تجريبي (Pilot): كل شيء داخل متصفح المستخدم عبر `web-ifc` بملف WASM
 * مستضاف داخل المشروع (`/wasm/web-ifc.wasm`). لا CDN، ولا إرسال أي بايت خارجيًا.
 * لا قياس ولا استخراج كميات — غير منفَّذ ولا يُدّعى.
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
  const cleanupRef = useRef<Cleanup | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sizeCheck = useMemo(() => checkSize(sizeBytes, IFC_MAX_BYTES), [sizeBytes]);
  const [stage, setStage] = useState<Stage>("downloading");
  const [errorKey, setErrorKey] = useState("drawings.viewerParseError");
  const [storeys, setStoreys] = useState<string[]>([]);
  const [meshCount, setMeshCount] = useState(0);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!sizeCheck.ok) {
      setStage("too_large");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), IFC_TIMEOUT_MS);
    setStage("downloading");
    setStoreys([]);
    setMeshCount(0);

    void (async () => {
      let api: { CloseModel?: (id: number) => void } | null = null;
      let modelID = -1;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("fetch_failed");
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        if (buffer.byteLength > IFC_MAX_BYTES) {
          setStage("too_large");
          return;
        }

        setStage("initializing");
        const [THREE, webifc, controlsMod] = await Promise.all([
          import("three"),
          import("web-ifc"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if (cancelled) return;

        const ifcApi = new webifc.IfcAPI();
        ifcApi.SetWasmPath("/wasm/", true);
        await ifcApi.Init();
        if (cancelled) {
          return;
        }
        api = ifcApi as unknown as { CloseModel?: (id: number) => void };

        setStage("converting");
        modelID = ifcApi.OpenModel(new Uint8Array(buffer));

        const host = hostRef.current;
        if (!host) return;
        const width = host.clientWidth || 1;
        const height = host.clientHeight || 1;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0xffffff, 1);
        host.appendChild(renderer.domElement);
        renderer.domElement.setAttribute("tabindex", "0");
        renderer.domElement.classList.add("outline-none");

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
        let meshes = 0;

        ifcApi.StreamAllMeshes(modelID, (mesh) => {
          const parts = mesh.geometries;
          for (let i = 0; i < parts.size(); i += 1) {
            const placed = parts.get(i);
            const geometry = ifcApi.GetGeometry(modelID, placed.geometryExpressID);
            const verts = ifcApi.GetVertexArray(
              geometry.GetVertexData(),
              geometry.GetVertexDataSize(),
            );
            const indices = ifcApi.GetIndexArray(
              geometry.GetIndexData(),
              geometry.GetIndexDataSize(),
            );
            const positions = new Float32Array(verts.length / 2);
            const normals = new Float32Array(verts.length / 2);
            for (let v = 0; v < verts.length; v += 6) {
              const o = v / 2;
              positions[o] = verts[v]!;
              positions[o + 1] = verts[v + 1]!;
              positions[o + 2] = verts[v + 2]!;
              normals[o] = verts[v + 3]!;
              normals[o + 1] = verts[v + 4]!;
              normals[o + 2] = verts[v + 5]!;
            }
            const bufferGeometry = new THREE.BufferGeometry();
            bufferGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            bufferGeometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
            bufferGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
            const color = placed.color;
            const material = new THREE.MeshLambertMaterial({
              color: new THREE.Color(color.x, color.y, color.z),
              transparent: color.w < 1,
              opacity: color.w,
              side: THREE.DoubleSide,
            });
            const object = new THREE.Mesh(bufferGeometry, material);
            object.matrix.fromArray(placed.flatTransformation);
            object.matrixAutoUpdate = false;
            group.add(object);
            meshes += 1;
            geometry.delete();
          }
        });

        if (cancelled) {
          renderer.dispose();
          return;
        }

        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() / 2, 1);

        const fit = () => {
          camera.position.set(center.x + radius * 1.6, center.y + radius * 1.2, center.z + radius * 1.6);
          camera.near = radius / 100;
          camera.far = radius * 100;
          camera.updateProjectionMatrix();
          controls.target.copy(center);
          controls.update();
        };
        fit();

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

        // أسماء الطوابق كما تستخرجها المكتبة فعليًا (عرض فقط، بلا تصفية).
        const names: string[] = [];
        try {
          const ids = ifcApi.GetLineIDsWithType(modelID, webifc.IFCBUILDINGSTOREY);
          for (let i = 0; i < ids.size(); i += 1) {
            const line = ifcApi.GetLine(modelID, ids.get(i)) as { Name?: { value?: string } };
            const name = line?.Name?.value;
            if (name) names.push(name);
          }
        } catch {
          /* بعض الملفات بلا طوابق معرّفة — لا ندّعي وجودها. */
        }

        cleanupRef.current = {
          fit,
          dispose: () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            controls.dispose();
            group.traverse((child) => {
              const asMesh = child as { geometry?: { dispose: () => void }; material?: unknown };
              asMesh.geometry?.dispose();
              const material = asMesh.material as { dispose?: () => void } | undefined;
              material?.dispose?.();
            });
            renderer.dispose();
            renderer.domElement.remove();
          },
        };

        setStoreys(names);
        setMeshCount(meshes);
        setStage(meshes === 0 ? "empty" : "ready");
      } catch (error) {
        if (cancelled) return;
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setErrorKey(aborted ? "drawings.viewerTimeout" : "drawings.ifcParseError");
        setStage("error");
      } finally {
        if (api && modelID >= 0) {
          try {
            api.CloseModel?.(modelID);
          } catch {
            /* لا شيء */
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      cleanupRef.current?.dispose();
      cleanupRef.current = null;
    };
  }, [url, token, sizeCheck.ok]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const busy = stage === "downloading" || stage === "initializing" || stage === "converting";

  const toolbar =
    stage === "ready" ? (
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={() => cleanupRef.current?.fit()}
      >
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
                : stage === "initializing"
                  ? t("drawings.ifcInitializing")
                  : t("drawings.ifcConverting")
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
