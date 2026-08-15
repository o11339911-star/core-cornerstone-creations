import * as React from "react";

import { toLatinDigits } from "@/lib/format";

/**
 * Minimal, dependency-free Markdown renderer for the Arabic legal documents.
 * Supports: `##`/`###` headings, `-` lists, `1.` lists, `>` notes, pipe tables,
 * `**bold**`, `` `code` `` and paragraphs. Anything else renders as plain text,
 * so a policy update can never break the page.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          dir="ltr"
          className="mx-1 rounded bg-muted px-1.5 py-0.5 text-[0.8em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block =
  | { kind: "h2" | "h3" | "p" | "note"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isTableRow = (l: string) => l.trim().startsWith("|") && l.trim().endsWith("|");
  const cells = (l: string) =>
    l
      .trim()
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ kind: "h3", text: trimmed.slice(4) });
      i += 1;
    } else if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", text: trimmed.slice(3) });
      i += 1;
    } else if (trimmed.startsWith("# ")) {
      blocks.push({ kind: "h2", text: trimmed.slice(2) });
      i += 1;
    } else if (trimmed.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("> ")) {
        buf.push((lines[i] ?? "").trim().slice(2));
        i += 1;
      }
      blocks.push({ kind: "note", text: buf.join(" ") });
    } else if (isTableRow(trimmed)) {
      const head = cells(trimmed);
      i += 1;
      if (i < lines.length && /^\|[\s:|-]+\|$/.test((lines[i] ?? "").trim())) i += 1;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow((lines[i] ?? "").trim())) {
        rows.push(cells(lines[i] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "table", head, rows });
    } else if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
    } else if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
    } else {
      const buf: string[] = [];
      while (
        i < lines.length &&
        (lines[i] ?? "").trim() &&
        !/^(#{1,3}\s|>\s|[-*]\s|\d+[.)]\s|\|)/.test((lines[i] ?? "").trim())
      ) {
        buf.push((lines[i] ?? "").trim());
        i += 1;
      }
      blocks.push({ kind: "p", text: buf.join(" ") });
    }
  }
  return blocks;
}

export function MarkdownView({ source }: { source: string }) {
  // Display-only rule (Phase 29): any Arabic-Indic digit inside a stored
  // document is rendered as 0-9; the stored text itself is never modified.
  const blocks = React.useMemo(() => parse(toLatinDigits(source)), [source]);
  return (
    <div className="space-y-4 text-[0.95rem] leading-8 text-muted-foreground">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.kind) {
          case "h2":
            return (
              <h2
                key={key}
                className="pt-4 text-lg font-bold text-foreground sm:text-xl"
              >
                {inline(block.text, key)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={key} className="pt-2 text-base font-semibold text-foreground">
                {inline(block.text, key)}
              </h3>
            );
          case "note":
            return (
              <p
                key={key}
                className="rounded-xl border-s-4 border-primary bg-secondary/60 px-4 py-3 text-sm text-foreground"
              >
                {inline(block.text, key)}
              </p>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-2 ps-6">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{inline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-2 ps-6">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{inline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={key} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[32rem] border-collapse text-sm">
                  <thead>
                    <tr>
                      {block.head.map((cell, j) => (
                        <th
                          key={`${key}-h-${j}`}
                          className="border border-border bg-secondary/60 px-3 py-2 text-start font-semibold text-foreground"
                        >
                          {inline(cell, `${key}-h-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r-${r}`}>
                        {row.map((cell, c) => (
                          <td
                            key={`${key}-r-${r}-${c}`}
                            className="border border-border px-3 py-2 align-top"
                          >
                            {inline(cell, `${key}-r-${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={key}>{inline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
