# NDF Vault — Security model and review

_Last reviewed: 2026-11-14. Scope: the `ndf-vault/` app, plus the Vault page already live on `www.ndf5.com`._

NDF Vault is meant to hold confidential film-industry material (screenplays, NDAs,
financial and legal documents). This file records the threat model, what the
current build does and does not protect, the findings of the 2026-11-14 review,
and the rules the backend must enforce before any real document is stored.

## 1. Where trust lives

**A static front end cannot keep a secret or gate a file.** Everything the browser
receives — HTML, JavaScript, and any file it links to — is readable by whoever
loads the page. There is no server in a static export to check a password, hide a
document, or enforce an access tier. Any "protection" written in client-side code
is bypassable and must be treated as decoration, not a control.

Therefore the security boundary is the **backend**, not this app. The front end is
assumed hostile-reachable; the server is the only place that may hold secrets,
authenticate guests, authorize each download, and store private files.

## 2. Current build — what it is

- **Interface only, in memory.** No uploads, no network calls, no persistence, no
  real documents. Everything resets on reload. Sample content is labelled "Sample".
- **No secrets in the front end.** No passwords, API keys, or tokens anywhere in
  `src/`. Confirmed by review and by `npm audit` (0 vulnerabilities).
- **No XSS sinks.** No `dangerouslySetInnerHTML`, `eval`, `innerHTML`, or
  `document.write`. All user-entered text (file names, folders, tags, notes) is
  rendered as React text nodes, which are escaped.
- **Input is sanitized at one choke point.** `sanitizeName()` in `src/lib/format.ts`
  strips control characters and path separators and caps length; the store calls it
  on every rename / new folder / new project. This blocks path traversal (`../`),
  filename/header injection, and unbounded input before names ever become storage
  keys or download filenames in phase 2. `<input maxLength>` mirrors it in the UI.
- **Baseline headers.** A CSP `<meta>` ships in the production HTML (`layout.tsx`,
  gated to production because React's dev build needs `eval`). The full header set
  (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS) is written in `public/_headers`. That file is applied
  by Cloudflare Pages / Netlify static deploys — the planned host — once static
  export is enabled (`output: "export"` in `next.config.ts`, which emits it to
  `out/_headers`). On a Node host instead, set the same headers in
  `next.config.ts` → `headers()`. `frame-ancestors`, HSTS and `X-Frame-Options`
  are header-only and do nothing from a `<meta>` tag, so the host must apply them.

## 3. Findings (2026-11-14 review)

| # | Where | Severity | Finding | Status |
|---|-------|----------|---------|--------|
| 1 | `vault/vault.js` (live site) | High | Password `NDF2026` is checked in client JavaScript on a **public** repo. Anyone reads it in the source, and the "gated" content is only hidden with a CSS class, so it already sits in the DOM. | **Open — architectural.** Cannot be fixed client-side. No real file is behind it today (`href="#"`). Must move to a server gate before any real document is placed there; until then, place none. |
| 2 | 24 live `*.html` pages | Medium | Each loads `unpkg.com/lucide@latest` and `cdn.tailwindcss.com` — unpinned third-party scripts with full page privileges. A compromised package or CDN runs arbitrary JavaScript on `www.ndf5.com`. | **Open.** Pin to exact versions + Subresource Integrity, or self-host/bundle. Tracked for a site-wide pass. |
| 3 | `vault/vault.js` `applyI18n()` | Low | Assigns translation strings with `innerHTML`. Strings are hard-coded today, so not exploitable, but the pattern is unsafe if any string ever carries user or URL input. | Open — use `textContent`, or keep strings constant. |
| 4 | `ndf-vault/` app | — | Unbounded input length; names could reach storage keys / filenames unsanitized in phase 2. | **Fixed** (`sanitizeName`, `maxLength`). |
| 5 | `ndf-vault/` app | — | No security headers / CSP. | **Fixed** (`layout.tsx` meta + `public/_headers`). |

## 4. What the backend MUST enforce (phase 2)

Derived from the NDF5 Vault data-room plan. None of this can live in the front end.

1. **Authentication server-side.** Guests sign in with an emailed one-time code
   (Cloudflare Access / Workers). No shared password; no credential in client code.
2. **Authorization per request.** Every file read is checked against the guest's
   tier (0 public → 3 private deal room) and the folder's access, on the server.
   The front end's folder `access` labels are display hints only and enforce nothing.
3. **Private storage + short-lived signed URLs.** Files live in private storage
   (never a public bucket, never the public GitHub repo). Downloads go through
   per-file links valid for minutes, never permanent public URLs.
4. **Server-side watermarking** (name, company, email, date) stamped into any
   download; view-only by default. Client-side watermarks deter but do not prove.
5. **Server-side validation of uploads** — type, size, and content — plus an
   access/activity log kept server-side as the record of who opened what.
6. **No real document in the public repository, ever.** The repo is public
   (`CNAME` → `www.ndf5.com`, GitHub Pages). Keep `docs/` sample-only; serve the
   real Vault from a host outside the repo.

## 5. Reporting

Found a problem? Email the maintainer rather than opening a public issue, so a
flaw in anything holding real documents is not disclosed before it is fixed.
