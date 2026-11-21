/**
 * Every piece of French in the source must sit in the French half of a
 * translation: `t(fr, en)`, `localized({ k: [fr, en] })`, `department(id, fr, en)`.
 * This walks the syntax tree and lists whatever does not, so that a French
 * sentence can never reach someone reading the vault in English.
 *
 *   node scripts/check-i18n.mjs
 *
 * Left alone on purpose: the journal, which is stored in French and
 * translated when shown (arguments of `log()`, `verb:` and `target:`), and
 * the files that hold the built-in names and their English. Anything else
 * that is French for a reason says so with `i18n-ok: why`, on its line or
 * the line above.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = new URL("../src/", import.meta.url).pathname;
// Data stored in French and paired with its English in these same files.
const DATA_FILES = new Set(["lib/builtin.ts", "lib/journal.ts", "lib/sample-data.ts"]);
// An accent, a French quotation mark, or one of the small words French cannot do without.
const FRENCH = /[àâçéèêëîïôûùüœ«»]|(?<![\w-])(les|des|une|dans|avec|pour|sur|aucune?|tous|toutes|votre|vos|est|sont|nouvel|nouveau|nouvelle|fichiers?|dossiers?|projets?|ce|cette|ces|ou|et|du|au|aux|le|la|un|de)(?![\w-])/i;
const TRANSLATORS = new Set(["t", "localized", "department"]);
const JOURNAL = new Set(["log"]);
const JOURNAL_KEYS = new Set(["verb", "target"]);

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name)) yield path;
  }
}

/** Whether a node sits in the English half of a translation: the second argument of `t`, the second of a `localized` pair, the third of `department`. */
function inEnglishHalf(node) {
  for (let n = node; n.parent; n = n.parent) {
    const p = n.parent;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression)) {
      const at = p.arguments.indexOf(n);
      if (p.expression.text === "t") return at === 1;
      if (p.expression.text === "department") return at === 2;
      if (p.expression.text === "localized") return false;
    }
    if (ts.isArrayLiteralExpression(p) && p.elements.length === 2 && p.elements[1] === n) {
      for (let up = p; up.parent; up = up.parent) {
        if (ts.isCallExpression(up.parent) && ts.isIdentifier(up.parent.expression) && up.parent.expression.text === "localized") return true;
      }
    }
  }
  return false;
}

/** Whether a node is covered: inside a translation call, or part of the journal. */
function covered(node) {
  for (let n = node; n.parent; n = n.parent) {
    const p = n.parent;
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression)) {
      const name = p.expression.text;
      if (TRANSLATORS.has(name) || JOURNAL.has(name)) return true;
    }
    if (ts.isPropertyAssignment(p) && p.initializer === n && ts.isIdentifier(p.name) && JOURNAL_KEYS.has(p.name.text)) return true;
    // Regular expressions and comparisons are code, not text shown to anyone.
    if (ts.isRegularExpressionLiteral(n)) return true;
  }
  return false;
}

const found = [];
for (const path of sources(ROOT)) {
  const file = relative(ROOT, path);
  if (DATA_FILES.has(file)) continue;
  const code = readFileSync(path, "utf8");
  const lines = code.split("\n");
  const excused = (line) => /i18n-ok/.test(lines[line]) || /i18n-ok/.test(lines[line - 1] ?? "");
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    const text =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node) ? node.text
      : ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text
      : null;
    if (text !== null && FRENCH.test(text) && !ts.isRegularExpressionLiteral(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      const shown = text.trim().replace(/\s+/g, " ").slice(0, 100);
      if (!covered(node)) {
        if (!excused(line)) found.push(`src/${file}:${line + 1}  ${shown}`);
      } else if (inEnglishHalf(node) && !excused(line)) {
        found.push(`src/${file}:${line + 1}  (French in the English half)  ${shown}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (found.length) {
  console.error(`French outside a translation (${found.length}):\n` + found.join("\n"));
  process.exit(1);
}
console.log("i18n: every French string has its English.");
