import { describe, expect, it, vi } from "vitest";
import { createIconForge } from "./forge.js";
import { IconForgeError } from "./errors.js";
import { MAX_ICON_EDITS, type IconImageProvider, type IconVectorizer } from "./types.js";

const raster = new TextEncoder().encode("fake-png");
const svg = new TextEncoder().encode(
  '<svg viewBox="0 0 32 32"><path d="M0 0h32v32z"/></svg>',
);

function fixtures() {
  const provider: IconImageProvider = {
    id: "fixture",
    defaultModel: "fixture/image-v1",
    generate: vi.fn(async () => ({
      asset: { bytes: raster, mimeType: "image/png" },
      provider: "fixture",
      model: "fixture/image-v1",
      requestId: "request-1",
      usage: { costUsd: 0.04 },
    })),
  };
  const vectorizer: IconVectorizer = {
    id: "fixture-vectorizer",
    vectorize: vi.fn(async () => ({
      asset: { bytes: svg, mimeType: "image/svg+xml" },
      provider: "fixture",
      model: "fixture/vector-v1",
      usage: { costUsd: 0.005 },
    })),
  };
  return { provider, vectorizer };
}

describe("createIconForge", () => {
  it("generates and vectorizes through configured adapters", async () => {
    const { provider, vectorizer } = fixtures();
    const forge = createIconForge({
      providers: [provider],
      defaultProvider: "fixture",
      vectorizer,
      idFactory: () => "icon-1",
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(125),
    });
    const result = await forge.generate({ description: "A compass" });
    expect(result.id).toBe("icon-1");
    expect(result.durationMs).toBe(25);
    expect(result.svg).toContain("<path");
    expect(result.usage?.costUsd).toBeCloseTo(0.045);
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(vectorizer.vectorize).toHaveBeenCalledOnce();
  });

  it("keeps editing disabled unless explicitly enabled", () => {
    const { provider, vectorizer } = fixtures();
    const forge = createIconForge({
      providers: [provider],
      defaultProvider: "fixture",
      vectorizer,
    });
    expect(() =>
      forge.edit({
        description: "A compass",
        source: { url: "https://example.com/source.png" },
        suggestion: "Point north",
        editsUsed: 0,
      }),
    ).toThrowError(IconForgeError);
  });

  it("enforces the immutable three-edit ceiling", () => {
    const { provider, vectorizer } = fixtures();
    const forge = createIconForge({
      providers: [provider],
      defaultProvider: "fixture",
      vectorizer,
      editsEnabled: true,
    });
    expect(() =>
      forge.edit({
        description: "A compass",
        source: { url: "https://example.com/source.png" },
        suggestion: "Point north",
        editsUsed: MAX_ICON_EDITS,
      }),
    ).toThrow("used all 3 edit slots");
  });
});
