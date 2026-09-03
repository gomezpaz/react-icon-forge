import { IconForgeError } from "./errors.js";
import { compileIconEditPrompt, compileIconPrompt, normalizeIconReferences } from "./prompt.js";
import { svgAssetToText } from "./svg.js";
import {
  MAX_ICON_EDITS,
  type EditIconInput,
  type GenerateIconInput,
  type IconBinaryAsset,
  type IconForge,
  type IconForgeOptions,
  type IconForgeResult,
  type IconImageProvider,
  type IconProviderResult,
  type IconProviderUsage,
} from "./types.js";

function fallbackId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function findProvider(
  providers: ReadonlyMap<string, IconImageProvider>,
  requested: string,
): IconImageProvider {
  const provider = providers.get(requested);
  if (!provider) {
    throw new IconForgeError(
      "PROVIDER_NOT_FOUND",
      `Image provider "${requested}" is not configured.`,
    );
  }
  return provider;
}

async function toSvg(
  generated: IconProviderResult,
  options: IconForgeOptions,
  signal?: AbortSignal,
): Promise<{
  svg: string;
  raster?: IconBinaryAsset;
  vectorizer?: string;
  vectorizerRequestId?: string;
  vectorizerUsage?: IconProviderUsage;
  usedVectorizer: boolean;
}> {
  if (
    generated.asset.mimeType.split(";", 1)[0]?.trim().toLowerCase() === "image/svg+xml"
  ) {
    return { svg: svgAssetToText(generated.asset), usedVectorizer: false };
  }
  if (!options.vectorizer) {
    throw new IconForgeError(
      "VECTORIZER_REQUIRED",
      "The selected image model returned a raster. Configure a vectorizer to produce SVG.",
      { partialRaster: generated.asset },
    );
  }
  try {
    const vectorized = await options.vectorizer.vectorize(generated.asset, { signal });
    return {
      svg: svgAssetToText(vectorized.asset),
      raster: generated.asset,
      vectorizer: `${vectorized.provider}/${vectorized.model}`,
      vectorizerRequestId: vectorized.requestId,
      vectorizerUsage: vectorized.usage,
      usedVectorizer: true,
    };
  } catch (error) {
    if (error instanceof IconForgeError && error.code === "UNSAFE_SVG") {
      throw new IconForgeError("UNSAFE_SVG", error.message, {
        partialRaster: generated.asset,
      });
    }
    throw new IconForgeError(
      "VECTORIZER_ERROR",
      error instanceof Error ? error.message : "Vectorization failed.",
      { partialRaster: generated.asset },
    );
  }
}

function sumKnown(left: number | undefined, right: number | undefined): number | undefined {
  return left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
}

function mergeUsage(
  provider: IconProviderUsage | undefined,
  vectorizer: IconProviderUsage | undefined,
  usedVectorizer: boolean,
): IconProviderUsage | undefined {
  const usage: IconProviderUsage = {
    costUsd: usedVectorizer
      ? provider?.costUsd !== undefined && vectorizer?.costUsd !== undefined
        ? provider.costUsd + vectorizer.costUsd
        : undefined
      : provider?.costUsd,
    inputTokens: sumKnown(provider?.inputTokens, vectorizer?.inputTokens),
    outputTokens: sumKnown(provider?.outputTokens, vectorizer?.outputTokens),
  };
  return Object.values(usage).some((value) => value !== undefined) ? usage : undefined;
}

export function createIconForge(options: IconForgeOptions): IconForge {
  const providers = new Map(options.providers.map((provider) => [provider.id, provider]));
  if (providers.size !== options.providers.length) {
    throw new IconForgeError("INVALID_INPUT", "Provider ids must be unique.");
  }
  findProvider(providers, options.defaultProvider);
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? fallbackId;

  async function run(
    input: GenerateIconInput,
    mode: "generate" | "edit",
    editsUsed: number,
  ): Promise<IconForgeResult> {
    const startedAt = now();
    const compiled =
      mode === "edit"
        ? compileIconEditPrompt(input as EditIconInput)
        : compileIconPrompt(input);
    const references =
      mode === "edit"
        ? [
            (input as EditIconInput).source,
            ...normalizeIconReferences(input.context?.images),
          ].slice(0, 4)
        : normalizeIconReferences(input.context?.images);
    const provider = findProvider(
      providers,
      input.provider?.trim() || options.defaultProvider,
    );
    let generated: IconProviderResult;
    try {
      generated = await provider.generate({
        prompt: compiled.text,
        references,
        model: input.model,
        quality: input.quality ?? "medium",
        signal: input.signal,
      });
    } catch (error) {
      if (error instanceof IconForgeError) throw error;
      throw new IconForgeError(
        "PROVIDER_ERROR",
        error instanceof Error ? error.message : "Image generation failed.",
      );
    }
    const vector = await toSvg(generated, options, input.signal);
    return {
      id: idFactory(),
      svg: vector.svg,
      raster: vector.raster,
      provider: generated.provider,
      model: generated.model,
      providerRequestId: generated.requestId,
      vectorizer: vector.vectorizer,
      vectorizerRequestId: vector.vectorizerRequestId,
      prompt: compiled,
      editsUsed,
      durationMs: Math.max(0, now() - startedAt),
      usage: mergeUsage(generated.usage, vector.vectorizerUsage, vector.usedVectorizer),
    };
  }

  return {
    generate(input) {
      return run(input, "generate", 0);
    },
    async edit(input) {
      if (!options.editsEnabled) {
        throw new IconForgeError(
          "EDITING_DISABLED",
          "Icon editing is disabled. Enable it explicitly in createIconForge().",
        );
      }
      if (!Number.isInteger(input.editsUsed) || input.editsUsed < 0) {
        throw new IconForgeError("INVALID_INPUT", "editsUsed must be a non-negative integer.");
      }
      if (input.editsUsed >= MAX_ICON_EDITS) {
        throw new IconForgeError(
          "EDIT_LIMIT_REACHED",
          `This icon has used all ${MAX_ICON_EDITS} edit slots. Start a new generation to continue.`,
        );
      }
      return run(input, "edit", input.editsUsed + 1);
    },
  };
}
