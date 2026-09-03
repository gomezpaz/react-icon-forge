import { describe, expect, it } from "vitest";
import { IconForgeError } from "./errors.js";
import {
  compileIconEditPrompt,
  compileIconPrompt,
  normalizeIconReferences,
} from "./prompt.js";

describe("icon prompt compiler", () => {
  it("compiles a versioned, vector-oriented prompt", () => {
    const prompt = compileIconPrompt({
      description: "A bakery door",
      style: "isometric",
      context: {
        text: "Navy and apricot",
        images: [{ url: "data:image/png;base64,AA==" }],
      },
    });
    expect(prompt.profileVersion).toBe(1);
    expect(prompt.referenceCount).toBe(1);
    expect(prompt.text).toContain("A bakery door");
    expect(prompt.text).toContain("clean isometric projection");
    expect(prompt.text).toContain("automatic SVG tracing");
  });

  it("rejects an unsafe image reference and a fifth reference", () => {
    expect(() =>
      normalizeIconReferences([{ url: "http://internal.test/file.png" }]),
    ).toThrow(IconForgeError);
    expect(() =>
      normalizeIconReferences(
        Array.from({ length: 5 }, () => ({ url: "https://example.com/icon.png" })),
      ),
    ).toThrow("at most 4");
    expect(() => normalizeIconReferences([{ url: "https://" }])).toThrow(
      IconForgeError,
    );
  });

  it("rejects empty and inherited style keys while allowing 2,000 custom characters", () => {
    expect(() => compileIconPrompt({ description: "A compass", style: "" as never })).toThrow(
      'Unknown icon style ""',
    );
    expect(() =>
      compileIconPrompt({ description: "A compass", style: "__proto__" as never }),
    ).toThrow('Unknown icon style "__proto__"');
    expect(() =>
      compileIconPrompt({
        description: "A compass",
        style: { key: "custom", instructions: "x".repeat(2_000) },
      }),
    ).not.toThrow();
    expect(() =>
      compileIconPrompt({
        description: "A compass",
        style: { key: "custom", instructions: "x".repeat(2_001) },
      }),
    ).toThrow("2,000");
  });

  it("makes edit intent explicit without discarding the source", () => {
    const prompt = compileIconEditPrompt({
      description: "A bakery door",
      source: { url: "https://example.com/source.png" },
      suggestion: "Make the awning blue",
      editsUsed: 0,
    });
    expect(prompt.mode).toBe("edit");
    expect(prompt.referenceCount).toBe(1);
    expect(prompt.text).toContain("Preserve the source icon's identity");
    expect(prompt.text).toContain("Make the awning blue");
  });
});
