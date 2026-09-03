import { IconForgeError } from "../errors.js";

export interface RequestOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function fetchWithDeadline(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  options: RequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort("timeout"), options.timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new IconForgeError(
        "PROVIDER_ERROR",
        options.signal?.aborted ? "Icon generation was cancelled." : "Provider request timed out.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function readJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new IconForgeError(
      "PROVIDER_ERROR",
      `${label} failed (${response.status}): ${text.slice(0, 1_000)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IconForgeError("PROVIDER_ERROR", `${label} returned invalid JSON.`);
  }
}

export function assertModelId(value: string, label: string): string {
  const model = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+$/i.test(model)) {
    throw new IconForgeError("INVALID_INPUT", `${label} model id is invalid.`);
  }
  return model;
}

export function trustedHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IconForgeError("PROVIDER_ERROR", `${label} returned an invalid URL.`);
  }
  if (url.protocol !== "https:") {
    throw new IconForgeError("PROVIDER_ERROR", `${label} returned a non-HTTPS URL.`);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
    hostname,
  );
  const privateIpv6 =
    hostname === "::1" ||
    hostname === "::" ||
    /^f[cd][0-9a-f]{2}:/i.test(hostname) ||
    /^fe[89ab][0-9a-f]:/i.test(hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    privateIpv4 ||
    privateIpv6
  ) {
    throw new IconForgeError("PROVIDER_ERROR", `${label} returned a private URL.`);
  }
  return url;
}
