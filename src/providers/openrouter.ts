import { IconForgeError } from "../errors.js";
import { decodeBase64Asset } from "../svg.js";
import type {
  IconImageProvider,
  IconProviderRequest,
  IconProviderResult,
  IconQuality,
} from "../types.js";
import { assertOpenRouterModelId, fetchWithDeadline, readJson } from "./http.js";

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
  id?: string;
  model?: string;
}

export interface OpenRouterProviderOptions {
  apiKey: string;
  defaultModel: string;
  appName?: string;
  siteUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export function buildOpenRouterImageRequest(args: {
  model: string;
  prompt: string;
  references: readonly { url: string }[];
  quality: IconQuality;
}): Record<string, unknown> {
  return {
    model: args.model,
    prompt: args.prompt,
    n: 1,
    aspect_ratio: "1:1",
    quality: args.quality,
    output_format: "png",
    ...(args.references.length > 0
      ? {
          input_references: args.references.map((reference) => ({
            type: "image_url",
            image_url: { url: reference.url },
          })),
        }
      : {}),
  };
}

export function createOpenRouterProvider(
  options: OpenRouterProviderOptions,
): IconImageProvider {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new IconForgeError("INVALID_INPUT", "OpenRouter API key is required.");
  }
  const defaultModel = assertOpenRouterModelId(options.defaultModel);
  const fetchImpl = options.fetch ?? fetch;
  return {
    id: "openrouter",
    defaultModel,
    async generate(request: IconProviderRequest): Promise<IconProviderResult> {
      const model = assertOpenRouterModelId(request.model ?? defaultModel);
      const response = await fetchWithDeadline(
        fetchImpl,
        OPENROUTER_IMAGES_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(options.siteUrl ? { "HTTP-Referer": options.siteUrl } : {}),
            ...(options.appName ? { "X-Title": options.appName } : {}),
          },
          body: JSON.stringify(
            buildOpenRouterImageRequest({
              model,
              prompt: request.prompt,
              references: request.references,
              quality: request.quality,
            }),
          ),
        },
        { timeoutMs: options.timeoutMs ?? 5 * 60_000, signal: request.signal },
      );
      const payload = await readJson<OpenRouterImageResponse>(
        response,
        "OpenRouter image generation",
        30_000_000,
      );
      const image = payload.data?.[0];
      if (!image?.b64_json) {
        throw new IconForgeError("PROVIDER_ERROR", "OpenRouter returned no image data.");
      }
      return {
        asset: decodeBase64Asset(
          image.b64_json,
          image.media_type ?? "image/png",
        ),
        provider: "openrouter",
        model: payload.model ?? model,
        requestId: payload.id,
        usage: {
          costUsd: payload.usage?.cost,
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
        },
      };
    },
  };
}
