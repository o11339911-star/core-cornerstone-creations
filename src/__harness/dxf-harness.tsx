import React from "react";
import { createRoot } from "react-dom/client";
import DxfViewer from "@/components/drawings/dxf-viewer";

export function mount(dxf: string) {
  const url = URL.createObjectURL(new Blob([dxf], { type: "text/plain" }));
  const host = document.createElement("div");
  host.id = "harness";
  host.style.height = "600px";
  document.body.appendChild(host);
  createRoot(host).render(React.createElement(DxfViewer, { url, sizeBytes: dxf.length }));
  return url;
}
