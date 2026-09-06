export const MAX_ICON_EDITS = 3 as const;
export const MAX_ICON_REFERENCES = 4 as const;
export const MAX_ICON_DESCRIPTION_CHARS = 2_000 as const;
export const MAX_ICON_CONTEXT_CHARS = 6_000 as const;
export const MAX_ICON_SUGGESTION_CHARS = 1_000 as const;
export const MAX_ICON_STYLE_CHARS = 2_000 as const;

export type IconStyleKey =
  | "isometric"
  | "soft-3d"
  | "storybook"
  | "editorial"
  | "minimal"
  | "custom";

export interface IconStylePreset {
  key: IconStyleKey | (string & {});
  label: string;
  instructions: string;
}

export interface IconPromptProfile {
  id: string;
  version: number;
  baseInstructions: string;
  negativeInstructions: string;
}

export interface IconImageReference {
  /** HTTPS or image data URL. Private inputs should use data URLs server-side. */
  url: string;
  mimeType?: string;
  label?: string;
}

export interface IconContext {
  text?: string;
  images?: readonly IconImageReference[];
}

export interface CustomIconStyle {
  key: "custom";
  label?: string;
  instructions: string;
}

export type IconStyleInput = IconStyleKey | CustomIconStyle | IconStylePreset;

export type IconQuality = "low" | "medium" | "high" | "auto";

export interface GenerateIconInput {
  description: string;
  style?: IconStyleInput;
  context?: IconContext;
  provider?: string;
  model?: string;
  quality?: IconQuality;
  promptProfile?: IconPromptProfile;
  signal?: AbortSignal;
}

export interface EditIconInput extends GenerateIconInput {
  source: IconImageReference;
  suggestion: string;
  /** Number of edit slots already consumed by this icon's root chain. */
  editsUsed: number;
}

export interface CompiledIconPrompt {
  text: string;
  profileId: string;
  profileVersion: number;
  style: IconStylePreset;
  referenceCount: number;
  mode: "generate" | "edit";
}

export interface IconBinaryAsset {
  bytes: Uint8Array;
  mimeType: string;
  width?: number;
  height?: number;
  sourceUrl?: string;
}

export interface IconProviderUsage {
  /** Exact total when every chargeable component reported its cost. */
  costUsd?: number;
  /** Component costs remain available even when the exact total is unknown. */
  costs?: {
    generationUsd?: number;
    vectorizationUsd?: number;
  };
  inputTokens?: number;
  outputTokens?: number;
}

export interface IconProviderResult {
  asset: IconBinaryAsset;
  provider: string;
  model: string;
  requestId?: string;
  usage?: IconProviderUsage;
}

export interface IconProviderRequest {
  prompt: string;
  references: readonly IconImageReference[];
  model?: string;
  quality: IconQuality;
  signal?: AbortSignal;
}

export interface IconImageProvider {
  id: string;
  defaultModel: string;
  generate(request: IconProviderRequest): Promise<IconProviderResult>;
}

export interface IconVectorizerResult {
  asset: IconBinaryAsset;
  provider: string;
  model: string;
  requestId?: string;
  usage?: IconProviderUsage;
}

export interface IconVectorizer {
  id: string;
  vectorize(
    raster: IconBinaryAsset,
    options?: { signal?: AbortSignal },
  ): Promise<IconVectorizerResult>;
}

export interface IconForgeResult {
  id: string;
  svg: string;
  raster?: IconBinaryAsset;
  provider: string;
  model: string;
  providerRequestId?: string;
  vectorizer?: string;
  vectorizerRequestId?: string;
  prompt: CompiledIconPrompt;
  editsUsed: number;
  durationMs: number;
  usage?: IconProviderUsage;
}

export interface IconForgeOptions {
  providers: readonly IconImageProvider[];
  defaultProvider: string;
  vectorizer?: IconVectorizer;
  /** Follow-up editing is deliberately disabled unless explicitly enabled. */
  editsEnabled?: boolean;
  idFactory?: () => string;
  now?: () => number;
}

export interface IconForge {
  generate(input: GenerateIconInput): Promise<IconForgeResult>;
  edit(input: EditIconInput): Promise<IconForgeResult>;
}
