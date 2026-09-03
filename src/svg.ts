import { IconForgeError } from "./errors.js";
import type { IconBinaryAsset, IconImageReference } from "./types.js";

export const MAX_ICON_SVG_BYTES = 1_500_000 as const;

const FORBIDDEN_ELEMENT =
  /<\s*\/?\s*(?:script|foreignObject|iframe|object|embed|audio|video|canvas|image|style|link|meta)\b/i;
const EVENT_HANDLER = /\s(?:on[a-z][\w:.-]*)\s*=/i;
const STYLE_ATTRIBUTE = /\sstyle\s*=/i;
const EXTERNAL_CSS = /(?:javascript\s*:|@import\b|url\s*\(\s*["']?\s*(?:https?:|\/\/|data:))/i;
const DECLARATION = /<!(?:DOCTYPE|ENTITY)\b/i;

export function bytesToDataUrl(asset: IconBinaryAsset): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < asset.bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...asset.bytes.subarray(offset, Math.min(offset + chunkSize, asset.bytes.length)),
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
    throw new IconForgeError("PROVIDER_ERROR", "Provider image exceeded the byte limit.");
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (bytes.byteLength > maxBytes) {
      throw new IconForgeError("PROVIDER_ERROR", "Provider image exceeded the byte limit.");
    }
    return { bytes, mimeType };
  } catch (error) {
    if (error instanceof IconForgeError) throw error;
    throw new IconForgeError("PROVIDER_ERROR", "Provider returned invalid base64 image data.");
  }
}

function addViewBox(svg: string): string {
  const opening = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!opening) {
    throw new IconForgeError("UNSAFE_SVG", "Vectorizer output is not an SVG document.");
  }
  if (/\sviewBox\s*=/i.test(opening)) return svg;
  const width = opening.match(/\swidth\s*=\s*["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1];
  const height = opening.match(/\sheight\s*=\s*["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/i)?.[1];
  if (!width || !height) {
    throw new IconForgeError(
      "UNSAFE_SVG",
      "SVG output must include a viewBox or numeric width and height.",
    );
  }
  return svg.replace(opening, opening.replace(/>$/, ` viewBox="0 0 ${width} ${height}">`));
}

/**
 * Strict sanitizer for generated SVG. It intentionally rejects embedded raster
 * images, scripts, remote resources, and CSS rather than trying to repair them.
 */
export function sanitizeIconSvg(input: string): string {
  if (new TextEncoder().encode(input).byteLength > MAX_ICON_SVG_BYTES) {
    throw new IconForgeError("UNSAFE_SVG", "SVG output exceeded the 1.5 MB limit.");
  }
  let svg = input
    .replace(/^\s*<\?xml[^>]*>\s*/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new IconForgeError("UNSAFE_SVG", "Vectorizer output is not a complete SVG.");
  }
  if (
    DECLARATION.test(svg) ||
    FORBIDDEN_ELEMENT.test(svg) ||
    EVENT_HANDLER.test(svg) ||
    STYLE_ATTRIBUTE.test(svg) ||
    EXTERNAL_CSS.test(svg)
  ) {
    throw new IconForgeError("UNSAFE_SVG", "SVG output contains active or external content.");
  }
  for (const match of svg.matchAll(
    /\s(?:href|xlink:href)\s*=\s*["']([^"']+)["']/gi,
  )) {
    if (!match[1]?.startsWith("#")) {
      throw new IconForgeError("UNSAFE_SVG", "SVG links must target a local fragment.");
    }
  }
  svg = addViewBox(svg);
  svg = svg.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const clean = attributes
      .replace(/\s(?:width|height|focusable|aria-hidden)\s*=\s*["'][^"']*["']/gi, "")
      .trim();
    return `<svg${clean ? ` ${clean}` : ""} width="100%" height="100%" focusable="false" aria-hidden="true">`;
  });
  return svg;
}

export function svgAssetToText(asset: IconBinaryAsset): string {
  if (asset.mimeType.toLowerCase() !== "image/svg+xml") {
    throw new IconForgeError("UNSAFE_SVG", "Vectorizer did not return SVG content.");
  }
  return sanitizeIconSvg(new TextDecoder().decode(asset.bytes));
}

export function assetAsReference(asset: IconBinaryAsset): IconImageReference {
  return { url: asset.sourceUrl ?? bytesToDataUrl(asset), mimeType: asset.mimeType };
}
