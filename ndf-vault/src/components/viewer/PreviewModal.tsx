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
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  PanelLeft,
  Plus,
  Scan,
  ScanLine,
  ShieldAlert,
  Stamp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVault, type OriginalResult } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { parseCsv } from "@/lib/csv";
import { OfficeError, readDocx, readPptx, readXlsx, type DocxContent, type PptxContent, type XlsxContent } from "@/lib/office";
import { bakeWatermark, PROTECTION_LABEL, protectionOf } from "@/lib/protection";
import { watermarkText } from "@/lib/stamp";
import { formatDate, fullName, KIND_LABEL } from "@/lib/format";
import { t } from "@/lib/i18n";
import { Ndf5Mark, PageWatermark, PersonalWatermark } from "../brand/Brand";
import { FileIcon } from "../files/FileTable";
import { Button, IconButton } from "../ui";
import { DocxView, SheetView, SimplifiedNote, SlidesView } from "./OfficePreview";
import { openPdf, type PDFDocumentProxy } from "@/lib/pdf";

const LETTER = { w: 816, h: 1056 }; // US Letter at 96 dpi
const SLIDE = { w: 960, h: 540 }; // 16:9
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
  // A protected image is never given a URL of its own: it is only ever drawn, with its watermark, on a canvas.
  | { kind: "image"; url: string | null; bitmap: ImageBitmap | null; base: Size }
  | { kind: "text"; text: string; rows: string[][] | null; truncated: boolean }
  | { kind: "docx"; content: DocxContent }
  | { kind: "xlsx"; content: XlsxContent }
  | { kind: "pptx"; content: PptxContent }
  | { kind: "unsupported" }
  | { kind: "tooLarge" }
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
        <span className="rounded-md border border-dashed border-neutral-300 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{t("Fichier d’exemple", "Sample file")}</span>
      </div>
      <div className="relative mt-14">
        {n === 1 ? (
          <>
            <h2 className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink">{file.name}</h2>
            <p className="mt-3 text-[14px] text-neutral-500">
              {KIND_LABEL[file.kind]} · {folderName} · {t(`Modifié le ${formatDate(file.modifiedAt)}`, `Modified ${formatDate(file.modifiedAt)}`)}
            </p>
            <p className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13.5px] leading-[21px] text-neutral-600">
              {t(
                "Cette page tient lieu de document : c’est un fichier d’exemple, sans contenu réel. Téléversez un PDF, une image, un fichier texte ou un document Office pour voir un vrai aperçu.",
                "This page stands in for a document: it is a sample file, with no real content. Upload a PDF, an image, a text file or an Office document to see a real preview.",
              )}
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
        <span>{t("NDF5 Productions — Confidentiel", "NDF5 Productions — Confidential")}</span>
        <span>
          {t(`Page ${n} sur ${file.pages}`, `Page ${n} of ${file.pages}`)}
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
function PdfPage({ pdf, n, width, base, watermark, personal, bake }: { pdf: PDFDocumentProxy; n: number; width: number; base: Size; watermark: boolean; personal: string | null; bake: boolean }) {
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
        delete el.dataset.baked;
        task = page.render({ canvas: el, viewport });
        await task.promise;
        // For a protected document the watermark goes into the pixels themselves.
        const ctx = bake && personal ? el.getContext("2d") : null;
        if (ctx && personal && !cancelled) {
          bakeWatermark(ctx, el.width, el.height, personal);
          el.dataset.baked = "true";
        }
      } catch {
        /* cancelled, or a page that cannot be drawn: the white slot stays */
      }
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [near, pdf, n, width, bake, personal]);

  return (
    <div ref={holder} className="relative overflow-hidden bg-white" style={{ width, height: Math.round(width * ratio) }}>
      <canvas ref={canvas} className="block h-full w-full" />
      {watermark && width > 300 && <PageWatermark />}
      {personal && !bake && width > 300 && <PersonalWatermark text={personal} />}
    </div>
  );
}

/** A protected image: drawn on a canvas with its watermark in the pixels. There is no file behind it to open or save. */
function BakedImage({ bitmap, width, height, text, label }: { bitmap: ImageBitmap; width: number; height: number; text: string | null; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    // Enough pixels for a sharp picture at any zoom, without drawing more than the screen can show.
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    el.width = Math.round(bitmap.width * scale);
    el.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, el.width, el.height);
    if (text) bakeWatermark(ctx, el.width, el.height, text);
    el.dataset.baked = "true";
  }, [bitmap, text]);
  return <canvas ref={canvas} role="img" aria-label={label} className="block" style={{ width, height }} />;
}

/**
 * The protected reading view. The document is blurred except for a band that
 * follows the pointer or the finger, and entirely when neither is on it: a
 * photo of the screen catches a few lines, never the page.
 */
function Fence({ host }: { host: HTMLElement | null }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!host || !el) return;
    // Moved by writing a CSS variable, not through React: the pages underneath must not re-render at every pixel.
    const show = (clientY: number) => {
      el.style.setProperty("--fence-y", `${Math.round(clientY - host.getBoundingClientRect().top)}px`);
      el.dataset.reading = "true";
    };
    const hide = () => {
      el.dataset.reading = "false";
    };
    const onPointer = (e: PointerEvent) => show(e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) show(e.touches[0].clientY);
    };
    host.addEventListener("pointermove", onPointer);
    host.addEventListener("pointerdown", onPointer);
    host.addEventListener("pointerleave", hide);
    host.addEventListener("touchstart", onTouch, { passive: true });
    host.addEventListener("touchmove", onTouch, { passive: true });
    host.addEventListener("touchend", hide);
    host.addEventListener("touchcancel", hide);
    window.addEventListener("blur", hide);
    return () => {
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerdown", onPointer);
      host.removeEventListener("pointerleave", hide);
      host.removeEventListener("touchstart", onTouch);
      host.removeEventListener("touchmove", onTouch);
      host.removeEventListener("touchend", hide);
      host.removeEventListener("touchcancel", hide);
      window.removeEventListener("blur", hide);
    };
  }, [host]);
  return (
    <div ref={root} data-fence data-reading="false" aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="fence-cover absolute inset-x-0 top-0" style={{ height: "max(0px, calc(var(--fence-y, 0px) - var(--fence-band) / 2))" }} />
      <div className="fence-cover absolute inset-x-0 bottom-0" style={{ top: "calc(var(--fence-y, 0px) + var(--fence-band) / 2)" }} />
      <div className="fence-all absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-ink text-white">
          <ScanLine className="size-5" strokeWidth={1.75} />
        </span>
        <p className="mt-3 text-[15px] font-semibold text-ink">{t("Lecture protégée", "Protected reading")}</p>
        <p className="mt-1 max-w-[320px] text-[13px] leading-[19px] text-neutral-600">{t("Placez le pointeur ou le doigt sur le document : seule la bande où vous lisez est nette.", "Place the pointer or your finger on the document: only the band where you are reading is sharp.")}</p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Loading a file */

function useDocument(file: VaultFile | undefined, read: (file: VaultFile) => Promise<OriginalResult>, guarded: boolean): Doc {
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
        } else if (kind === "image" && guarded) {
          const bitmap = await createImageBitmap(blob);
          cleanup = () => bitmap.close();
          if (!alive) return cleanup();
          setDoc({ kind: "image", url: null, bitmap, base: { w: bitmap.width || LETTER.w, h: bitmap.height || LETTER.h } });
        } else if (kind === "image") {
          const url = URL.createObjectURL(blob);
          cleanup = () => URL.revokeObjectURL(url);
          const img = new Image();
          img.onload = () => alive && setDoc({ kind: "image", url, bitmap: null, base: { w: img.naturalWidth || LETTER.w, h: img.naturalHeight || LETTER.h } });
          img.onerror = () => alive && setDoc({ kind: "unsupported" });
          img.src = url;
        } else if (kind === "txt" || kind === "csv") {
          const text = await blob.slice(0, TEXT_PREVIEW_BYTES).text();
          const rows = kind === "csv" ? parseCsv(text, CSV_PREVIEW_ROWS) : null;
          if (alive) setDoc({ kind: "text", text, rows, truncated: blob.size > TEXT_PREVIEW_BYTES || (rows !== null && rows.length >= CSV_PREVIEW_ROWS) });
        } else if (kind === "docx") {
          const content = await readDocx(blob);
          if (alive) setDoc({ kind: "docx", content });
        } else if (kind === "xlsx") {
          const content = await readXlsx(blob);
          if (alive) setDoc({ kind: "xlsx", content });
        } else if (kind === "pptx") {
          const content = await readPptx(blob);
          if (alive) setDoc({ kind: "pptx", content });
        } else {
          setDoc({ kind: "unsupported" });
        }
      } catch (e) {
        if (alive) setDoc({ kind: e instanceof OfficeError && e.reason === "too-large" ? "tooLarge" : "unsupported" });
      }
    })();
    return () => {
      alive = false;
      cleanup();
    };
    // Reload when the file or its content changes (a new or restored version), not on every edit of its details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sample, kind, file?.sha256, read, guarded]);

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
          {t("Télécharger l’original", "Download the original")}
        </Button>
      )}
    </div>
  );
}

export function PreviewModal() {
  const v = useVault();
  const { preview } = v;
  const file = preview ? v.files.find((f) => f.id === preview.fileId) : undefined;
  const level = protectionOf(file);
  // Beyond the standard level: nothing leaves, nothing is copied, and the watermark is not optional.
  const guarded = level !== "standard";
  const doc = useDocument(file, v.readOriginal, guarded);
  const [fenceChosen, setFenceChosen] = useState(false);
  const fence = level === "high" || fenceChosen;
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [captured, setCaptured] = useState(false);

  const [fullscreen, setFullscreen] = useState(false);
  const [panel, setPanel] = useState(true);
  const [thumbW, setThumbW] = useState(100);
  const [fit, setFit] = useState<FitMode>("page");
  const [zoom, setZoom] = useState(0.8);
  const [page, setPage] = useState(1);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Content that reflows to the width it is given, instead of having pages of a fixed size.
  const reflow = doc.kind === "text" || doc.kind === "docx" || doc.kind === "xlsx" || doc.kind === "pptx";
  const base: Size = doc.kind === "pdf" || doc.kind === "image" ? doc.base : doc.kind === "pptx" ? SLIDE : LETTER;
  const pageCount = doc.kind === "pdf" ? doc.pdf.numPages : doc.kind === "sample" && file ? file.pages : 1;
  // Zoom, fit and thumbnails apply to paged or image content; text reflows and notices are static.
  const zoomable = doc.kind === "sample" || doc.kind === "pdf" || doc.kind === "image" || reflow;
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
  const docKind = doc.kind === "pptx" ? "slides" : reflow ? "text" : doc.kind;
  useLayoutEffect(() => {
    if (!canvasEl || !fit) return;
    const apply = () => {
      // Read the real gutter instead of assuming one: it follows the viewport, not the canvas width.
      const inner = canvasEl.firstElementChild;
      const cs = inner ? getComputedStyle(inner) : null;
      const pad = (cs ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 48) + 2;
      const byWidth = (canvasEl.clientWidth - pad) / baseW;
      // Slides sit under a line of explanation, which takes its share of the height.
      const byHeight = (canvasEl.clientHeight - (docKind === "slides" ? 96 : 50)) / baseH;
      // Text has no fixed page height, and a small image should not be blown up to fill the window.
      let next = fit === "width" || docKind === "text" ? byWidth : Math.min(byWidth, byHeight);
      if (docKind === "image" && fit === "page") next = Math.min(next, 1);
      if (docKind === "text" || docKind === "slides") next = Math.min(next, 1.25);
      setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(canvasEl);
    return () => ro.disconnect();
  }, [canvasEl, fit, panel, fullscreen, fileId, baseW, baseH, docKind]);

  // Who is looking and when, fixed at the moment the file is opened.
  const code = preview?.code;
  const personal = useMemo(
    () => ((v.personalMark || guarded) && fileId ? [watermarkText(v.profile), code].filter(Boolean).join(" · ") : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fileId, v.personalMark, v.profile, guarded, code],
  );

  // A screen-capture key cannot be stopped, but it can be seen: the document is covered and the press goes to the journal.
  const { reportCapture } = v;
  useEffect(() => {
    if (!guarded || !fileId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "PrintScreen") return;
      setCaptured(true);
      reportCapture();
      // On some systems this replaces the picture that was just put on the clipboard.
      void navigator.clipboard?.writeText("").catch(() => {});
      clearTimeout(timer);
      timer = setTimeout(() => setCaptured(false), 4000);
    };
    window.addEventListener("keyup", onKey);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guarded, fileId]);

  const goToPage = useCallback((n: number) => {
    pageRefs.current[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPage(n);
  }, []);

  // Opened from a search result: go to where the match was found, once the document is on screen.
  const wantedPage = preview?.page;
  useEffect(() => {
    if (!wantedPage || wantedPage < 2 || !canvasEl) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (doc.kind === "pdf") timer = setTimeout(() => goToPage(Math.min(wantedPage, doc.pdf.numPages)), 120);
    else if (doc.kind === "pptx") timer = setTimeout(() => canvasEl.querySelector(`[data-slide="${wantedPage}"]`)?.scrollIntoView({ block: "start" }), 120);
    return () => clearTimeout(timer);
  }, [doc, wantedPage, canvasEl, goToPage]);

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
  // Thumbnails show whole pages at once, which is what the protected reading view exists to avoid.
  const showPanel = panel && paged && !fence;
  const block = guarded ? (e: { preventDefault: () => void }) => e.preventDefault() : undefined;
  const download = () => void v.downloadFile(file.id);

  const stampable = !guarded && !file.sample && (file.kind === "pdf" || file.kind === "image") && (doc.kind === "pdf" || doc.kind === "image");
  const renderPage = (n: number, width: number) =>
    doc.kind === "pdf" ? (
      <PdfPage pdf={doc.pdf} n={n} width={width} base={doc.base} watermark={v.watermark} personal={personal} bake={guarded} />
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
          data-protection={level}
          onContextMenu={block}
          onCopy={block}
          onCut={block}
          onDragStart={block}
          onKeyDownCapture={
            guarded
              ? (e) => {
                  // Save, print, copy, select all: none of them applies to a document that may only be read.
                  if ((e.ctrlKey || e.metaKey) && ["s", "p", "c", "a", "x"].includes(e.key.toLowerCase())) e.preventDefault();
                }
              : undefined
          }
          className={clsx(
            guarded && "select-none",
            "fixed z-[61] flex animate-rise flex-col overflow-hidden bg-white focus:outline-none",
            fullscreen
              ? "inset-0"
              : "inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(820px,calc(100dvh-64px))] md:w-[min(1280px,calc(100vw-64px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-modal md:ring-1 md:ring-black/[0.06]",
          )}
        >
          {/* Title bar */}
          <div className="flex h-16 shrink-0 items-center gap-2 px-3 sm:px-4">
            <Button icon={ArrowLeft} onClick={v.closePreview}>
              {t("Retour", "Back")}
            </Button>
            <span className="mx-2 hidden h-6 w-px bg-line sm:block" />
            <IconButton icon={ArrowUp} label={t("Fichier précédent", "Previous file")} disabled={!prevId} onClick={() => prevId && v.openPreview(prevId, preview.listIds, fullscreen)} />
            <IconButton icon={ArrowDown} label={t("Fichier suivant", "Next file")} disabled={!nextId} onClick={() => nextId && v.openPreview(nextId, preview.listIds, fullscreen)} />
            <nav aria-label={t("Emplacement", "Location")} className="ml-3 flex min-w-0 flex-1 items-center gap-2.5 text-[14.5px]">
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
            <IconButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? t("Quitter le plein écran", "Exit full screen") : t("Plein écran", "Full screen")} onClick={() => setFullscreen((f) => !f)} className="max-md:hidden" />
            <IconButton icon={X} label={t("Fermer l’aperçu", "Close preview")} onClick={v.closePreview} />
          </div>

          {/* Tool bar */}
          <div className="flex h-12 shrink-0 items-center gap-1 border-y border-line bg-subtle px-3 sm:px-4">
            <IconButton icon={PanelLeft} label={panel ? t("Masquer les vignettes", "Hide thumbnails") : t("Afficher les vignettes", "Show thumbnails")} variant="ghost" size="sm" active={showPanel} disabled={!paged} onClick={() => setPanel((p) => !p)} />
            <Divider />
            <IconButton icon={MoveHorizontal} label={t("Ajuster à la largeur", "Fit to width")} variant="ghost" size="sm" active={zoomable && fit === "width"} disabled={!zoomable} onClick={() => setFit("width")} />
            <IconButton icon={Scan} label={t("Ajuster à la page", "Fit to page")} variant="ghost" size="sm" active={zoomable && fit === "page"} disabled={!zoomable} onClick={() => setFit("page")} />
            <Divider />
            <IconButton icon={CircleMinus} label={t("Zoom arrière", "Zoom out")} variant="ghost" size="sm" disabled={!zoomable || zoom <= ZOOM_MIN} onClick={() => step(-1)} />
            <span aria-live="polite" className="flex h-8 w-[68px] items-center justify-center rounded-lg bg-neutral-200/60 text-[13px] font-medium tabular-nums text-ink">
              {zoomable ? t(`${Math.round(zoom * 100)} %`, `${Math.round(zoom * 100)}%`) : "—"}
            </span>
            <IconButton icon={CirclePlus} label={t("Zoom avant", "Zoom in")} variant="ghost" size="sm" disabled={!zoomable || zoom >= ZOOM_MAX} onClick={() => step(1)} />
            {paged && (
              <>
                <Divider />
                <div className="hidden items-center gap-1 sm:flex">
                  <IconButton icon={ChevronUp} label={t("Page précédente", "Previous page")} variant="ghost" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)} />
                  <span data-page-indicator className="min-w-[52px] text-center text-[13px] tabular-nums text-neutral-600">
                    <span className="font-medium text-ink">{page}</span> / {pageCount}
                  </span>
                  <IconButton icon={ChevronDown} label={t("Page suivante", "Next page")} variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => goToPage(page + 1)} />
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              {!file.sample && <IconButton icon={ScanLine} label={level === "high" ? t("Lecture protégée (imposée par le niveau de protection)", "Protected reading (required by the protection level)") : fence ? t("Quitter la lecture protégée", "Exit protected reading") : t("Lecture protégée", "Protected reading")} variant="ghost" size="sm" active={fence} disabled={level === "high"} onClick={() => setFenceChosen((f) => !f)} />}
              {stampable && <IconButton icon={Stamp} label={t("Télécharger avec filigrane", "Download with watermark")} variant="ghost" size="sm" onClick={() => void v.downloadFile(file.id, { stamped: true })} />}
              {guarded ? (
                <span data-protection-chip className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-[12px] font-medium text-neutral-700">
                  <Lock className="size-3.5" strokeWidth={2} />
                  <span className="max-sm:hidden">{PROTECTION_LABEL[level]}</span>
                </span>
              ) : (
                <IconButton icon={Download} label={t("Télécharger", "Download")} variant="ghost" size="sm" disabled={doc.kind === "altered"} onClick={download} />
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {showPanel && (
              <aside aria-label={t("Vignettes des pages", "Page thumbnails")} className="scroll-quiet w-[152px] shrink-0 overflow-y-auto border-r border-line bg-subtle sm:w-[272px]">
                <div className="sticky top-0 z-10 hidden items-center gap-3 bg-subtle px-5 pb-2 pt-4 sm:flex">
                  <button type="button" aria-label={t("Vignettes plus petites", "Smaller thumbnails")} onClick={() => setThumbW((w) => Math.max(72, w - 12))} className="text-neutral-600 hover:text-ink">
                    <Minus className="size-4" strokeWidth={1.75} />
                  </button>
                  <input id="thumb-size" type="range" min={72} max={208} step={4} value={thumbW} onChange={(e) => setThumbW(Number(e.target.value))} aria-label={t("Taille des vignettes", "Thumbnail size")} className="vault-range min-w-0 flex-1" />
                  <button type="button" aria-label={t("Vignettes plus grandes", "Larger thumbnails")} onClick={() => setThumbW((w) => Math.min(208, w + 12))} className="text-neutral-600 hover:text-ink">
                    <Plus className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
                <ol className="flex flex-wrap justify-center gap-x-6 gap-y-5 px-5 pb-6 pt-4">
                  {pages.map((n) => {
                    const on = n === page;
                    return (
                      <li key={n}>
                        <button type="button" aria-label={t(`Aller à la page ${n}`, `Go to page ${n}`)} aria-current={on ? "page" : undefined} onClick={() => goToPage(n)} className="group block">
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
            <div ref={setBodyEl} className="relative flex min-w-0 flex-1">
            <div ref={setCanvasEl} data-viewer-canvas onScroll={onScroll} className="scroll-quiet min-w-0 flex-1 overflow-auto scroll-smooth bg-white">
              {doc.kind === "loading" && (
                <div className="flex h-full items-center justify-center text-neutral-400">
                  <LoaderCircle className="size-6 animate-spin" strokeWidth={1.75} aria-label={t("Chargement", "Loading")} />
                </div>
              )}
              {doc.kind === "unsupported" && (
                <Notice
                  file={file}
                  title={file.kind === "docx" || file.kind === "xlsx" || file.kind === "pptx" ? t("Aperçu impossible pour ce fichier", "This file cannot be previewed") : t(`Pas d’aperçu pour ce format (.${file.ext})`, `No preview for this format (.${file.ext})`)}
                  text={t("L’original est bien enregistré. Téléchargez-le pour l’ouvrir dans son application.", "The original is safely stored. Download it to open it in its application.")}
                  onDownload={guarded ? undefined : download}
                />
              )}
              {doc.kind === "tooLarge" && <Notice file={file} title={t("Fichier trop volumineux pour l’aperçu", "File too large to preview")} text={t("L’original est bien enregistré. Téléchargez-le pour l’ouvrir dans son application.", "The original is safely stored. Download it to open it in its application.")} onDownload={guarded ? undefined : download} />}
              {doc.kind === "altered" && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <ShieldAlert className="size-10 text-red-500" strokeWidth={1.5} />
                  <p className="mt-4 text-[16px] font-semibold text-ink">{t("Fichier altéré", "Altered file")}</p>
                  <p className="mt-1.5 max-w-[400px] text-[13.5px] leading-[21px] text-neutral-500">
                    {t(
                      "Son contenu ne correspond plus à l’empreinte enregistrée au téléversement. Il n’est ni affiché ni téléchargeable. Supprimez-le et téléversez l’original de nouveau.",
                      "Its content no longer matches the fingerprint recorded at upload. It is neither shown nor downloadable. Delete it and upload the original again.",
                    )}
                  </p>
                </div>
              )}
              {doc.kind === "missing" && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <FileQuestion className="size-10 text-neutral-300" strokeWidth={1.25} />
                  <p className="mt-4 text-[16px] font-semibold text-ink">{t("Original introuvable", "Original not found")}</p>
                  <p className="mt-1.5 max-w-[380px] text-[13.5px] leading-[21px] text-neutral-500">{t("Ce fichier a été téléversé depuis un autre navigateur, ou les données de ce site ont été effacées.", "This file was uploaded from another browser, or this site’s data has been cleared.")}</p>
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
                    {doc.bitmap ? (
                      <BakedImage bitmap={doc.bitmap} width={Math.round(base.w * zoom)} height={Math.round(base.h * zoom)} text={personal} label={fullName(file)} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={doc.url ?? undefined} alt={fullName(file)} draggable={false} className="block" style={{ width: Math.round(base.w * zoom), height: Math.round(base.h * zoom), maxWidth: "none" }} />
                    )}
                    {v.watermark && <PageWatermark />}
                    {personal && !doc.bitmap && <PersonalWatermark text={personal} />}
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
                    {doc.truncated && <p className="mt-[1.5em] border-t border-neutral-200 pt-[1em] text-neutral-500">{t("Aperçu limité au début du fichier. Téléchargez l’original pour tout voir.", "Preview limited to the beginning of the file. Download the original to see everything.")}</p>}
                    {personal && <PersonalWatermark text={personal} />}
                  </div>
                </div>
              )}
              {doc.kind === "docx" && (
                <div className="mx-auto flex w-max min-w-full flex-col items-center px-3 py-6 sm:px-8">
                  <div style={{ width: Math.round(LETTER.w * zoom) }}>
                    <SimplifiedNote>{t("Aperçu simplifié : le texte, les titres et les tableaux. La mise en page, les images, les en-têtes et les notes de bas de page ne sont pas reproduits.", "Simplified preview: the text, headings and tables. Layout, images, headers and footnotes are not reproduced.")}</SimplifiedNote>
                    <div data-office="docx" className="relative border border-line bg-white shadow-page" style={{ fontSize: 13.5 * zoom, padding: `${4.4 * zoom}em ${4.8 * zoom}em` }}>
                      {v.watermark && <PageWatermark />}
                      <div className="relative">
                        <DocxView content={doc.content} />
                      </div>
                      {personal && <PersonalWatermark text={personal} />}
                    </div>
                  </div>
                </div>
              )}
              {doc.kind === "xlsx" && (
                <div className="mx-auto flex w-max min-w-full flex-col items-center px-3 py-6 sm:px-8">
                  <div style={{ minWidth: Math.round(LETTER.w * zoom) }}>
                    <SimplifiedNote>{t("Aperçu simplifié : les valeurs des cellules, feuille par feuille. Les formules affichent leur dernier résultat ; la mise en forme, les graphiques et les cellules fusionnées ne sont pas reproduits.", "Simplified preview: the cell values, sheet by sheet. Formulas show their last result; formatting, charts and merged cells are not reproduced.")}</SimplifiedNote>
                    <div data-office="xlsx" className="relative border border-line bg-white shadow-page" style={{ fontSize: 12.5 * zoom, padding: `${2 * zoom}em` }}>
                      <div className="relative">
                        <SheetView key={file.id} content={doc.content} initial={preview.page ? preview.page - 1 : 0} />
                      </div>
                      {personal && <PersonalWatermark text={personal} />}
                    </div>
                  </div>
                </div>
              )}
              {doc.kind === "pptx" && (
                <div className="mx-auto flex w-max min-w-full flex-col items-center px-3 py-6 sm:px-8">
                  <div data-office="pptx" style={{ width: Math.round(SLIDE.w * zoom), fontSize: 15 * zoom }}>
                    <SimplifiedNote>{t("Aperçu simplifié : le texte de chaque diapositive et les notes du présentateur. Les images, les graphiques et la mise en page ne sont pas reproduits.", "Simplified preview: the text of each slide and the speaker notes. Images, charts and layout are not reproduced.")}</SimplifiedNote>
                    <SlidesView content={doc.content} watermark={v.watermark} personal={personal} />
                  </div>
                </div>
              )}
            </div>
            {fence && !file.sample && <Fence host={bodyEl} />}
            {captured && (
              <div role="alert" data-capture-veil className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white px-6 text-center">
                <ShieldAlert className="size-10 text-red-500" strokeWidth={1.5} />
                <p className="mt-4 text-[16px] font-semibold text-ink">{t("Capture d’écran détectée", "Screenshot detected")}</p>
                <p className="mt-1.5 max-w-[380px] text-[13.5px] leading-[21px] text-neutral-600">{t("Ce document est protégé. La tentative est consignée dans le journal de sécurité, avec le code de cette consultation.", "This document is protected. The attempt is recorded in the security log, with the viewing code of this session.")}</p>
              </div>
            )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
