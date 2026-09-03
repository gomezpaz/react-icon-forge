import { describe, expect, it } from "vitest";
import { sanitizeIconSvg, svgAssetToText } from "./svg.js";

describe("SVG sanitizer", () => {
  it("normalizes a safe vector for React rendering", () => {
    const result = sanitizeIconSvg(
      '<svg width="64" height="64"><path fill="#123" d="M0 0h64v64z"/></svg>',
    );
    expect(result).toContain('viewBox="0 0 64 64"');
    expect(result).toContain('width="100%"');
    expect(result).not.toContain('width="64"');
  });

  it.each([
    '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 1 1"><image href="https://example.com/x.png"/></svg>',
    '<svg viewBox="0 0 1 1"><path onclick="alert(1)"/></svg>',
    '<svg viewBox="0 0 1 1"><path style="fill:red"/></svg>',
    '<svg viewBox="0 0 1 1"><path style="fill:url(https://x.test/a)"/></svg>',
  ])("rejects active or external content", (svg) => {
    expect(() => sanitizeIconSvg(svg)).toThrow("active or external content");
  });

  it.each([
    '<svg viewBox="0 0 1 1"><img src="https://example.com/x.png"></img></svg>',
    '<svg viewBox="0 0 1 1"/onload="alert(1)"></svg>',
    '<svg viewBox="0 0 1 1"><path fill="\\75rl(https://example.com/x)"/></svg>',
    '<svg viewBox="0 0 1 1"><use href=https://example.com/x /></svg>',
    '<svg viewBox="0 0 1 1"><use href="javascript:alert(1)"/></svg>',
  ])("rejects malformed and parser-confusing SVG", (svg) => {
    expect(() => sanitizeIconSvg(svg)).toThrow();
  });

  it("accepts a parameterized SVG content type", () => {
    expect(
      svgAssetToText({
        bytes: new TextEncoder().encode('<svg viewBox="0 0 1 1"></svg>'),
        mimeType: "image/svg+xml; charset=utf-8",
      }),
    ).toContain("<svg");
  });

  it.each(["&#1;", "&#55296;", "&#xDFFF;", "&#xFFFE;"])(
    "rejects XML-invalid character references (%s)",
    (entity) => {
      expect(() =>
        sanitizeIconSvg(`<svg viewBox="0 0 1 1"><text>${entity}</text></svg>`),
      ).toThrow("invalid character reference");
    },
  );

  it("rejects raw XML-invalid control characters", () => {
    expect(() =>
      sanitizeIconSvg('<svg viewBox="0 0 1 1"><text>\u0001</text></svg>'),
    ).toThrow("invalid character");
  });

  it.each([
    '<svg viewBox="0 0 1 1"><path\u000bfill="#000"/></svg>',
    '<svg viewBox="0 0 1 1"/>\u000c',
  ])("rejects XML-invalid characters anywhere in the document", (svg) => {
    expect(() => sanitizeIconSvg(svg)).toThrow("invalid character");
  });
});
