import { IconForgeError } from "./errors.js";
import { MAX_ICON_STYLE_CHARS } from "./types.js";
import type {
  IconStyleInput,
  IconStyleKey,
  IconStylePreset,
} from "./types.js";

export const ICON_STYLE_PRESETS: Readonly<Record<IconStyleKey, IconStylePreset>> = {
  isometric: {
    key: "isometric",
    label: "Isometric",
    instructions:
      "Use a clean isometric projection, compact architectural volume, crisp edges, and one consistent light source.",
  },
  "soft-3d": {
    key: "soft-3d",
    label: "Soft 3D",
    instructions:
      "Use softly rounded 3D forms, tactile matte materials, restrained depth, and friendly studio lighting.",
  },
  storybook: {
    key: "storybook",
    label: "Storybook",
    instructions:
      "Use hand-painted storybook warmth, simplified expressive shapes, subtle texture, and an original animation-inspired character.",
  },
  editorial: {
    key: "editorial",
    label: "Editorial",
    instructions:
      "Use a polished editorial illustration language with bold geometry, considered negative space, and restrained color blocking.",
  },
  minimal: {
    key: "minimal",
    label: "Minimal",
    instructions:
      "Use the fewest shapes needed for instant recognition, even visual weight, and no ornamental detail.",
  },
  custom: {
    key: "custom",
    label: "Custom",
    instructions:
      "Follow the supplied style direction and reference images while keeping the result original.",
  },
};

export function resolveIconStyle(input?: IconStyleInput): IconStylePreset {
  if (input === undefined) return ICON_STYLE_PRESETS.minimal;
  if (typeof input === "string") {
    if (!Object.prototype.hasOwnProperty.call(ICON_STYLE_PRESETS, input)) {
      throw new IconForgeError(
        "INVALID_INPUT",
        `Unknown icon style "${input}". Pass a custom style object instead.`,
      );
    }
    return ICON_STYLE_PRESETS[input as IconStyleKey];
  }
  if (!input || typeof input.instructions !== "string") {
    throw new IconForgeError("INVALID_INPUT", "Custom style instructions are required.");
  }
  const instructions = input.instructions.trim();
  if (!instructions || Array.from(instructions).length > MAX_ICON_STYLE_CHARS) {
    throw new IconForgeError(
      "INVALID_INPUT",
      `Custom style instructions must contain 1 to ${MAX_ICON_STYLE_CHARS.toLocaleString()} characters.`,
    );
  }
  return {
    key: input.key,
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : "Custom",
    instructions,
  };
}
