/// <reference lib="webworker" />
/**
 * Worker تحويل IFC: `OpenModel` و`StreamAllMeshes` متزامنان وثقيلان، فلا يمكن
 * إيقافهما بـAbortController. تشغيلهما داخل Worker يجعل الإلغاء حقيقيًا عبر
 * `terminate()`، ويبقي الخيط الرئيسي مستجيبًا.
 *
 * WASM محلي حصرًا (`/wasm/web-ifc.wasm`) — لا CDN ولا أي طلب خارجي.
 * لا يستقبل رابطًا موقّعًا ولا يسجّل أي محتوى.
 */
import { IFCBUILDINGSTOREY, IfcAPI } from "web-ifc";

import { IFC_MAX_MESHES, IFC_MAX_VERTICES } from "./viewer-limits";

export interface IfcMeshPayload {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  color: [number, number, number, number];
  matrix: number[];
}

export type IfcWorkerRequest = { buffer: ArrayBuffer };
export type IfcWorkerResponse =
  | { ok: true; meshes: IfcMeshPayload[]; storeys: string[] }
  | { ok: false; code: "capacity" | "parse" };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

class CapacityError extends Error {}

ctx.addEventListener("message", async (event: MessageEvent<IfcWorkerRequest>) => {
  const api = new IfcAPI();
  let modelID = -1;
  try {
    api.SetWasmPath("/wasm/", true);
    await api.Init();
    modelID = api.OpenModel(new Uint8Array(event.data.buffer));

    const meshes: IfcMeshPayload[] = [];
    let vertexTotal = 0;

    api.StreamAllMeshes(modelID, (mesh) => {
      const parts = mesh.geometries;
      for (let i = 0; i < parts.size(); i += 1) {
        if (meshes.length >= IFC_MAX_MESHES) throw new CapacityError("meshes");
        const placed = parts.get(i);
        const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
        // `verts`/`indexData` مجرد views على ذاكرة WASM: لا يجوز `delete()` قبل
        // نسخها إلى مصفوفات مملوكة، والحذف مضمون في `finally` حتى مع السعة/الخطأ.
        try {
          const verts = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          const indexData = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());

          const count = verts.length / 6;
          vertexTotal += count;
          if (vertexTotal > IFC_MAX_VERTICES) throw new CapacityError("vertices");

          const positions = new Float32Array(count * 3);
          const normals = new Float32Array(count * 3);
          for (let v = 0; v < count; v += 1) {
            const src = v * 6;
            const dst = v * 3;
            positions[dst] = verts[src]!;
            positions[dst + 1] = verts[src + 1]!;
            positions[dst + 2] = verts[src + 2]!;
            normals[dst] = verts[src + 3]!;
            normals[dst + 1] = verts[src + 4]!;
            normals[dst + 2] = verts[src + 5]!;
          }
          const color = placed.color;
          meshes.push({
            positions,
            normals,
            indices: new Uint32Array(indexData),
            color: [color.x, color.y, color.z, color.w],
            matrix: Array.from(placed.flatTransformation as ArrayLike<number>),
          });
        } finally {
          geometry.delete();
        }
      }
    });

    const storeys: string[] = [];
    try {
      const ids = api.GetLineIDsWithType(modelID, IFCBUILDINGSTOREY);
      for (let i = 0; i < ids.size(); i += 1) {
        const line = api.GetLine(modelID, ids.get(i)) as { Name?: { value?: string } };
        const name = line?.Name?.value;
        if (name) storeys.push(name);
      }
    } catch {
      /* بعض الملفات بلا طوابق معرّفة — لا ندّعي وجودها. */
    }

    const transfers: ArrayBufferLike[] = [];
    for (const mesh of meshes) {
      transfers.push(mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer);
    }
    const response: IfcWorkerResponse = { ok: true, meshes, storeys };
    ctx.postMessage(response, transfers as Transferable[]);
  } catch (error) {
    const response: IfcWorkerResponse = {
      ok: false,
      code: error instanceof CapacityError ? "capacity" : "parse",
    };
    ctx.postMessage(response);
  } finally {
    try {
      if (modelID >= 0) api.CloseModel(modelID);
    } catch {
      /* لا شيء */
    }
  }
});
