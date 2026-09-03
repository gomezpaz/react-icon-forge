import { IconForgeError } from "../errors.js";
import { bytesToDataUrl } from "../svg.js";
import type {
  IconBinaryAsset,
  IconImageProvider,
  IconProviderRequest,
  IconProviderResult,
  IconQuality,
  IconVectorizer,
} from "../types.js";
import {
  assertModelId,
  fetchWithDeadline,
  readJson,
  trustedHttpsUrl,
} from "./http.js";

const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
const DEFAULT_GENERATE_MODEL = "openai/gpt-image-2";
const DEFAULT_EDIT_MODEL = "openai/gpt-image-2/edit";
const DEFAULT_VECTOR_MODEL = "fal-ai/image2svg";
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PROVIDER_IMAGE_BYTES = 20_000_000;

interface FalQueueMetadata {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  cancel_url?: string;
}

interface FalQueueStatus {
  status?: string;
  response_url?: string;
  error?: string;
  error_type?: string;
  detail?: unknown;
}

interface FalImagePayload {
  images?: Array<{
    url?: string;
    content_type?: string;
    width?: number;
    height?: number;
  }>;
}

export interface FalProviderOptions {
  apiKey: string;
  defaultModel?: string;
  editModel?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetch?: typeof fetch;
}

export interface FalVectorizerOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetch?: typeof fetch;
}

function falHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Key ${apiKey}` };
}

function trustedFalQueueUrl(value: string, label: string): URL {
  const url = trustedHttpsUrl(value, label);
  if (url.hostname !== "queue.fal.run") {
    throw new IconForgeError("PROVIDER_ERROR", `${label} returned an untrusted queue URL.`);
  }
  return url;
}

function unwrapFalPayload(payload: unknown): FalImagePayload {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data?: FalImagePayload }).data ?? {};
  }
  return (payload as FalImagePayload | null) ?? {};
}

async function cancelFalRequest(
  fetchImpl: typeof fetch,
  cancelUrl: URL | undefined,
  apiKey: string,
): Promise<void> {
  if (!cancelUrl) return;
  await fetchWithDeadline(
    fetchImpl,
    cancelUrl,
    { method: "PUT", headers: falHeaders(apiKey) },
    { timeoutMs: 10_000 },
  ).catch(() => undefined);
}

async function runFalQueue(args: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
  fetchImpl: typeof fetch;
}): Promise<{ payload: unknown; requestId: string }> {
  const model = assertModelId(args.model, "fal.ai");
  const submitResponse = await fetchWithDeadline(
    args.fetchImpl,
    `${FAL_QUEUE_ORIGIN}/${model}`,
    {
      method: "POST",
      headers: { ...falHeaders(args.apiKey), "Content-Type": "application/json" },
      body: JSON.stringify(args.body),
    },
    { timeoutMs: FETCH_TIMEOUT_MS, signal: args.signal },
  );
  const submitted = await readJson<FalQueueMetadata>(
    submitResponse,
    `fal ${model} queue submission`,
  );
  if (!submitted.request_id || !submitted.status_url || !submitted.response_url) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `fal ${model} returned incomplete queue metadata.`,
    );
  }
  const statusUrl = trustedFalQueueUrl(submitted.status_url, `fal ${model}`);
  let responseUrl = trustedFalQueueUrl(submitted.response_url, `fal ${model}`);
  const cancelUrl = submitted.cancel_url
    ? trustedFalQueueUrl(submitted.cancel_url, `fal ${model}`)
    : undefined;
  const deadline = Date.now() + args.timeoutMs;
  try {
    while (Date.now() <= deadline) {
      const pollUrl = new URL(statusUrl);
      pollUrl.searchParams.set("logs", "1");
      const statusResponse = await fetchWithDeadline(
        args.fetchImpl,
        pollUrl,
        { headers: falHeaders(args.apiKey) },
        {
          timeoutMs: Math.min(FETCH_TIMEOUT_MS, Math.max(1, deadline - Date.now())),
          signal: args.signal,
        },
      );
      const status = await readJson<FalQueueStatus>(
        statusResponse,
        `fal ${model} queue status`,
      );
      if (status.response_url) {
        responseUrl = trustedFalQueueUrl(status.response_url, `fal ${model}`);
      }
      if (status.status === "COMPLETED") {
        if (status.error) {
          throw new IconForgeError(
            "PROVIDER_ERROR",
            `fal ${model} failed${status.error_type ? ` (${status.error_type})` : ""}: ${status.error.slice(0, 1_000)}`,
          );
        }
        const resultResponse = await fetchWithDeadline(
          args.fetchImpl,
          responseUrl,
          { headers: falHeaders(args.apiKey) },
          { timeoutMs: FETCH_TIMEOUT_MS, signal: args.signal },
        );
        return {
          payload: await readJson<unknown>(resultResponse, `fal ${model} queue result`),
          requestId: submitted.request_id,
        };
      }
      if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
        throw new IconForgeError(
          "PROVIDER_ERROR",
          `fal ${model} returned unexpected queue status "${status.status ?? "unknown"}".`,
        );
      }
      await new Promise<void>((resolve, reject) => {
        const onTimeout = () => {
          args.signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const timer = setTimeout(onTimeout, args.pollIntervalMs);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new IconForgeError("PROVIDER_ERROR", "Icon generation was cancelled."));
        };
        if (args.signal?.aborted) return onAbort();
        args.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  } catch (error) {
    await cancelFalRequest(args.fetchImpl, cancelUrl, args.apiKey);
    throw error;
  }
  await cancelFalRequest(args.fetchImpl, cancelUrl, args.apiKey);
  throw new IconForgeError("PROVIDER_ERROR", `fal ${model} timed out.`);
}

async function downloadFalAsset(
  fetchImpl: typeof fetch,
  value: NonNullable<FalImagePayload["images"]>[number],
  signal?: AbortSignal,
): Promise<IconBinaryAsset> {
  if (!value.url) {
    throw new IconForgeError("PROVIDER_ERROR", "fal returned no image URL.");
  }
  const url = trustedHttpsUrl(value.url, "fal image result");
  const response = await fetchWithDeadline(
    fetchImpl,
    url,
    {},
    { timeoutMs: FETCH_TIMEOUT_MS, signal },
  );
  if (!response.ok) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `fal image download failed (${response.status}).`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new IconForgeError("PROVIDER_ERROR", "fal image exceeded the byte limit.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new IconForgeError("PROVIDER_ERROR", "fal image exceeded the byte limit.");
  }
  return {
    bytes,
    mimeType:
      value.content_type ?? response.headers.get("content-type") ?? "image/png",
    width: value.width,
    height: value.height,
    sourceUrl: value.url,
  };
}

export function buildFalImageRequest(args: {
  prompt: string;
  references: readonly { url: string }[];
  quality: IconQuality;
}): Record<string, unknown> {
  // GPT Image 2 text generation accepts `auto`; its edit endpoint currently
  // accepts only low/medium/high. References route through that edit endpoint.
  const quality = args.references.length > 0 && args.quality === "auto"
    ? "medium"
    : args.quality;
  return {
    prompt: args.prompt,
    image_size: args.references.length > 0 ? "auto" : "square_hd",
    quality,
    num_images: 1,
    output_format: "png",
    ...(args.references.length > 0
      ? { image_urls: args.references.map((reference) => reference.url) }
      : {}),
  };
}

export function createFalProvider(options: FalProviderOptions): IconImageProvider {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new IconForgeError("INVALID_INPUT", "fal.ai API key is required.");
  const fetchImpl = options.fetch ?? fetch;
  const defaultModel = assertModelId(
    options.defaultModel ?? DEFAULT_GENERATE_MODEL,
    "fal.ai",
  );
  const editModel = assertModelId(options.editModel ?? DEFAULT_EDIT_MODEL, "fal.ai");
  return {
    id: "fal",
    defaultModel,
    async generate(request: IconProviderRequest): Promise<IconProviderResult> {
      const requestedModel = assertModelId(request.model ?? defaultModel, "fal.ai");
      const model = request.references.length > 0 && requestedModel === defaultModel
        ? editModel
        : requestedModel;
      const queued = await runFalQueue({
        apiKey,
        model,
        body: buildFalImageRequest(request),
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        pollIntervalMs: options.pollIntervalMs ?? 1_000,
        signal: request.signal,
        fetchImpl,
      });
      const image = unwrapFalPayload(queued.payload).images?.[0];
      if (!image) throw new IconForgeError("PROVIDER_ERROR", "fal returned no image.");
      return {
        asset: await downloadFalAsset(fetchImpl, image, request.signal),
        provider: "fal",
        model,
        requestId: queued.requestId,
      };
    },
  };
}

export function createFalVectorizer(options: FalVectorizerOptions): IconVectorizer {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new IconForgeError("INVALID_INPUT", "fal.ai API key is required.");
  const fetchImpl = options.fetch ?? fetch;
  const model = assertModelId(options.model ?? DEFAULT_VECTOR_MODEL, "fal.ai");
  return {
    id: "fal-image2svg",
    async vectorize(raster, vectorOptions) {
      const queued = await runFalQueue({
        apiKey,
        model,
        body: { image_url: bytesToDataUrl(raster) },
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        pollIntervalMs: options.pollIntervalMs ?? 1_000,
        signal: vectorOptions?.signal,
        fetchImpl,
      });
      const image = unwrapFalPayload(queued.payload).images?.[0];
      if (!image) throw new IconForgeError("VECTORIZER_ERROR", "fal returned no SVG.");
      return {
        asset: await downloadFalAsset(fetchImpl, image, vectorOptions?.signal),
        provider: "fal",
        model,
        requestId: queued.requestId,
        usage: { costUsd: 0.005 },
      };
    },
  };
}
