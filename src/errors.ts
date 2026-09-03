import type { IconBinaryAsset } from "./types.js";

export type IconForgeErrorCode =
  | "INVALID_INPUT"
  | "EDITING_DISABLED"
  | "EDIT_LIMIT_REACHED"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_ERROR"
  | "VECTORIZER_REQUIRED"
  | "VECTORIZER_ERROR"
  | "UNSAFE_SVG";

export class IconForgeError extends Error {
  readonly code: IconForgeErrorCode;
  readonly partialRaster?: IconBinaryAsset;

  constructor(
    code: IconForgeErrorCode,
    message: string,
    options?: { partialRaster?: IconBinaryAsset },
  ) {
    super(message);
    this.name = "IconForgeError";
    this.code = code;
    this.partialRaster = options?.partialRaster;
  }
}
