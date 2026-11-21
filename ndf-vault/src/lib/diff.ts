/**
 * What changed between two versions of a text.
 *
 * The texts are cut into words (or into lines when they are very long) and
 * compared with Myers' algorithm, the one behind `diff`: it finds the shortest
 * list of removals and additions that turns the first text into the second.
 */

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

export interface DiffResult {
  parts: DiffPart[];
  /** Words added and removed. */
  added: number;
  removed: number;
  /** "words" for a fine comparison; "lines" when the texts were too long for one. */
  unit: "words" | "lines";
  /** True when the two versions share so little that listing the changes means nothing: they are shown whole. */
  rewritten: boolean;
}

/** Beyond this many pieces on one side, the comparison is made line by line. */
const MAX_WORD_TOKENS = 12_000;
const MAX_LINE_TOKENS = 20_000;
/** The most edits the search follows before calling the text rewritten. */
const MAX_EDITS = 6000;

/** Words and the spaces or punctuation between them, each as its own piece: joined back, they give the text exactly. */
export function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}_’'-]+|\s+|[^\s\p{L}\p{N}_’'-]/gu) ?? [];
}

const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const isWord = (token: string) => /[\p{L}\p{N}]/u.test(token);

/** Myers' shortest edit script on two arrays. Returns null when more than `limit` edits would be needed. */
function myers(a: string[], b: string[], limit: number): DiffPart[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, limit);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;

  // Walk the trace backwards to recover the path, then read it forwards.
  const steps: DiffPart[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = prev[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      steps.push({ type: "same", text: a[--x] });
      y--;
    }
    if (x === prevX) steps.push({ type: "added", text: b[--y] });
    else steps.push({ type: "removed", text: a[--x] });
  }
  while (x > 0 && y > 0) {
    steps.push({ type: "same", text: a[--x] });
    y--;
  }
  return steps.reverse();
}

/** Join neighbours of the same kind, and put each removal before the addition that replaces it. */
function tidy(steps: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const step of steps) {
    const last = out[out.length - 1];
    if (last && last.type === step.type) last.text += step.text;
    else out.push({ ...step });
  }
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].type === "added" && out[i + 1].type === "removed") [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

export function diffText(before: string, after: string): DiffResult {
  let a = words(before);
  let b = words(after);
  let unit: DiffResult["unit"] = "words";
  if (a.length > MAX_WORD_TOKENS || b.length > MAX_WORD_TOKENS) {
    a = lines(before).slice(0, MAX_LINE_TOKENS);
    b = lines(after).slice(0, MAX_LINE_TOKENS);
    unit = "lines";
  }
  const count = (text: string) => words(text).filter(isWord).length;
  const steps = myers(a, b, MAX_EDITS);
  if (!steps) {
    const parts: DiffPart[] = [
      { type: "removed", text: before },
      { type: "added", text: after },
    ];
    return { parts: parts.filter((p) => p.text), added: count(after), removed: count(before), unit, rewritten: true };
  }
  const parts = tidy(steps);
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.type === "added") added += count(p.text);
    else if (p.type === "removed") removed += count(p.text);
  }
  return { parts, added, removed, unit, rewritten: false };
}

/** A long unchanged stretch, cut down to what surrounds the changes. */
export type ViewPart = DiffPart | { type: "gap"; hidden: number };

/**
 * Keep the changes and a little of the text around each; fold the long
 * unchanged stretches in between, saying how much was folded.
 */
export function foldUnchanged(parts: DiffPart[], context = 160): ViewPart[] {
  const out: ViewPart[] = [];
  parts.forEach((part, i) => {
    if (part.type !== "same" || part.text.length <= context * 2 + 80) return void out.push(part);
    const first = i === 0;
    const last = i === parts.length - 1;
    const head = first ? "" : part.text.slice(0, context);
    const tail = last ? "" : part.text.slice(part.text.length - context);
    if (head) out.push({ type: "same", text: head });
    out.push({ type: "gap", hidden: part.text.length - head.length - tail.length });
    if (tail) out.push({ type: "same", text: tail });
  });
  return out;
}
