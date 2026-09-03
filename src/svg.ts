import { IconForgeError } from "./errors.js";
import type { IconBinaryAsset, IconImageReference } from "./types.js";

export const MAX_ICON_SVG_BYTES = 1_500_000 as const;

const DECLARATION = /<!(?:DOCTYPE|ENTITY)\b/i;
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const FORBIDDEN_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "audio",
  "canvas",
  "embed",
  "feimage",
  "foreignobject",
  "iframe",
  "image",
  "img",
  "link",
  "meta",
  "object",
  "script",
  "set",
  "style",
  "video",
]);
const FORBIDDEN_ATTRIBUTES = new Set([
  "action",
  "formaction",
  "poster",
  "src",
  "srcset",
  "style",
  "xml:base",
]);

interface ParsedTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: Array<{ name: string; value: string }>;
}

function unsafeSvg(
  message = "SVG output contains active or external content.",
): never {
  throw new IconForgeError("UNSAFE_SVG", message);
}

function isValidXmlCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function assertValidXmlCharacters(value: string): void {
  for (const character of value) {
    if (!isValidXmlCharacter(character.codePointAt(0)!)) {
      unsafeSvg("SVG output contains an invalid character.");
    }
  }
}

function decodeXmlEntities(value: string): string {
  assertValidXmlCharacters(value);
  if (/&(?!(?:#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);)/i.test(value)) {
    unsafeSvg("SVG output contains an invalid entity.");
  }
  return value.replace(
    /&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/gi,
    (_match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      const codePoint = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      if (
        !Number.isSafeInteger(codePoint) ||
        !isValidXmlCharacter(codePoint)
      ) {
        unsafeSvg("SVG output contains an invalid character reference.");
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function findTagEnd(svg: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < svg.length; index += 1) {
    const character = svg[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "<") {
      unsafeSvg("SVG output contains malformed markup.");
    } else if (character === ">") {
      return index;
    }
  }
  unsafeSvg("SVG output contains an unterminated tag.");
}

function parseTag(raw: string): ParsedTag {
  if (raw.startsWith("<!") || raw.startsWith("<?")) unsafeSvg();
  const body = raw.slice(1, -1);
  if (body.startsWith("/")) {
    const closing = body.slice(1).trim();
    const name = closing.match(XML_NAME)?.[0];
    if (!name || closing.slice(name.length).trim()) {
      unsafeSvg("SVG output contains malformed closing markup.");
    }
    return { name, closing: true, selfClosing: false, attributes: [] };
  }

  const name = body.match(XML_NAME)?.[0];
  if (!name) unsafeSvg("SVG output contains malformed opening markup.");
  const attributes: ParsedTag["attributes"] = [];
  const names = new Set<string>();
  let cursor = name.length;
  let selfClosing = false;
  while (cursor < body.length) {
    const whitespaceStart = cursor;
    while (/\s/.test(body[cursor] ?? "")) cursor += 1;
    const hadWhitespace = cursor > whitespaceStart;
    if (cursor >= body.length) break;
    if (body[cursor] === "/") {
      if (body.slice(cursor + 1).trim()) {
        unsafeSvg("SVG output contains malformed self-closing markup.");
      }
      selfClosing = true;
      break;
    }
    if (!hadWhitespace)
      unsafeSvg("SVG attributes must be whitespace-separated.");
    const attributeName = body.slice(cursor).match(XML_NAME)?.[0];
    if (!attributeName) unsafeSvg("SVG output contains a malformed attribute.");
    cursor += attributeName.length;
    while (/\s/.test(body[cursor] ?? "")) cursor += 1;
    if (body[cursor] !== "=")
      unsafeSvg("SVG attributes must have quoted values.");
    cursor += 1;
    while (/\s/.test(body[cursor] ?? "")) cursor += 1;
    const quote = body[cursor];
    if (quote !== '"' && quote !== "'") {
      unsafeSvg("SVG attributes must have quoted values.");
    }
    cursor += 1;
    const valueStart = cursor;
    while (cursor < body.length && body[cursor] !== quote) cursor += 1;
    if (cursor >= body.length)
      unsafeSvg("SVG output contains an unterminated attribute.");
    const value = body.slice(valueStart, cursor);
    cursor += 1;
    const normalizedName = attributeName.toLowerCase();
    if (names.has(normalizedName))
      unsafeSvg("SVG output contains duplicate attributes.");
    names.add(normalizedName);
    attributes.push({ name: attributeName, value });
  }
  return { name, closing: false, selfClosing, attributes };
}

function assertSafeAttribute(name: string, rawValue: string): void {
  const normalizedName = name.toLowerCase();
  const localName = normalizedName.split(":").at(-1) ?? normalizedName;
  if (/^on[a-z]/i.test(localName) || FORBIDDEN_ATTRIBUTES.has(normalizedName)) {
    unsafeSvg();
  }
  const value = decodeXmlEntities(rawValue);
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) unsafeSvg();
  if (value.includes("\\") || value.includes("/*")) unsafeSvg();

  if (normalizedName === "xmlns" || normalizedName.startsWith("xmlns:")) {
    if (
      value !== "http://www.w3.org/2000/svg" &&
      value !== "http://www.w3.org/1999/xlink"
    ) {
      unsafeSvg("SVG output contains an untrusted namespace.");
    }
    return;
  }
  if (localName === "href") {
    if (!/^#[A-Za-z_][\w:.-]*$/.test(value)) {
      unsafeSvg("SVG links must target a local fragment.");
    }
    return;
  }

  const withoutLocalUrls = value.replace(
    /url\s*\(\s*(["']?)#[A-Za-z_][\w:.-]*\1\s*\)/gi,
    "",
  );
  if (
    /url\s*\(/i.test(withoutLocalUrls) ||
    /@import\b/i.test(value) ||
    /(?:javascript|vbscript|data|file)\s*:/i.test(value) ||
    /(?:https?:)?\/\//i.test(value)
  ) {
    unsafeSvg();
  }
}

function validateSvgMarkup(svg: string): void {
  assertValidXmlCharacters(svg);
  const stack: string[] = [];
  let cursor = 0;
  let sawRoot = false;
  let closedRoot = false;
  while (cursor < svg.length) {
    const tagStart = svg.indexOf("<", cursor);
    if (tagStart === -1) {
      if (closedRoot && svg.slice(cursor).trim())
        unsafeSvg("SVG output has trailing content.");
      break;
    }
    decodeXmlEntities(svg.slice(cursor, tagStart));
    if (
      (stack.length === 0 || closedRoot) &&
      svg.slice(cursor, tagStart).trim()
    ) {
      unsafeSvg("SVG output has content outside its root element.");
    }
    const tagEnd = findTagEnd(svg, tagStart);
    const tag = parseTag(svg.slice(tagStart, tagEnd + 1));
    const normalizedName = tag.name.toLowerCase();
    const localName = normalizedName.split(":").at(-1) ?? normalizedName;
    if (tag.closing) {
      if (stack.pop() !== normalizedName)
        unsafeSvg("SVG element nesting is invalid.");
      if (stack.length === 0) closedRoot = true;
    } else {
      if (closedRoot) unsafeSvg("SVG output has more than one root element.");
      if (!sawRoot) {
        if (normalizedName !== "svg")
          unsafeSvg("Vectorizer output is not an SVG document.");
        sawRoot = true;
      }
      if (FORBIDDEN_ELEMENTS.has(localName)) unsafeSvg();
      for (const attribute of tag.attributes) {
        assertSafeAttribute(attribute.name, attribute.value);
      }
      if (!tag.selfClosing) stack.push(normalizedName);
      else if (stack.length === 0) closedRoot = true;
    }
    cursor = tagEnd + 1;
  }
  if (!sawRoot || !closedRoot || stack.length > 0) {
    unsafeSvg("Vectorizer output is not a complete SVG.");
  }
}

export function bytesToDataUrl(asset: IconBinaryAsset): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < asset.bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...asset.bytes.subarray(
        offset,
        Math.min(offset + chunkSize, asset.bytes.length),
      ),
    );
  }
  return `data:${asset.mimeType};base64,${btoa(binary)}`;
}

export function decodeBase64Asset(
  value: string,
  mimeType: string,
  maxBytes = 20_000_000,
): IconBinaryAsset {
  const estimatedBytes = Math.floor((value.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      "Provider image exceeded the byte limit.",
    );
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (bytes.byteLength > maxBytes) {
      throw new IconForgeError(
        "PROVIDER_ERROR",
        "Provider image exceeded the byte limit.",
      );
    }
    return { bytes, mimeType };
  } catch (error) {
    if (error instanceof IconForgeError) throw error;
    throw new IconForgeError(
      "PROVIDER_ERROR",
      "Provider returned invalid base64 image data.",
    );
  }
}

function addViewBox(svg: string): string {
  const opening = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!opening) {
    throw new IconForgeError(
      "UNSAFE_SVG",
      "Vectorizer output is not an SVG document.",
    );
  }
  if (/\sviewBox\s*=/i.test(opening)) return svg;
  const width = opening.match(
    /\swidth\s*=\s*["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i,
  )?.[1];
  const height = opening.match(
    /\sheight\s*=\s*["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i,
  )?.[1];
  if (!width || !height) {
    throw new IconForgeError(
      "UNSAFE_SVG",
      "SVG output must include a viewBox or numeric width and height.",
    );
  }
  return svg.replace(
    opening,
    opening.replace(/>$/, ` viewBox="0 0 ${width} ${height}">`),
  );
}

/**
 * Strict sanitizer for generated SVG. It intentionally rejects embedded raster
 * images, scripts, remote resources, and CSS rather than trying to repair them.
 */
export function sanitizeIconSvg(input: string): string {
  if (new TextEncoder().encode(input).byteLength > MAX_ICON_SVG_BYTES) {
    throw new IconForgeError(
      "UNSAFE_SVG",
      "SVG output exceeded the 1.5 MB limit.",
    );
  }
  assertValidXmlCharacters(input);
  let svg = input
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (DECLARATION.test(svg)) unsafeSvg();
  validateSvgMarkup(svg);
  svg = addViewBox(svg);
  svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const clean = attributes
      .replace(
        /\s(?:width|height|focusable|aria-hidden)\s*=\s*["'][^"']*["']/gi,
        "",
      )
      .trim();
    return `<svg${clean ? ` ${clean}` : ""} width="100%" height="100%" focusable="false" aria-hidden="true">`;
  });
  return svg;
}

export function svgAssetToText(asset: IconBinaryAsset): string {
  if (
    asset.mimeType.split(";", 1)[0]?.trim().toLowerCase() !== "image/svg+xml"
  ) {
    throw new IconForgeError(
      "UNSAFE_SVG",
      "Vectorizer did not return SVG content.",
    );
  }
  return sanitizeIconSvg(new TextDecoder().decode(asset.bytes));
}

export function assetAsReference(asset: IconBinaryAsset): IconImageReference {
  return {
    url: asset.sourceUrl ?? bytesToDataUrl(asset),
    mimeType: asset.mimeType,
  };
}
