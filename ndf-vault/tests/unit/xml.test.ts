import { describe, expect, it } from "vitest";
import { attr, decodeEntities, descendants, dig, kid, kids, parseXml, textOf, XmlError, xmlTokens } from "@/lib/xml";

describe("parsing", () => {
  it("reads elements, attributes and text, by local name", () => {
    const root = parseXml(`<?xml version="1.0"?>\n<w:document xmlns:w="urn:w"><w:body><w:p w:id='7'><w:r><w:t xml:space="preserve">Bonjour </w:t></w:r><w:r><w:t>le monde</w:t></w:r></w:p></w:body></w:document>`);
    expect(root.name).toBe("document");
    const p = dig(root, "body", "p");
    expect(attr(p, "id")).toBe("7");
    expect(p?.attrs["w:id"]).toBe("7");
    expect(textOf(p)).toBe("Bonjour le monde");
    expect(kids(p, "r")).toHaveLength(2);
    expect(kid(root, "absent")).toBeUndefined();
    expect(descendants(root, "t").map(textOf)).toEqual(["Bonjour ", "le monde"]);
  });

  it("keeps a lone space inside a text element but drops indentation between elements", () => {
    const root = parseXml("<a>\n  <t> </t>\n  <b/>\n</a>");
    expect(root.children).toHaveLength(2);
    expect(textOf(kid(root, "t"))).toBe(" ");
  });

  it("decodes the built-in entities and character references, in text and in attributes", () => {
    const root = parseXml(`<a title="R&amp;D &quot;x&quot;">1 &lt; 2 &amp;&amp; 3 &gt; 2 &#233;&#xE9; &apos;ok&apos;</a>`);
    expect(root.attrs.title).toBe('R&D "x"');
    expect(textOf(root)).toBe("1 < 2 && 3 > 2 éé 'ok'");
  });

  it("leaves unknown entities as they are and drops control characters", () => {
    expect(decodeEntities("&nbsp;&bogus; a&#0;b&#27;c&#xD800;d")).toBe("&nbsp;&bogus; abcd");
  });

  it("reads CDATA literally and skips comments", () => {
    expect(textOf(parseXml("<a><!-- <b>non</b> --><![CDATA[<i>1 & 2</i>]]></a>"))).toBe("<i>1 & 2</i>");
  });

  it("does not end a tag at a > inside an attribute value", () => {
    const root = parseXml(`<a><b note="x > y" other='<z>'/>fin</a>`);
    expect(kid(root, "b")?.attrs).toEqual({ note: "x > y", other: "<z>" });
    expect(textOf(root)).toBe("fin");
  });
});

describe("refusing dangerous or broken documents", () => {
  const fails = (xml: string) => {
    try {
      parseXml(xml);
    } catch (e) {
      return e instanceof XmlError;
    }
    return false;
  };

  it("refuses any document type declaration, so entities cannot be defined", () => {
    // External entity (XXE) and exponential expansion ("billion laughs") both need a DOCTYPE.
    expect(fails(`<?xml version="1.0"?><!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>`)).toBe(true);
    expect(fails(`<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><lolz>&lol2;</lolz>`)).toBe(true);
  });

  it("refuses malformed input", () => {
    expect(fails("<a><b></a></b>")).toBe(true);
    expect(fails("<a><b>")).toBe(true);
    expect(fails("</a>")).toBe(true);
    expect(fails("<a")).toBe(true);
    expect(fails("<a><!-- sans fin</a>")).toBe(true);
    expect(fails("   ")).toBe(true);
  });

  it("refuses documents nested too deeply or with too many elements", () => {
    expect(fails("<a>".repeat(400) + "</a>".repeat(400))).toBe(true);
    expect(fails(`<a>${"<b/>".repeat(50)}</a>`)).toBe(false);
    expect(() => parseXml(`<a>${"<b/>".repeat(50)}</a>`, 20)).toThrow(XmlError);
  });
});

describe("hostile input", () => {
  const timed = (work: () => void) => {
    const start = performance.now();
    work();
    return performance.now() - start;
  };

  it("reads a tag stuffed with junk in linear time", () => {
    // With a naive pattern each of these takes minutes; a single pass takes milliseconds.
    const junk = "a".repeat(400_000);
    expect(timed(() => parseXml(`<x ${junk}/>`))).toBeLessThan(1500);
    expect(timed(() => parseXml(`<x ${"a ".repeat(200_000)}/>`))).toBeLessThan(1500);
    expect(timed(() => parseXml(`<x ${"= ".repeat(200_000)}/>`))).toBeLessThan(1500);
    expect(timed(() => parseXml(`<x>&${junk}</x>`))).toBeLessThan(1500);
    expect(timed(() => parseXml(`<x>${"&a".repeat(200_000)}</x>`))).toBeLessThan(1500);
  });

  it("still reads the attributes around the junk", () => {
    expect(parseXml(`<x bare a = "1" other='2' = "ignored" b="3" novalue= />`).attrs).toEqual({ a: "1", other: "2", b: "3" });
    // A quote that never closes swallows the end of the tag: the document is refused, not guessed at.
    expect(() => parseXml(`<x a="1" b="oops/>`)).toThrow(XmlError);
    expect(parseXml(`<x a="1"b="2"/>`).attrs).toEqual({ a: "1", b: "2" });
    expect(parseXml(`<x   />`).attrs).toEqual({});
  });
});

describe("streaming", () => {
  it("lets a reader stop early without parsing the rest", () => {
    // Everything after the second row is broken; a reader that stops in time never sees it.
    const xml = `<sheet><row>1</row><row>2</row><row><<<`;
    const seen: string[] = [];
    for (const t of xmlTokens(xml)) {
      if (t.type === "text") seen.push(t.text);
      if (seen.length === 2) break;
    }
    expect(seen).toEqual(["1", "2"]);
  });
});
