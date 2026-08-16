/**
 * تحويل ناتج `dxf-parser` إلى مسارات ثنائية الأبعاد جاهزة للرسم على Canvas.
 *
 * وحدة خالصة (pure) بلا DOM ولا شبكة — قابلة للاختبار مباشرة.
 * ما لا يُدعم لا يُرسم ولا يُدّعى دعمه: يُحصى ويُعرض للمستخدم بصراحة.
 */

export const SUPPORTED_DXF_ENTITIES = [
  "LINE",
  "LWPOLYLINE",
  "POLYLINE",
  "CIRCLE",
  "ARC",
  "ELLIPSE",
  "POINT",
  "SOLID",
] as const;

export interface DxfPath {
  layer: string;
  points: Array<[number, number]>;
  closed: boolean;
  /** مسار علامة نقطة (POINT): يُرسم صليبًا صغيرًا بحجم ثابت على الشاشة. */
  marker?: boolean;
}

/** تجاوز سقوف التعقيد — يُنهي التحويل فورًا بدل استهلاك الذاكرة. */
export class DxfCapacityError extends Error {
  readonly code = "capacity";
  constructor(public readonly limit: "entities" | "paths" | "points") {
    super(`dxf_capacity_${limit}`);
    this.name = "DxfCapacityError";
  }
}

export interface DxfBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DxfLayerInfo {
  name: string;
  entityCount: number;
}

export interface DxfScene {
  paths: DxfPath[];
  layers: DxfLayerInfo[];
  bounds: DxfBounds | null;
  /** عدد الكيانات المرسومة فعليًا. */
  supportedCount: number;
  /** أنواع الكيانات غير المدعومة وعدد كل نوع. */
  unsupported: Array<{ type: string; count: number }>;
  unsupportedTotal: number;
}

import {
  DXF_MAX_ENTITIES,
  DXF_MAX_PATHS,
  DXF_MAX_POINTS,
} from "./viewer-limits";

type AnyEntity = Record<string, unknown>;

const ARC_SEGMENTS = 64;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function point(value: unknown): [number, number] | null {
  if (!value || typeof value !== "object") return null;
  const x = num((value as AnyEntity)["x"]);
  const y = num((value as AnyEntity)["y"]);
  return x === null || y === null ? null : [x, y];
}

function arcPoints(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): Array<[number, number]> {
  let sweep = endAngle - startAngle;
  while (sweep <= 0) sweep += Math.PI * 2;
  const steps = Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * ARC_SEGMENTS));
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = startAngle + (sweep * i) / steps;
    out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return out;
}

/** قوس bulge بين نقطتين في polyline (تعريف AutoCAD القياسي). */
function bulgeArc(
  a: [number, number],
  b: [number, number],
  bulge: number,
): Array<[number, number]> {
  const theta = 4 * Math.atan(bulge);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const chord = Math.hypot(dx, dy);
  if (chord === 0 || !Number.isFinite(theta) || theta === 0) return [b];
  const radius = chord / (2 * Math.sin(theta / 2));
  const midX = (a[0] + b[0]) / 2;
  const midY = (a[1] + b[1]) / 2;
  const dist = Math.sqrt(Math.max(0, radius * radius - (chord / 2) * (chord / 2)));
  const sign = bulge > 0 ? 1 : -1;
  const cx = midX - (sign * dist * dy) / chord;
  const cy = midY + (sign * dist * dx) / chord;
  const startAngle = Math.atan2(a[1] - cy, a[0] - cx);
  const steps = Math.max(6, Math.ceil((Math.abs(theta) / (Math.PI * 2)) * ARC_SEGMENTS));
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i += 1) {
    const angle = startAngle + (theta * i) / steps;
    out.push([cx + Math.abs(radius) * Math.cos(angle), cy + Math.abs(radius) * Math.sin(angle)]);
  }
  return out;
}

function polylinePoints(entity: AnyEntity): Array<[number, number]> {
  const vertices = Array.isArray(entity["vertices"]) ? (entity["vertices"] as AnyEntity[]) : [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const current = point(vertices[i]);
    if (!current) continue;
    if (out.length === 0) out.push(current);
    const nextRaw = vertices[i + 1];
    const next = nextRaw ? point(nextRaw) : null;
    const bulge = num(vertices[i]?.["bulge"]);
    if (next && bulge) out.push(...bulgeArc(current, next, bulge));
    else if (next) out.push(next);
  }
  return out;
}

export function buildDxfScene(parsed: unknown): DxfScene {
  const root = (parsed ?? {}) as AnyEntity;
  const entities = Array.isArray(root["entities"]) ? (root["entities"] as AnyEntity[]) : [];
  const paths: DxfPath[] = [];
  const layerCounts = new Map<string, number>();
  const unsupportedCounts = new Map<string, number>();
  let supportedCount = 0;
  let totalPoints = 0;

  if (entities.length > DXF_MAX_ENTITIES) throw new DxfCapacityError("entities");

  const push = (
    layer: string,
    points: Array<[number, number]>,
    closed: boolean,
    marker = false,
  ) => {
    if (points.length < (marker ? 1 : 2)) return;
    if (paths.length + 1 > DXF_MAX_PATHS) throw new DxfCapacityError("paths");
    totalPoints += points.length;
    if (totalPoints > DXF_MAX_POINTS) throw new DxfCapacityError("points");
    paths.push(marker ? { layer, points, closed, marker: true } : { layer, points, closed });
  };

  for (const entity of entities) {
    const type = typeof entity["type"] === "string" ? (entity["type"] as string) : "UNKNOWN";
    const layer = typeof entity["layer"] === "string" ? (entity["layer"] as string) : "0";
    let drew = false;

    switch (type) {
      case "LINE": {
        const pts = polylinePoints(entity);
        if (pts.length >= 2) {
          push(layer, pts, false);
          drew = true;
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const pts = polylinePoints(entity);
        if (pts.length >= 2) {
          const closed = entity["shape"] === true || entity["closed"] === true;
          push(layer, closed ? [...pts, pts[0]!] : pts, closed);
          drew = true;
        }
        break;
      }
      case "SOLID": {
        const pts = polylinePoints(entity);
        if (pts.length >= 3) {
          push(layer, [...pts, pts[0]!], true);
          drew = true;
        }
        break;
      }
      case "CIRCLE": {
        const center = point(entity["center"]);
        const radius = num(entity["radius"]);
        if (center && radius && radius > 0) {
          push(layer, arcPoints(center[0], center[1], radius, 0, Math.PI * 2), true);
          drew = true;
        }
        break;
      }
      case "ARC": {
        const center = point(entity["center"]);
        const radius = num(entity["radius"]);
        const start = num(entity["startAngle"]) ?? 0;
        const end = num(entity["endAngle"]) ?? Math.PI * 2;
        if (center && radius && radius > 0) {
          push(layer, arcPoints(center[0], center[1], radius, start, end), false);
          drew = true;
        }
        break;
      }
      case "ELLIPSE": {
        const center = point(entity["center"]);
        const major = point(entity["majorAxisEndPoint"]);
        const ratio = num(entity["axisRatio"]) ?? 1;
        const start = num(entity["startAngle"]) ?? 0;
        const end = num(entity["endAngle"]) ?? Math.PI * 2;
        if (center && major) {
          const majorLen = Math.hypot(major[0], major[1]);
          const rot = Math.atan2(major[1], major[0]);
          let sweep = end - start;
          while (sweep <= 0) sweep += Math.PI * 2;
          const pts: Array<[number, number]> = [];
          for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
            const angle = start + (sweep * i) / ARC_SEGMENTS;
            const x = majorLen * Math.cos(angle);
            const y = majorLen * ratio * Math.sin(angle);
            pts.push([
              center[0] + x * Math.cos(rot) - y * Math.sin(rot),
              center[1] + x * Math.sin(rot) + y * Math.cos(rot),
            ]);
          }
          push(layer, pts, false);
          drew = true;
        }
        break;
      }
      case "POINT": {
        const p = point(entity["position"]);
        if (p) {
          push(layer, [p], false, true);
          drew = true;
        }
        break;
      }
      default:
        break;
    }

    if (drew) {
      supportedCount += 1;
      layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
    } else {
      unsupportedCounts.set(type, (unsupportedCounts.get(type) ?? 0) + 1);
    }
  }

  let bounds: DxfBounds | null = null;
  for (const path of paths) {
    for (const [x, y] of path.points) {
      if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  const unsupported = [...unsupportedCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    paths,
    layers: [...layerCounts.entries()]
      .map(([name, entityCount]) => ({ name, entityCount }))
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
    bounds,
    supportedCount,
    unsupported,
    unsupportedTotal: unsupported.reduce((sum, item) => sum + item.count, 0),
  };
}
