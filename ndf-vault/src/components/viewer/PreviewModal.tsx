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
  Folder as FolderIcon,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  PanelLeft,
  Plus,
  Printer,
  Scan,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVault } from "@/lib/store";
import type { VaultFile } from "@/lib/types";
import { formatDate, fullName, KIND_LABEL } from "@/lib/format";
import { Ndf5Mark, PageWatermark } from "../brand/Brand";
import { Button, IconButton } from "../ui";

const PAGE_W = 816; // US Letter at 96 dpi
const PAGE_H = 1056;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

type FitMode = "page" | "width" | null;

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

/**
 * Placeholder page for the interface stage. It is laid out at the real page
 * size so zoom, fit and thumbnails behave exactly as they will once PDF.js
 * renders actual document pages into the same slot.
 */
function SamplePage({ file, n, folderName }: { file: VaultFile; n: number; folderName: string }) {
  const seed = n + file.name.length;
  const isGrid = file.kind === "xlsx" || file.kind === "csv";
  return (
    <div className="relative flex h-full flex-col bg-white px-[88px] pb-[64px] pt-[72px] text-left">
      <PageWatermark />
      <div className="relative flex items-center justify-between">
        <Ndf5Mark className="h-[22px] w-auto text-ink" />
        <span className="rounded-md border border-dashed border-neutral-300 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Sample placeholder</span>
      </div>
      <div className="relative mt-14">
        {n === 1 ? (
          <>
            <h2 className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink">{file.name}</h2>
            <p className="mt-3 text-[14px] text-neutral-500">
              {KIND_LABEL[file.kind]} · {folderName} · Last modified {formatDate(file.modifiedAt)}
            </p>
            <p className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13.5px] leading-[21px] text-neutral-600">
              This page stands in for the document while the interface is being reviewed. It is not the file&rsquo;s content. Real page rendering with PDF.js replaces it in the viewer step.
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
        <span>NDF5 Productions — Confidential</span>
        <span>
          Page {n} of {file.pages}
        </span>
      </div>
    </div>
  );
}

function ScaledPage({ file, n, scale, folderName }: { file: VaultFile; n: number; scale: number; folderName: string }) {
  return (
    <div style={{ width: PAGE_W * scale, height: PAGE_H * scale }} className="overflow-hidden">
      <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <SamplePage file={file} n={n} folderName={folderName} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Modal */

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

export function PreviewModal() {
  const v = useVault();
  const { preview } = v;
  const file = preview ? v.files.find((f) => f.id === preview.fileId) : undefined;

  const [fullscreen, setFullscreen] = useState(false);
  const [panel, setPanel] = useState(true);
  const [thumbW, setThumbW] = useState(100);
  const [fit, setFit] = useState<FitMode>("page");
  const [zoom, setZoom] = useState(0.8);
  const [page, setPage] = useState(1);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

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
  useLayoutEffect(() => {
    if (!canvasEl || !fit) return;
    const apply = () => {
      const pad = canvasEl.clientWidth < 640 ? 24 : 64;
      const byWidth = (canvasEl.clientWidth - pad) / PAGE_W;
      const byHeight = (canvasEl.clientHeight - 48) / PAGE_H;
      const next = fit === "width" ? byWidth : Math.min(byWidth, byHeight);
      setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(canvasEl);
    return () => ro.disconnect();
  }, [canvasEl, fit, panel, fullscreen, fileId]);

  const goToPage = useCallback((n: number) => {
    pageRefs.current[n - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPage(n);
  }, []);

  const onScroll = () => {
    if (!canvasEl) return;
    const mid = canvasEl.scrollTop + canvasEl.clientHeight / 2;
    let best = 1;
    pageRefs.current.forEach((el, i) => {
      if (el && el.offsetTop <= mid) best = i + 1;
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
  const pages = Array.from({ length: file.pages }, (_, i) => i + 1);

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
              Back
            </Button>
            <span className="mx-2 hidden h-6 w-px bg-line sm:block" />
            <IconButton icon={ArrowUp} label="Previous file" disabled={!prevId} onClick={() => prevId && v.openPreview(prevId, preview.listIds, fullscreen)} />
            <IconButton icon={ArrowDown} label="Next file" disabled={!nextId} onClick={() => nextId && v.openPreview(nextId, preview.listIds, fullscreen)} />
            <nav aria-label="Location" className="ml-3 flex min-w-0 flex-1 items-center gap-2.5 text-[14.5px]">
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
            <IconButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? "Exit full screen" : "Full screen"} onClick={() => setFullscreen((f) => !f)} className="hidden md:inline-flex" />
            <IconButton icon={X} label="Close preview" onClick={v.closePreview} />
          </div>

          {/* Tool bar */}
          <div className="flex h-12 shrink-0 items-center gap-1 border-y border-line bg-subtle px-3 sm:px-4">
            <IconButton icon={PanelLeft} label={panel ? "Hide page thumbnails" : "Show page thumbnails"} variant="ghost" size="sm" active={panel} onClick={() => setPanel((p) => !p)} />
            <Divider />
            <IconButton icon={MoveHorizontal} label="Fit to width" variant="ghost" size="sm" active={fit === "width"} onClick={() => setFit("width")} />
            <IconButton icon={Scan} label="Fit to page" variant="ghost" size="sm" active={fit === "page"} onClick={() => setFit("page")} />
            <Divider />
            <IconButton icon={CircleMinus} label="Zoom out" variant="ghost" size="sm" disabled={zoom <= ZOOM_MIN} onClick={() => step(-1)} />
            <span aria-live="polite" className="flex h-8 w-[68px] items-center justify-center rounded-lg bg-neutral-200/60 text-[13px] font-medium tabular-nums text-ink">
              {Math.round(zoom * 100)}%
            </span>
            <IconButton icon={CirclePlus} label="Zoom in" variant="ghost" size="sm" disabled={zoom >= ZOOM_MAX} onClick={() => step(1)} />
            <Divider />
            <div className="hidden items-center gap-1 sm:flex">
              <IconButton icon={ChevronUp} label="Previous page" variant="ghost" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)} />
              <span className="min-w-[52px] text-center text-[13px] tabular-nums text-neutral-600">
                <span className="font-medium text-ink">{page}</span> / {file.pages}
              </span>
              <IconButton icon={ChevronDown} label="Next page" variant="ghost" size="sm" disabled={page >= file.pages} onClick={() => goToPage(page + 1)} />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <IconButton icon={Search} label="Search in document" variant="ghost" size="sm" onClick={() => v.notReady("Search inside documents")} />
              <IconButton icon={Printer} label="Print" variant="ghost" size="sm" onClick={() => v.notReady("Print")} className="hidden sm:inline-flex" />
              <IconButton icon={Download} label="Download" variant="ghost" size="sm" onClick={() => v.notReady("Download")} />
            </div>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1">
            {panel && (
              <aside aria-label="Page thumbnails" className="scroll-quiet w-[152px] shrink-0 overflow-y-auto border-r border-line bg-subtle sm:w-[272px]">
                <div className="sticky top-0 z-10 hidden items-center gap-3 bg-subtle px-5 pb-2 pt-4 sm:flex">
                  <button type="button" aria-label="Smaller thumbnails" onClick={() => setThumbW((w) => Math.max(72, w - 12))} className="text-neutral-600 hover:text-ink">
                    <Minus className="size-4" strokeWidth={1.75} />
                  </button>
                  <input type="range" min={72} max={208} step={4} value={thumbW} onChange={(e) => setThumbW(Number(e.target.value))} aria-label="Thumbnail size" className="vault-range min-w-0 flex-1" />
                  <button type="button" aria-label="Larger thumbnails" onClick={() => setThumbW((w) => Math.min(208, w + 12))} className="text-neutral-600 hover:text-ink">
                    <Plus className="size-4" strokeWidth={1.75} />
                  </button>
                </div>
                <ol className="flex flex-wrap justify-center gap-x-6 gap-y-5 px-5 pb-6 pt-4">
                  {pages.map((n) => {
                    const on = n === page;
                    return (
                      <li key={n}>
                        <button type="button" aria-label={`Go to page ${n}`} aria-current={on ? "page" : undefined} onClick={() => goToPage(n)} className="group block">
                          <span className={clsx("block overflow-hidden rounded-[3px] bg-white transition-shadow duration-150", on ? "shadow-[0_0_0_2px_#0a0a0a]" : "shadow-[0_0_0_1px_#e4e4e4,0_2px_6px_-2px_rgb(10_10_10/0.1)] group-hover:shadow-[0_0_0_1px_#a3a3a3]")}>
                            <ScaledPage file={file} n={n} scale={thumbW / PAGE_W} folderName={folderName} />
                          </span>
                          <span className={clsx("mt-2.5 block text-center text-[13px] tabular-nums", on ? "font-semibold text-ink" : "text-neutral-500")}>{n}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </aside>
            )}
            <div ref={setCanvasEl} onScroll={onScroll} className="scroll-quiet min-w-0 flex-1 overflow-auto scroll-smooth bg-white">
              <div className="mx-auto flex w-max min-w-full flex-col items-center gap-6 px-3 py-6 sm:px-8">
                {pages.map((n) => (
                  <div
                    key={n}
                    ref={(el) => {
                      pageRefs.current[n - 1] = el;
                    }}
                    className="scroll-mt-6 border border-line shadow-page"
                  >
                    <ScaledPage file={file} n={n} scale={zoom} folderName={folderName} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
