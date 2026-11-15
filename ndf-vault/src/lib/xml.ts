/**
 * A small XML reader for the files found inside Office documents.
 *
 * It only understands what those files use: elements, attributes, text,
 * CDATA, comments and the five built-in entities. A document type declaration
 * is refused outright, so the entity tricks that make XML dangerous to read
 * (external entities, exponential expansion) cannot be expressed at all.
 */

export type XmlToken =
  | { type: "open"; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: "close"; name: string }
  | { type: "text"; text: string };

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlError";
  }
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{1,12});/g, (whole, body: string) => {
    if (body[0] !== "#") return NAMED[body] ?? whole;
    const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    // Control characters other than tab, line feed and carriage return are not text.
    if (!(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x10ffff)) || (code >= 0xd800 && code <= 0xdfff)) return "";
    return String.fromCodePoint(code);
  });
}

/** "w:p" → "p". Office parts are read by local name, whatever prefix their author chose. */
const local = (name: string) => {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
};

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

/**
 * Read `name="value"` pairs. Written as a single pass over the text on
 * purpose: a pattern-matching version takes time proportional to the square
 * of the input on a tag stuffed with junk, which is enough to freeze the page.
 */
function readAttributes(s: string, attrs: Record<string, string>): void {
  const n = s.length;
  let i = 0;
  while (i < n) {
    while (i < n && isSpace(s.charCodeAt(i))) i++;
    const start = i;
    while (i < n && s[i] !== "=" && !isSpace(s.charCodeAt(i))) i++;
    const name = s.slice(start, i);
    while (i < n && isSpace(s.charCodeAt(i))) i++;
    if (s[i] !== "=") continue; // a bare word, not an attribute
    i++;
    while (i < n && isSpace(s.charCodeAt(i))) i++;
    const quote = s[i];
    if (quote !== '"' && quote !== "'") continue;
    const end = s.indexOf(quote, i + 1);
    if (end < 0) return;
    if (name) attrs[name] = decodeEntities(s.slice(i + 1, end));
    i = end + 1;
  }
}

/** Where the tag that starts at `from` ends, skipping any ">" inside a quoted attribute value. */
function tagEnd(text: string, from: number): number {
  let quote = "";
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

/**
 * The document as a flat stream of tokens. A caller that has seen enough can
 * simply stop reading: nothing past that point is parsed.
 */
export function* xmlTokens(text: string): Generator<XmlToken> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      yield { type: "text", text: decodeEntities(text.slice(i)) };
      return;
    }
    if (lt > i) yield { type: "text", text: decodeEntities(text.slice(i, lt)) };
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      if (end < 0) throw new XmlError("unterminated comment");
      i = end + 3;
    } else if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      if (end < 0) throw new XmlError("unterminated CDATA");
      yield { type: "text", text: text.slice(lt + 9, end) };
      i = end + 3;
    } else if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      if (end < 0) throw new XmlError("unterminated declaration");
      i = end + 2;
    } else if (text[lt + 1] === "!") {
      throw new XmlError("document type declarations are not allowed");
    } else {
      const gt = tagEnd(text, lt + 1);
      if (gt < 0) throw new XmlError("unterminated tag");
      if (text[lt + 1] === "/") {
        yield { type: "close", name: local(text.slice(lt + 2, gt).trim()) };
      } else {
        const selfClosing = text[gt - 1] === "/";
        const body = text.slice(lt + 1, selfClosing ? gt - 1 : gt);
        const space = body.search(/\s/);
        const name = space < 0 ? body : body.slice(0, space);
        if (!name) throw new XmlError("tag without a name");
        const attrs: Record<string, string> = {};
        if (space >= 0) readAttributes(body.slice(space), attrs);
        yield { type: "open", name: local(name), attrs, selfClosing };
      }
      i = gt + 1;
    }
  }
}

export interface XmlNode {
  /** Local name, without its namespace prefix. */
  name: string;
  /** Attributes as written, prefix included ("w:val", "r:id"). */
  attrs: Record<string, string>;
  children: (XmlNode | string)[];
}

const MAX_DEPTH = 256;

/** The whole document as a tree. Throws XmlError on malformed input or one that is unreasonably large or deep. */
export function parseXml(text: string, maxNodes = 500_000): XmlNode {
  const root: XmlNode = { name: "#document", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let nodes = 0;
  const close = (node: XmlNode) => {
    // Indentation between elements is not content; a lone space inside a text element is.
    if (node.children.some((c) => typeof c !== "string")) node.children = node.children.filter((c) => typeof c !== "string" || c.trim() !== "");
  };
  for (const token of xmlTokens(text)) {
    const top = stack[stack.length - 1];
    if (token.type === "text") {
      if (token.text) top.children.push(token.text);
    } else if (token.type === "open") {
      if (++nodes > maxNodes) throw new XmlError("document too large");
      const node: XmlNode = { name: token.name, attrs: token.attrs, children: [] };
      top.children.push(node);
      if (!token.selfClosing) {
        if (stack.length >= MAX_DEPTH) throw new XmlError("document nested too deeply");
        stack.push(node);
      }
    } else {
      if (stack.length < 2 || top.name !== token.name) throw new XmlError(`unexpected </${token.name}>`);
      close(top);
      stack.pop();
    }
  }
  if (stack.length !== 1) throw new XmlError("unclosed element");
  close(root);
  const first = root.children.find((c): c is XmlNode => typeof c !== "string");
  if (!first) throw new XmlError("empty document");
  return first;
}

/* ------------------------------------------------------------------ Helpers */

const isNode = (c: XmlNode | string): c is XmlNode => typeof c !== "string";

/** Direct children, optionally only those with a given local name. */
export function kids(node: XmlNode | undefined, name?: string): XmlNode[] {
  if (!node) return [];
  return node.children.filter((c): c is XmlNode => isNode(c) && (name === undefined || c.name === name));
}

export function kid(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c): c is XmlNode => isNode(c) && c.name === name);
}

/** Follow a path of child names: `dig(sp, "nvSpPr", "nvPr", "ph")`. */
export function dig(node: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let at = node;
  for (const name of path) at = kid(at, name);
  return at;
}

/** Every descendant with this local name, in document order. Does not look inside the matches themselves. */
export function descendants(node: XmlNode | undefined, name: string, out: XmlNode[] = []): XmlNode[] {
  if (!node) return out;
  for (const c of node.children) {
    if (!isNode(c)) continue;
    if (c.name === name) out.push(c);
    else descendants(c, name, out);
  }
  return out;
}

/** An attribute by local name, whatever its prefix: `attr(node, "val")` reads "w:val" or "val". */
export function attr(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  if (name in node.attrs) return node.attrs[name];
  for (const key in node.attrs) if (key.endsWith(`:${name}`)) return node.attrs[key];
  return undefined;
}

/** All the text inside a node. */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  let out = "";
  for (const c of node.children) out += isNode(c) ? textOf(c) : c;
  return out;
}
