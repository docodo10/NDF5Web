import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

/** PDF.js is large, so it loads the first time a real PDF is opened. */
function loadPdfjs() {
  lib ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs")]);
    // Parse on the main thread: the hosted page is one file, with no separate worker script to load.
    (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;
    return pdfjs;
  })();
  return lib;
}

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data, useWorkerFetch: false, useWasm: false }).promise;
}

export type { PDFDocumentProxy };
