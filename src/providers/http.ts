import { IconForgeError } from "../errors.js";

export interface RequestOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_JSON_BYTES = 2_000_000;

export async function fetchWithDeadline(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  options: RequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const callerAbortReason = Symbol("caller-abort");
  const timeoutReason = Symbol("request-timeout");
  const cleanup = () => {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    if (!controller.signal.aborted) controller.abort(callerAbortReason);
    cleanup();
  };
  const abortError = () =>
    new IconForgeError(
      "PROVIDER_ERROR",
      controller.signal.reason === timeoutReason
        ? "Provider request timed out."
        : "Icon generation was cancelled.",
    );
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(timeoutReason);
    cleanup();
  }, options.timeoutMs);
  if (options.signal?.aborted) onAbort();
  let bodyOwnsLifetime = false;
  try {
    if (controller.signal.aborted) throw abortError();
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
    if (!response.body) return response;

    const reader = response.body.getReader();
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
    };
    const readNext = () =>
      new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          controller.signal.removeEventListener("abort", onBodyAbort);
        };
        const resolveOnce = (value: ReadableStreamReadResult<Uint8Array>) => {
          if (finished) return;
          finish();
          resolve(value);
        };
        const rejectOnce = (error: unknown) => {
          if (finished) return;
          finish();
          reject(error);
        };
        const onBodyAbort = () => rejectOnce(abortError());
        controller.signal.addEventListener("abort", onBodyAbort, {
          once: true,
        });
        if (controller.signal.aborted) {
          onBodyAbort();
          return;
        }
        reader
          .read()
          .then(resolveOnce, (error) =>
            rejectOnce(controller.signal.aborted ? abortError() : error),
          );
      });
    const body = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const { done, value } = await readNext();
          if (done) {
            settle();
            output.close();
          } else {
            output.enqueue(value);
          }
        } catch (error) {
          settle();
          if (controller.signal.aborted)
            void reader.cancel(error).catch(() => undefined);
          output.error(error);
        }
      },
      async cancel(reason) {
        settle();
        await reader.cancel(reason);
      },
    });
    bodyOwnsLifetime = true;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted) throw abortError();
    throw error;
  } finally {
    if (!bodyOwnsLifetime) cleanup();
  }
}

async function readTextWithinLimit(
  response: Response,
  label: string,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} response exceeded the byte limit.`,
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new IconForgeError(
        "PROVIDER_ERROR",
        `${label} response exceeded the byte limit.`,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function readBytesWithinLimit(
  response: Response,
  label: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} exceeded the byte limit.`,
    );
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const initialCapacity =
    Number.isFinite(declaredLength) && declaredLength > 0
      ? Math.min(declaredLength, maxBytes, 64 * 1024)
      : Math.min(maxBytes, 64 * 1024);
  let bytes = new Uint8Array(initialCapacity);
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const nextTotal = total + value.byteLength;
    if (nextTotal > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new IconForgeError(
        "PROVIDER_ERROR",
        `${label} exceeded the byte limit.`,
      );
    }
    if (nextTotal > bytes.byteLength) {
      let capacity = Math.max(1, bytes.byteLength);
      while (capacity < nextTotal) capacity = Math.min(maxBytes, capacity * 2);
      const grown = new Uint8Array(capacity);
      grown.set(bytes.subarray(0, total));
      bytes = grown;
    }
    bytes.set(value, total);
    total = nextTotal;
  }
  return bytes.subarray(0, total);
}

export async function readJson<T>(
  response: Response,
  label: string,
  maxBytes = DEFAULT_MAX_JSON_BYTES,
): Promise<T> {
  const text = await readTextWithinLimit(response, label, maxBytes);
  if (!response.ok) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} failed (${response.status}): ${text.slice(0, 1_000)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} returned invalid JSON.`,
    );
  }
}

export function assertModelId(value: string, label: string): string {
  const model = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/i.test(model)) {
    throw new IconForgeError("INVALID_INPUT", `${label} model id is invalid.`);
  }
  return model;
}

export function assertOpenRouterModelId(value: string): string {
  const model = value.trim();
  if (
    !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+(?::[a-z0-9][a-z0-9._-]*)?$/i.test(
      model,
    )
  ) {
    throw new IconForgeError(
      "INVALID_INPUT",
      "OpenRouter model id is invalid.",
    );
  }
  return model;
}

export function trustedHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} returned an invalid URL.`,
    );
  }
  if (url.protocol !== "https:") {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} returned a non-HTTPS URL.`,
    );
  }
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  const privateIpv4 =
    /^(?:10\.|127\.|169\.254\.|192\.168\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
      hostname,
    );
  const privateIpv6 =
    hostname === "::1" ||
    hostname === "::" ||
    /^f[cd][0-9a-f]{2}:/i.test(hostname) ||
    /^fe[89ab][0-9a-f]:/i.test(hostname) ||
    hostname.startsWith("::ffff:");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    privateIpv4 ||
    privateIpv6
  ) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} returned a private URL.`,
    );
  }
  return url;
}
