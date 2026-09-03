export { IconForgeError, type IconForgeErrorCode } from "./errors.js";
export { createIconForge } from "./forge.js";
export {
  compileIconEditPrompt,
  compileIconPrompt,
  DEFAULT_ICON_PROMPT_PROFILE,
  normalizeIconReferences,
} from "./prompt.js";
export { ICON_STYLE_PRESETS, resolveIconStyle } from "./styles.js";
export {
  assetAsReference,
  bytesToDataUrl,
  decodeBase64Asset,
  MAX_ICON_SVG_BYTES,
  sanitizeIconSvg,
  svgAssetToText,
} from "./svg.js";
export {
  MAX_ICON_CONTEXT_CHARS,
  MAX_ICON_DESCRIPTION_CHARS,
  MAX_ICON_EDITS,
  MAX_ICON_REFERENCES,
  MAX_ICON_SUGGESTION_CHARS,
} from "./types.js";
export type {
  CompiledIconPrompt,
  CustomIconStyle,
  EditIconInput,
  GenerateIconInput,
  IconBinaryAsset,
  IconContext,
  IconForge,
  IconForgeOptions,
  IconForgeResult,
  IconImageProvider,
  IconImageReference,
  IconPromptProfile,
  IconProviderRequest,
  IconProviderResult,
  IconProviderUsage,
  IconQuality,
  IconStyleInput,
  IconStyleKey,
  IconStylePreset,
  IconVectorizer,
  IconVectorizerResult,
} from "./types.js";
