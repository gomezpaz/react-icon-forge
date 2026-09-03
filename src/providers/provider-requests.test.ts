import { describe, expect, it } from "vitest";
import { buildFalImageRequest } from "./fal.js";
import { buildOpenRouterImageRequest } from "./openrouter.js";
import { trustedHttpsUrl } from "./http.js";

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
    expect(() => trustedHttpsUrl("https://127.0.0.1/file.svg", "provider")).toThrow(
      "private URL",
    );
    expect(() => trustedHttpsUrl("https://cdn.example.com/file.svg", "provider")).not.toThrow();
  });
});
