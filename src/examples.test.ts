import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sanitizeIconSvg } from "./svg.js";

describe("README vector examples", () => {
  for (const id of ["fix-checkout", "launch-website", "schedule-campaign"]) {
    it(`${id} stays vector-only without the traced full-canvas backdrop`, () => {
      const svg = readFileSync(new URL(`../examples/generated/${id}.svg`, import.meta.url), "utf8");
      expect(() => sanitizeIconSvg(svg)).not.toThrow();
      expect(svg).toContain("<path");
      expect(svg).not.toMatch(/<image\b|data:image|<rect\b/i);
      expect(svg).not.toContain("M0 0 C337.92 0 675.84 0 1024 0 C1024 337.92");
    });
  }
});
