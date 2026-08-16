/// <reference lib="webworker" />
/**
 * Worker تحليل DXF: يبقي `parseSync` وبناء الهندسة خارج الخيط الرئيسي،
 * فيصبح الإلغاء/المهلة فعليًا عبر `terminate()` بدل انتظار حلقة متجمدة.
 *
 * لا يستقبل رابطًا موقّعًا ولا يسجّل أي محتوى — يستقبل بايتات الملف فقط.
 */
import DxfParser from "dxf-parser";

import { DxfCapacityError, buildDxfScene, type DxfScene } from "./dxf-geometry";

export type DxfWorkerRequest = { buffer: ArrayBuffer };
export type DxfWorkerResponse =
  | { ok: true; scene: DxfScene }
  | { ok: false; code: "capacity" | "parse" };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<DxfWorkerRequest>) => {
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      new Uint8Array(event.data.buffer),
    );
    const parsed = new (DxfParser as unknown as new () => {
      parseSync: (input: string) => unknown;
    })().parseSync(text);
    const scene = buildDxfScene(parsed);
    const response: DxfWorkerResponse = { ok: true, scene };
    ctx.postMessage(response);
  } catch (error) {
    const response: DxfWorkerResponse = {
      ok: false,
      code: error instanceof DxfCapacityError ? "capacity" : "parse",
    };
    ctx.postMessage(response);
  }
});
