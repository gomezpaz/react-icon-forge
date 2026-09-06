import { describe, expect, it, vi } from "vitest";
import { buildFalImageRequest } from "./fal.js";
import { buildOpenRouterImageRequest } from "./openrouter.js";
import {
  assertOpenRouterModelId,
  fetchWithDeadline,
  readBytesWithinLimit,
  readJson,
  trustedHttpsUrl,
} from "./http.js";

describe("provider request builders", () => {
  it("routes fal references through image_urls", () => {
    expect(
      buildFalImageRequest({
        prompt: "icon",
        references: [{ url: "data:image/png;base64,AA==" }],
        quality: "medium",
      }),
    ).toMatchObject({
      image_size: "auto",
      image_urls: ["data:image/png;base64,AA=="],
      num_images: 1,
      output_format: "png",
    });
  });

  it("normalizes auto quality for fal's edit endpoint", () => {
    expect(
      buildFalImageRequest({
        prompt: "icon",
        references: [{ url: "data:image/png;base64,AA==" }],
        quality: "auto",
      }),
    ).toMatchObject({ quality: "medium", image_size: "auto" });
    expect(
      buildFalImageRequest({ prompt: "icon", references: [], quality: "auto" }),
    ).toMatchObject({ quality: "auto", image_size: "square_hd" });
  });

  it("uses OpenRouter's dedicated image reference shape", () => {
    expect(
      buildOpenRouterImageRequest({
        model: "openai/gpt-image-1",
        prompt: "icon",
        references: [{ url: "https://example.com/reference.png" }],
        quality: "high",
      }),
    ).toMatchObject({
      model: "openai/gpt-image-1",
      aspect_ratio: "1:1",
      input_references: [
        {
          type: "image_url",
          image_url: { url: "https://example.com/reference.png" },
        },
      ],
    });
  });

  it("rejects provider-controlled private download URLs", () => {
    expect(() =>
      trustedHttpsUrl("https://127.0.0.1/file.svg", "provider"),
    ).toThrow("private URL");
    expect(() =>
      trustedHttpsUrl("https://cdn.example.com/file.svg", "provider"),
    ).not.toThrow();
    expect(() =>
      trustedHttpsUrl("https://localhost./file.svg", "provider"),
    ).toThrow("private URL");
    expect(() =>
      trustedHttpsUrl("https://[::ffff:127.0.0.1]/file.svg", "provider"),
    ).toThrow("private URL");
  });

  it("permits OpenRouter routing suffixes", () => {
    expect(assertOpenRouterModelId("openai/gpt-image-1:free")).toBe(
      "openai/gpt-image-1:free",
    );
  });

  it("does not call fetch when the request is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchWithDeadline(
        fetchImpl,
        "https://example.com",
        {},
        {
          timeoutMs: 100,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow("cancelled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON before buffering it", async () => {
    const response = new Response('{"ok":true}', {
      headers: { "content-length": "11" },
    });
    await expect(readJson(response, "fixture", 5)).rejects.toThrow(
      "byte limit",
    );
  });

  it("stops an oversized binary stream without relying on Content-Length", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
    );
    expect(response.headers.has("content-length")).toBe(false);
    await expect(
      readBytesWithinLimit(response, "fixture image", 5),
    ).rejects.toThrow("byte limit");
  });

  it("does not preallocate an untrusted large Content-Length", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "20000000" },
    });

    const bytes = await readBytesWithinLimit(
      response,
      "fixture image",
      20_000_000,
    );

    expect([...bytes]).toEqual([1, 2, 3]);
    expect(bytes.buffer.byteLength).toBeLessThanOrEqual(64 * 1024);
  });

  it("keeps the deadline active when headers arrive but the body stalls", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            pull: () => new Promise<void>(() => undefined),
          }),
        ),
    );
    const response = await fetchWithDeadline(
      fetchImpl,
      "https://example.com",
      {},
      {
        timeoutMs: 10,
      },
    );
    await expect(readJson(response, "stalled fixture")).rejects.toThrow(
      "timed out",
    );
  });

  it("keeps caller cancellation active while a response body stalls", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            pull: () => new Promise<void>(() => undefined),
          }),
        ),
    );
    const response = await fetchWithDeadline(
      fetchImpl,
      "https://example.com",
      {},
      {
        timeoutMs: 1_000,
        signal: controller.signal,
      },
    );
    const body = readBytesWithinLimit(response, "stalled fixture", 10);
    controller.abort();
    await expect(body).rejects.toThrow("cancelled");
  });
});
