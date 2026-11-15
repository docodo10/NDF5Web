"use client";

import clsx from "clsx";
import { EyeOff, Info } from "lucide-react";
import { useState } from "react";
import { columnName, MAX_SHEET_COLS, MAX_SHEET_ROWS, type DocBlock, type DocxContent, type PptxContent, type XlsxContent } from "@/lib/office";
import { PageWatermark, PersonalWatermark } from "../brand/Brand";

/**
 * Previews of Word, Excel and PowerPoint files.
 *
 * Everything here is sized in `em`, so the viewer's zoom is just a font size
 * on the container. The content is plain text placed in React elements: none
 * of it can act as markup.
 */

/** Said above every Office preview: what is shown is the content, not the layout. */
export function SimplifiedNote({ children }: { children: string }) {
  return (
    <p className="mb-3 flex max-w-full items-start gap-2 text-left text-[12.5px] leading-[18px] text-neutral-500" data-simplified-note>
      <Info className="mt-px size-4 shrink-0 text-neutral-400" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

function Hidden({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-[0.4em] rounded-[0.5em] border border-dashed border-neutral-300 px-[0.6em] py-[0.15em] text-[0.8em] font-medium text-neutral-500">
      <EyeOff className="size-[1.1em]" strokeWidth={1.75} />
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- Word */

const HEADING = ["", "mt-[0.6em] text-[1.75em] font-semibold leading-[1.25] tracking-[-0.02em] text-ink", "mt-[0.5em] text-[1.3em] font-semibold leading-[1.3] tracking-[-0.01em] text-ink", "mt-[0.3em] text-[1.08em] font-semibold text-ink"];
const ALIGN = { left: "text-left", center: "text-center", right: "text-right" };

function Block({ block }: { block: DocBlock }) {
  if (block.type === "pageBreak") {
    return (
      <div role="separator" className="flex items-center gap-[0.8em] py-[0.8em] text-[0.78em] font-medium uppercase tracking-[0.12em] text-neutral-400">
        <span className="h-0 flex-1 border-t border-dashed border-neutral-300" />
        Saut de page
        <span className="h-0 flex-1 border-t border-dashed border-neutral-300" />
      </div>
    );
  }
  if (block.type === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="whitespace-pre-wrap border border-neutral-200 px-[0.7em] py-[0.45em] align-top text-neutral-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const runs = block.runs.map((r, i) => (
    <span key={i} className={clsx(r.bold && "font-semibold text-ink", r.italic && "italic", r.underline && "underline underline-offset-2")}>
      {r.text}
    </span>
  ));
  const Tag = block.heading === 1 ? "h2" : block.heading === 2 ? "h3" : block.heading === 3 ? "h4" : "p";
  if (block.list) {
    return (
      <p className="flex gap-[0.7em] whitespace-pre-wrap break-words pl-[1.1em]">
        <span aria-hidden className="text-neutral-400">
          •
        </span>
        <span className="min-w-0">{runs}</span>
      </p>
    );
  }
  return <Tag className={clsx("min-h-[0.6em] whitespace-pre-wrap break-words [tab-size:4]", ALIGN[block.align], HEADING[block.heading])}>{runs}</Tag>;
}

export function DocxView({ content }: { content: DocxContent }) {
  if (content.blocks.length === 0) return <p className="text-neutral-500">Ce document ne contient pas de texte.</p>;
  return (
    <div className="space-y-[0.8em] leading-[1.65] text-neutral-800">
      {content.blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      {content.truncated && <p className="border-t border-neutral-200 pt-[1em] text-neutral-500">Aperçu limité au début du document. Téléchargez l’original pour tout lire.</p>}
    </div>
  );
}

/* -------------------------------------------------------------------- Excel */

const NUMERIC = /^-?[\d\s  ]+(,\d+)?( %)?$/;

export function SheetView({ content }: { content: XlsxContent }) {
  const [active, setActive] = useState(0);
  const sheet = content.sheets[Math.min(active, content.sheets.length - 1)];
  if (!sheet) return <p className="text-neutral-500">Ce classeur ne contient aucune feuille.</p>;
  const width = sheet.rows[0]?.length ?? 0;
  return (
    <div className="text-neutral-800">
      {content.sheets.length > 1 && (
        <div role="tablist" aria-label="Feuilles du classeur" className="mb-[1em] flex flex-wrap gap-[0.4em]">
          {content.sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={clsx("inline-flex items-center gap-[0.5em] rounded-[0.6em] border px-[0.8em] py-[0.35em] font-medium transition-colors duration-150", i === active ? "border-ink bg-ink text-white" : "border-line bg-white text-neutral-600 hover:border-neutral-300 hover:text-ink")}
            >
              {s.name}
              {s.hidden && <EyeOff aria-label="Feuille masquée" className="size-[1.05em] opacity-70" strokeWidth={1.75} />}
            </button>
          ))}
        </div>
      )}
      {sheet.hidden && (
        <p className="mb-[0.9em]">
          <Hidden>Feuille masquée dans Excel</Hidden>
        </p>
      )}
      {sheet.rows.length === 0 ? (
        <p className="text-neutral-500">Cette feuille est vide.</p>
      ) : (
        <table role="tabpanel" aria-label={sheet.name} className="border-collapse text-left">
          <thead>
            <tr>
              <th className="border border-neutral-200 bg-neutral-50" />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} scope="col" className="min-w-[4.5em] border border-neutral-200 bg-neutral-50 px-[0.6em] py-[0.25em] text-center text-[0.85em] font-medium text-neutral-500">
                  {columnName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r}>
                <th scope="row" className="border border-neutral-200 bg-neutral-50 px-[0.6em] py-[0.25em] text-center text-[0.85em] font-medium tabular-nums text-neutral-500">
                  {r + 1}
                </th>
                {row.map((cell, c) => (
                  <td key={c} className={clsx("max-w-[28em] whitespace-pre-wrap break-words border border-neutral-200 px-[0.7em] py-[0.4em] align-top", NUMERIC.test(cell) && "text-right tabular-nums")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sheet.truncated && (
        <p className="mt-[1em] text-neutral-500">
          Aperçu limité aux {MAX_SHEET_ROWS} premières lignes et aux {MAX_SHEET_COLS} premières colonnes. Téléchargez l’original pour tout voir.
        </p>
      )}
      {content.truncated && <p className="mt-[1em] text-neutral-500">Ce classeur contient d’autres feuilles qui ne sont pas affichées ici.</p>}
    </div>
  );
}

/* --------------------------------------------------------------- PowerPoint */

export function SlidesView({ content, watermark, personal }: { content: PptxContent; watermark: boolean; personal: string | null }) {
  if (content.slides.length === 0) return <p className="text-neutral-500">Cette présentation ne contient aucune diapositive.</p>;
  return (
    <ol className="space-y-[1.8em]">
      {content.slides.map((slide, i) => (
        <li key={i} aria-label={`Diapositive ${i + 1}`} className="border border-line shadow-page">
          <div className="relative flex aspect-video flex-col overflow-hidden bg-white px-[3.4em] py-[2.8em] text-left">
            {watermark && <PageWatermark />}
            {personal && <PersonalWatermark text={personal} />}
            <div className="relative flex items-center justify-between gap-[1em] text-[0.8em] text-neutral-400">
              <span className="tabular-nums">
                {i + 1} / {content.slides.length}
              </span>
              {slide.hidden && <Hidden>Diapositive masquée</Hidden>}
            </div>
            <h3 className={clsx("relative mt-[0.7em] text-[1.9em] font-semibold leading-[1.2] tracking-[-0.02em]", slide.title ? "text-ink" : "text-neutral-300")}>{slide.title ?? "Sans titre"}</h3>
            <ul className="relative mt-[1.1em] min-h-0 flex-1 space-y-[0.45em] overflow-hidden text-[1.05em] leading-[1.5] text-neutral-700">
              {slide.lines.map((line, n) => (
                <li key={n} className="flex gap-[0.7em] break-words" style={{ paddingLeft: `${line.level * 1.4}em` }}>
                  <span aria-hidden className="text-neutral-300">
                    •
                  </span>
                  <span className="min-w-0">{line.text}</span>
                </li>
              ))}
            </ul>
          </div>
          {slide.notes && (
            <div className="border-t border-line bg-subtle px-[1.6em] py-[1.1em] text-left">
              <p className="text-[0.78em] font-semibold uppercase tracking-[0.1em] text-neutral-500">Notes du présentateur</p>
              <p className="mt-[0.4em] whitespace-pre-wrap break-words leading-[1.55] text-neutral-700">{slide.notes}</p>
            </div>
          )}
        </li>
      ))}
      {content.truncated && <li className="text-neutral-500">Aperçu limité aux premières diapositives. Téléchargez l’original pour tout voir.</li>}
    </ol>
  );
}
