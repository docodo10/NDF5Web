"use client";

import clsx from "clsx";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleMinus,
  CirclePlus,
  Download,
  FileQuestion,
  Folder as FolderIcon,
  Image as ImageIcon,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  PanelLeft,
  Plus,
  Scan,
  ShieldAlert,
  Stamp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVault, type OriginalResult } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { parseCsv } from "@/lib/csv";
import { watermarkText } from "@/lib/stamp";
import { formatDate, fullName, KIND_LABEL } from "@/lib/format";
import { Ndf5Mark, PageWatermark, PersonalWatermark } from "../brand/Brand";
import { FileIcon } from "../files/FileTable";
import { Button, IconButton } from "../ui";
import { openPdf, type PDFDocumentProxy } from "./pdf";

const LETTER = { w: 816, h: 1056 }; // US Letter at 96 dpi
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const TEXT_PREVIEW_BYTES = 300 * 1024;
const CSV_PREVIEW_ROWS = 200;

type FitMode = "page" | "width" | null;
interface Size {
  w: number;
  h: number;
}

/** What the viewer is showing for the current file. */
type Doc =
  | { kind: "sample" }
  | { kind: "loading" }
  | { kind: "pdf"; pdf: PDFDocumentProxy; base: Size }
  | { kind: "image"; url: string; base: Size }
  | { kind: "text"; text: string; rows: string[][] | null; truncated: boolean }
  | { kind: "unsupported" }
  | { kind: "altered" }
  | { kind: "missing" };

/* ------------------------------------------------------------- Sample pages */

function Bars({ seed, count }: { seed: number; count: number }) {
  return (
    <div className="space-y-[13px]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[9px] rounded-full bg-neutral-200/80" style={{ width: `${i === count - 1 ? 38 + ((seed * 17) % 30) : 86 + ((seed * 7 + i * 13) % 15)}%` }} />
      ))}
    </div>
  );
}

function GridSkeleton({ seed }: { seed: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200">
      {Array.from({ length: 16 }, (_, r) => (
        <div key={r} className={clsx("grid h-9 grid-cols-[1.6fr_1fr_1fr_1fr_1fr] items-center gap-4 border-b border-neutral-200 px-4 last:border-b-0", r === 0 && "bg-neutral-100")}>
          {Array.from({ length: 5 }, (_, c) => (
            <div key={c} className={clsx("h-[8px] rounded-full", r === 0 ? "bg-neutral-300" : "bg-neutral-200/80")} style={{ width: `${45 + ((seed * 11 + r * 7 + c * 19) % 50)}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Stand-in page for the built-in sample files, which have no stored original. */
function SamplePage({ file, n, folderName, watermark, personal }: { file: VaultFile; n: number; folderName: string; watermark: boolean; personal: string | null }) {
  const seed = n + file.name.length;
  const isGrid = file.kind === "xlsx" || file.kind === "csv";
  return (
    <div className="relative flex h-full flex-col bg-white px-[88px] pb-[64px] pt-[72px] text-left">
      {watermark && <PageWatermark />}
      {personal && <PersonalWatermark text={personal} />}
      <div className="relative flex items-center justify-between">
        <Ndf5Mark className="h-[22px] w-auto text-ink" />
        <span className="rounded-md border border-dashed border-neutral-300 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Fichier d’exemple</span>
      </div>
      <div className="relative mt-14">
        {n === 1 ? (
          <>
            <h2 className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink">{file.name}</h2>
            <p className="mt-3 text-[14px] text-neutral-500">
              {KIND_LABEL[file.kind]} · {folderName} · Modifié le {formatDate(file.modifiedAt)}
            </p>
            <p className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13.5px] leading-[21px] text-neutral-600">
              Cette page tient lieu de document : c’est un fichier d’exemple, sans contenu réel. Téléversez un PDF, une image ou un fichier texte pour voir un vrai aperçu.
            </p>
          </>
        ) : (
          <div className="h-[13px] w-[42%] rounded-full bg-neutral-300" />
        )}
      </div>
      <div className="relative mt-12 flex-1 space-y-11 overflow-hidden">
        {file.kind === "image" ? (
          <div className="flex h-[520px] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-300">
            <ImageIcon className="size-16" strokeWidth={1} />
          </div>
        ) : isGrid ? (
          <GridSkeleton seed={seed} />
        ) : (
          <>
            <Bars seed={seed} count={n === 1 ? 5 : 7} />
            <Bars seed={seed + 3} count={6} />
            <Bars seed={seed + 5} count={n === 1 ? 4 : 6} />
            {n !== 1 && <Bars seed={seed + 8} count={4} />}
          </>
        )}
      </div>
      <div className="relative mt-8 flex items-center justify-between border-t border-neutral-200 pt-4 text-[11.5px] text-neutral-500">
        <span>NDF5 Productions — Confidentiel</span>
        <span>
          Page {n} sur {file.pages}
        </span>
      </div>
    </div>
  );
}

function ScaledSample({ file, n, scale, folderName, watermark, personal }: { file: VaultFile; n: number; scale: number; folderName: string; watermark: boolean; personal: string | null }) {
  return (
    <div style={{ width: LETTER.w * scale, height: LETTER.h * scale }} className="overflow-hidden">
      <div style={{ width: LETTER.w, height: LETTER.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <SamplePage file={file} n={n} folderName={folderName} watermark={watermark} personal={personal} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- PDF pages */

/** One PDF page drawn to a canvas, rendered only once it is near the viewport. */
function PdfPage({ pdf, n, width, base, watermark, personal }: { pdf: PDFDocumentProxy; n: number; width: number; base: Size; watermark: boolean; personal: string | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(base.h / base.w);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    // Wait for zooming to settle; the canvas stretches in the meantime.
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(n);
        if (cancelled || !canvas.current) return;
        const unit = page.getViewport({ scale: 1 });
        setRatio(unit.height / unit.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pixels = Math.min(width * dpr, 3200);
        const viewport = page.getViewport({ scale: pixels / unit.width });
        const el = canvas.current;
        el.width = Math.floor(viewport.width);
        el.height = Math.floor(viewport.height);
        task = page.render({ canvas: el, viewport });
        await task.promise;
      } catch {
        /* cancelled, or a page that cannot be drawn: the white slot stays */
      }
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [near, pdf, n, width]);

  return (
    <div ref={holder} className="relative overflow-hidden bg-white" style={{ width, height: Math.round(width * ratio) }}>
      <canvas ref={canvas} className="block h-full w-full" />
      {watermark && width > 300 && <PageWatermark />}
      {personal && width > 300 && <PersonalWatermark text={personal} />}
    </div>
  );
}

/* ----------------------------------------------------------- Loading a file */

function useDocument(file: VaultFile | undefined, read: (file: VaultFile) => Promise<OriginalResult>): Doc {
  const [doc, setDoc] = useState<Doc>({ kind: "loading" });
  const id = file?.id;
  const sample = file?.sample;
  const kind = file?.kind;

  useEffect(() => {
    if (!id || !kind) return;
    if (sample) {
      setDoc({ kind: "sample" });
      return;
    }
    let alive = true;
    let cleanup = () => {};
    setDoc({ kind: "loading" });
    (async () => {
      // The original is only shown when it is intact: its fingerprint is checked first.
      const original = await read(file);
      if (!alive) return;
      if (original.status === "altered" || original.status === "corrupt") return setDoc({ kind: "altered" });
      if (original.status !== "ok") return setDoc({ kind: "missing" });
      const blob = original.blob;
      try {
        if (kind === "pdf") {
          const pdf = await openPdf(blob);
          cleanup = () => void pdf.loadingTask.destroy();
          if (!alive) return cleanup();
          const first = (await pdf.getPage(1)).getViewport({ scale: 96 / 72 });
          if (alive) setDoc({ kind: "pdf", pdf, base: { w: first.width, h: first.height } });
        } else if (kind === "image") {
          const url = URL.createObjectURL(blob);
          cleanup = () => URL.revokeObjectURL(url);
          const img = new Image();
          img.onload = () => alive && setDoc({ kind: "image", url, base: { w: img.naturalWidth || LETTER.w, h: img.naturalHeight || LETTER.h } });
          img.onerror = () => alive && setDoc({ kind: "unsupported" });
          img.src = url;
        } else if (kind === "txt" || kind === "csv") {
          const text = await blob.slice(0, TEXT_PREVIEW_BYTES).text();
          const rows = kind === "csv" ? parseCsv(text, CSV_PREVIEW_ROWS) : null;
          if (alive) setDoc({ kind: "text", text, rows, truncated: blob.size > TEXT_PREVIEW_BYTES || (rows !== null && rows.length >= CSV_PREVIEW_ROWS) });
        } else {
          setDoc({ kind: "unsupported" });
        }
      } catch {
        if (alive) setDoc({ kind: "unsupported" });
      }
    })();
    return () => {
      alive = false;
      cleanup();
    };
    // Reload when the file or its content changes (a new or restored version), not on every edit of its details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sample, kind, file?.sha256, read]);

  return doc;
}

/* -------------------------------------------------------------------- Modal */

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

function Notice({ file, title, text, onDownload }: { file: VaultFile; title: string; text: string; onDownload?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <FileIcon kind={file.kind} size={56} />
      <p className="mt-5 text-[16px] font-semibold text-ink">{title}</p>
      <p className="mt-1.5 max-w-[380px] text-[13.5px] leading-[21px] text-neutral-500">{text}</p>
      {onDownload && (
        <Button variant="primary" icon={Download} className="mt-5" onClick={onDownload}>
          Télécharger l’original
        </Button>
      )}
    </div>
  );
}

export function PreviewModal() {
  const v = useVault();
  const { preview } = v;
  const file = preview ? v.files.find((f) => f.id === preview.fileId) : undefined;
  const doc = useDocument(file, v.readOriginal);

  const [fullscreen, setFullscreen] = useState(false);
  const [panel, setPanel] = useState(true);
  const [thumbW, setThumbW] = useState(100);
  const [fit, setFit] = useState<FitMode>("page");
  const [zoom, setZoom] = useState(0.8);
  const [page, setPage] = useState(1);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const base: Size = doc.kind === "pdf" || doc.kind === "image" ? doc.base : LETTER;
  const pageCount = doc.kind === "pdf" ? doc.pdf.numPages : doc.kind === "sample" && file ? file.pages : 1;
  // Zoom, fit and thumbnails apply to paged or image content; text reflows and notices are static.
  const zoomable = doc.kind === "sample" || doc.kind === "pdf" || doc.kind === "image" || doc.kind === "text";
  const paged = doc.kind === "sample" || doc.kind === "pdf";

  // Reset per-file state when the modal opens or the file changes.
  const fileId = file?.id;
  useEffect(() => {
    if (!fileId) return;
    setPage(1);
    setFit("page");
    canvasEl?.scrollTo({ top: 0 });
  }, [fileId, canvasEl]);
  useEffect(() => {
    if (!preview) return;
    setFullscreen(Boolean(preview.fullscreen));
    setPanel(window.matchMedia("(min-width: 768px)").matches);
    // Only when the modal opens, not on file-to-file navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(preview)]);

  // Fit-to-page / fit-to-width track the canvas size.
  const baseW = base.w;
  const baseH = base.h;
  const docKind = doc.kind;
  useLayoutEffect(() => {
    if (!canvasEl || !fit) return;
    const apply = () => {
      // Read the real gutter instead of assuming one: it follows the viewport, not the canvas width.
      const inner = canvasEl.firstElementChild;
      const cs = inner ? getComputedStyle(inner) : null;
      const pad = (cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 48) + 2;
      const byWidth = (canvasEl.clientWidth - pad) / baseW;
      const byHeight = (canvasEl.clientHeight - 50) / baseH;
      // Text has no fixed page height, and a small image should not be blown up to fill the window.
      let next = fit === "width" || docKind === "text" ? byWidth : Math.min(byWidth, byHeight);
      if (docKind === "image" && fit === "page") next = Math.min(next, 1);
      if (docKind === "text") next = Math.min(next, 1.25);
      setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(canvasEl);
    return () => ro.disconnect();
  }, [canvasEl, fit, panel, fullscreen, fileId, baseW, baseH, docKind]);

  // Who is looking and when, fixed at the moment the file is opened.
  const personal = useMemo(
    () => (v.personalMark && fileId ? watermarkText(v.profile) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileId, v.personalMark, v.profile],
  );

  const goToPage = useCallback((n: number) => {
    pageRefs.current[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPage(n);
  }, []);

  const onScroll = () => {
    if (!canvasEl || !paged) return;
    const mid = canvasEl.scrollTop + canvasEl.clientHeight / 2;
    let best = 1;
    pageRefs.current.forEach((el, i) => {
      if (el && i < pageCount && el.offsetTop <= mid) best = i + 1;
    });
    if (best !== page) setPage(best);
  };

  if (!preview || !file) return null;

  const index = preview.listIds.indexOf(file.id);
  const prevId = index > 0 ? preview.listIds[index - 1] : null;
  const nextId = index >= 0 && index < preview.listIds.length - 1 ? preview.listIds[index + 1] : null;
  const folderName = v.folders.find((d) => d.id === file.folderId)?.name ?? "NDF Vault";
  const step = (dir: 1 | -1) => {
    setFit(null);
    setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((z + dir * 0.1) * 10) / 10)));
  };
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const showPanel = panel && paged;
  const download = () => void v.downloadFile(file.id);

  const stampable = !file.sample && (file.kind === "pdf" || file.kind === "image") && (doc.kind === "pdf" || doc.kind === "image");
  const renderPage = (n: number, width: number) =>
    doc.kind === "pdf" ? (
      <PdfPage pdf={doc.pdf} n={n} width={width} base={doc.base} watermark={v.watermark} personal={personal} />
    ) : (
      <ScaledSample file={file} n={n} scale={width / LETTER.w} folderName={folderName} watermark={v.watermark} personal={width > 300 ? personal : null} />
    );

  return (
    <Dialog.Root open onOpenChange={(o) => !o && v.closePreview()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade bg-[rgb(234_234_234/0.78)] backdrop-blur-md" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={clsx(
            "fixed z-[61] flex animate-rise flex-col overflow-hidden bg-white focus:outline-none",
            fullscreen
              ? "inset-0"
              : "inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(820px,calc(100dvh-64px))] md:w-[min(1280px,calc(100vw-64px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-modal md:ring-1 md:ring-black/[0.06]",
          )}
        >
          {/* Title bar */}
          <div className="flex h-16 shrink-0 items-center gap-2 px-3 sm:px-4">
            <Button icon={ArrowLeft} onClick={v.closePreview}>
              Retour
            </Button>
            <span className="mx-2 hidden h-6 w-px bg-line sm:block" />
            <IconButton icon={ArrowUp} label="Fichier précédent" disabled={!prevId} onClick={() => prevId && v.openPreview(prevId, preview.listIds, fullscreen)} />
            <IconButton icon={ArrowDown} label="Fichier suivant" disabled={!nextId} onClick={() => nextId && v.openPreview(nextId, preview.listIds, fullscreen)} />
            <nav aria-label="Emplacement" className="ml-3 flex min-w-0 flex-1 items-center gap-2.5 text-[14.5px]">
              <button
                type="button"
                onClick={() => {
                  v.closePreview();
                  v.navigate({ view: "folder", id: file.folderId });
                }}
                className="hidden min-w-0 shrink items-center gap-2 text-neutral-500 transition-colors duration-150 hover:text-ink md:flex"
              >
                <FolderIcon className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{folderName}</span>
              </button>
              <ChevronRight className="hidden size-4 shrink-0 text-neutral-400 md:block" strokeWidth={1.75} />
              <Dialog.Title className="truncate font-medium text-ink">{fullName(file)}</Dialog.Title>
            </nav>
            <IconButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? "Quitter le plein écran" : "Plein écran"} onClick={() => setFullscreen((f) => !f)} className="max-md:hidden" />
            <IconButton icon={X} label="Fermer l’aperçu" onClick={v.closePreview} />
          </div>

          {/* Tool bar */}
          <div className="flex h-12 shrink-0 items-center gap-1 border-y border-line bg-subtle px-3 sm:px-4">
            <IconButton icon={PanelLeft} label={panel ? "Masquer les vignettes" : "Afficher les vignettes"} variant="ghost" size="sm" active={showPanel} disabled={!paged} onClick={() => setPanel((p) => !p)} />
            <Divider />
            <IconButton icon={MoveHorizontal} label="Ajuster à la largeur" variant="ghost" size="sm" active={zoomable && fit === "width"} disabled={!zoomable} onClick={() => setFit("width")} />
            <IconButton icon={Scan} label="Ajuster à la page" variant="ghost" size="sm" active={zoomable && fit === "page"} disabled={!zoomable} onClick={() => setFit("page")} />
            <Divider />
            <IconButton icon={CircleMinus} label="Zoom arrière" variant="ghost" size="sm" disabled={!zoomable || zoom <= ZOOM_MIN} onClick={() => step(-1)} />
            <span aria-live="polite" className="flex h-8 w-[68px] items-center justify-center rounded-lg bg-neutral-200/60 text-[13px] font-medium tabular-nums text-ink">
              {zoomable ? `${Math.round(zoom * 100)} %` : "—"}
            </span>
            <IconButton icon={CirclePlus} label="Zoom avant" variant="ghost" size="sm" disabled={!zoomable || zoom >= ZOOM_MAX} onClick={() => step(1)} />
            {paged && (
              <>
                <Divider />
                <div className="hidden items-center gap-1 sm:flex">
                  <IconButton icon={ChevronUp} label="Page précédente" variant="ghost" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)} />
                  <span data-page-indicator className="min-w-[52px] text-center text-[13px] tabular-nums text-neutral-600">
                    <span className="font-medium text-ink">{page}</span> / {pageCount}
                  </span>
                  <IconButton icon={ChevronDown} label="Page suivante" variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => goToPage(page + 1)} />
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              {stampable && <IconButton icon={Stamp} label="Télécharger avec filigrane" variant="ghost" size="sm" onClick={() => void v.downloadFile(file.id, { stamped: true })} />}
              <IconButton icon={Download} label="Télécharger" variant="ghost" size="sm" disabled={doc.kind === "altered"} onClick={download} />
            </div>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {showPanel && (
              <aside aria-label="Vignettes des pages" className="scroll-quiet w-[152px] shrink-0 overflow-y-auto border-r border-line bg-subtle sm:w-[272px]">
                <div className="sticky top-0 z-10 hidden items-center gap-3 bg-subtle px-5 pb-2 pt-4 sm:flex">
                  <button type="button" aria-label="Vignettes plus petites" onClick={() => setThumbW((w) => Math.max(72, w - 12))} className="text-neutral-600 hover:text-ink">
                    <Minus className="size-4" strokeWidth={1.75} />
                  </button>
                  <input id="thumb-size" type="range" min={72} max={208} step={4} value={thumbW} onChange={(e) => setThumbW(Number(e.target.value))} aria-label="Taille des vignettes" className="vault-range min-w-0 flex-1" />
                  <button type="button" aria-label="Vignettes plus grandes" onClick={() => setThumbW((w) => Math.min(208, w + 12))} className="text-neutral-600 hover:text-ink">
                    <Plus className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
                <ol className="flex flex-wrap justify-center gap-x-6 gap-y-5 px-5 pb-6 pt-4">
                  {pages.map((n) => {
                    const on = n === page;
                    return (
                      <li key={n}>
                        <button type="button" aria-label={`Aller à la page ${n}`} aria-current={on ? "page" : undefined} onClick={() => goToPage(n)} className="group block">
                          <span className={clsx("block overflow-hidden rounded-[3px] bg-white transition-shadow duration-150", on ? "shadow-[0_0_0_2px_#0a0a0a]" : "shadow-[0_0_0_1px_#e4e4e4,0_2px_6px_-2px_rgb(10_10_10/0.1)] group-hover:shadow-[0_0_0_1px_#a3a3a3]")}>
                            {renderPage(n, thumbW)}
                          </span>
                          <span className={clsx("mt-2.5 block text-center text-[13px] tabular-nums", on ? "font-semibold text-ink" : "text-neutral-500")}>{n}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>
            )}
            <div ref={setCanvasEl} data-viewer-canvas onScroll={onScroll} className="scroll-quiet min-w-0 flex-1 overflow-auto scroll-smooth bg-white">
              {doc.kind === "loading" && (
                <div className="flex h-full items-center justify-center text-neutral-400">
                  <LoaderCircle className="size-6 animate-spin" strokeWidth={1.75} aria-label="Chargement" />
                </div>
              )}
              {doc.kind === "unsupported" && (
                <Notice
                  file={file}
                  title={`Pas d’aperçu pour ce format (.${file.ext})`}
                  text="L’original est bien enregistré. Téléchargez-le pour l’ouvrir dans son application."
                  onDownload={download}
                />
              )}
              {doc.kind === "altered" && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <ShieldAlert className="size-10 text-red-500" strokeWidth={1.5} />
                  <p className="mt-4 text-[16px] font-semibold text-ink">Fichier altéré</p>
                  <p className="mt-1.5 max-w-[400px] text-[13.5px] leading-[21px] text-neutral-500">
                    Son contenu ne correspond plus à l’empreinte enregistrée au téléversement. Il n’est ni affiché ni téléchargeable. Supprimez-le et téléversez l’original de nouveau.
                  </p>
                </div>
              )}
              {doc.kind === "missing" && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <FileQuestion className="size-10 text-neutral-300" strokeWidth={1.25} />
                  <p className="mt-4 text-[16px] font-semibold text-ink">Original introuvable</p>
                  <p className="mt-1.5 max-w-[380px] text-[13.5px] leading-[21px] text-neutral-500">Ce fichier a été téléversé depuis un autre navigateur, ou les données de ce site ont été effacées.</p>
                </div>
              )}
              {paged && (
                <div className="mx-auto flex w-max min-w-full flex-col items-center gap-6 px-3 py-6 sm:px-8">
                  {pages.map((n) => (
                    <div
                      key={n}
                      ref={(el) => {
                        pageRefs.current[n - 1] = el;
                      }}
                      className="scroll-mt-6 border border-line shadow-page"
                    >
                      {renderPage(n, Math.round(base.w * zoom))}
                    </div>
                  ))}
                </div>
              )}
              {doc.kind === "image" && (
                <div className="mx-auto flex w-max min-w-full flex-col items-center px-3 py-6 sm:px-8">
                  <div className="relative overflow-hidden border border-line shadow-page">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={doc.url} alt={fullName(file)} draggable={false} className="block" style={{ width: Math.round(base.w * zoom), height: Math.round(base.h * zoom), maxWidth: "none" }} />
                    {v.watermark && <PageWatermark />}
                    {personal && <PersonalWatermark text={personal} />}
                  </div>
                </div>
              )}
              {doc.kind === "text" && (
                <div className="mx-auto flex w-max min-w-full flex-col items-center px-3 py-6 sm:px-8">
                  <div className="relative border border-line bg-white shadow-page" style={{ width: Math.round(LETTER.w * zoom), fontSize: 13 * zoom, padding: `${3.2 * zoom}em ${3.6 * zoom}em` }}>
                    {doc.rows ? (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                          <tbody>
                            {doc.rows.map((row, r) => (
                              <tr key={r} className={clsx("border-b border-neutral-200", r === 0 && "bg-neutral-50 font-semibold text-ink")}>
                                {row.map((cell, c) => (
                                  <td key={c} className="whitespace-nowrap px-[0.7em] py-[0.45em] text-neutral-700">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono leading-[1.6] text-neutral-800">{doc.text}</pre>
                    )}
                    {doc.truncated && <p className="mt-[1.5em] border-t border-neutral-200 pt-[1em] text-neutral-500">Aperçu limité au début du fichier. Téléchargez l’original pour tout voir.</p>}
                    {personal && <PersonalWatermark text={personal} />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
