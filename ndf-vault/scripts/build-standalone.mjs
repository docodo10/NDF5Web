// Builds the vault as one self-contained HTML page (dist/ndf-vault.html) for static hosting:
// JS bundled with esbuild, CSS compiled by the Tailwind CLI, the font inlined as a data URI.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist");
mkdirSync(out, { recursive: true });

const js = await build({
  entryPoints: [resolve(root, "standalone/main.tsx")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  alias: { "@": resolve(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  logOverride: { "module-level-directive": "silent" },
  legalComments: "none",
});
const script = js.outputFiles[0].text;

execFileSync(resolve(root, "node_modules/.bin/tailwindcss"), ["-i", "src/app/globals.css", "-o", "dist/app.css", "--minify"], { cwd: root, stdio: "pipe" });
const font = readFileSync(resolve(root, "src/app/fonts/geist-latin-wght-normal.woff2")).toString("base64");
const css =
  `@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900;font-display:swap}` +
  `:root{--font-geist:"Geist"}` +
  readFileSync(resolve(out, "app.css"), "utf8");

if (/<\/script/i.test(script)) throw new Error("bundle contains a closing script tag");
if (/<\/style/i.test(css)) throw new Error("css contains a closing style tag");

// The host wraps this content in its own document skeleton, so there is no doctype, head or body here.
const page = `<title>NDF Vault</title>
<style>${css}</style>
<div id="vault-root" style="height:100%"></div>
<script>${script}</script>
`;
writeFileSync(resolve(out, "ndf-vault.html"), page);

// Same content inside a document shaped like the host's skeleton (charset, viewport and its small reset), to open locally.
const reset = `:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}`;
writeFileSync(
  resolve(out, "preview.html"),
  `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style></head><body>${page}</body></html>`,
);
console.log(`dist/ndf-vault.html  ${(page.length / 1024).toFixed(0)} KB  (js ${(script.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`);
