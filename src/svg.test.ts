import { describe, expect, it } from "vitest";
import { sanitizeIconSvg } from "./svg.js";

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
});
