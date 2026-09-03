import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { IconForgeError } from "./errors.js";
import { sanitizeIconSvg } from "./svg.js";
import { MAX_ICON_EDITS, type IconStyleKey } from "./types.js";

export interface GeneratedIconProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  svg: string;
  label?: string;
  size?: number | string;
}

export function GeneratedIcon({
  svg,
  label,
  size = "1em",
  style,
  ...props
}: GeneratedIconProps) {
  const sanitized = useMemo(() => sanitizeIconSvg(svg), [svg]);
  const dimensions: CSSProperties = { width: size, height: size, ...style };
  return (
    <span
      {...props}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      style={{ display: "inline-flex", flex: "none", ...dimensions }}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

export interface IconClientGeneration {
  id: string;
  svg: string;
  editsUsed: number;
  provider?: string;
  model?: string;
}

export interface IconClientGenerateInput {
  description: string;
  contextText?: string;
  style?: IconStyleKey | string;
  referenceIds?: readonly string[];
}

export interface IconClientEditInput {
  iconId: string;
  suggestion: string;
}

export interface UseIconForgeClientOptions {
  generate(input: IconClientGenerateInput): Promise<IconClientGeneration>;
  edit?(input: IconClientEditInput): Promise<IconClientGeneration>;
  editsEnabled?: boolean;
}

/** Controlled transport hook. Provider credentials stay behind the caller's server. */
export function useIconForgeClient(options: UseIconForgeClientOptions) {
  const generateTransport = options.generate;
  const editTransport = options.edit;
  const editsEnabled = options.editsEnabled;
  const [result, setResult] = useState<IconClientGeneration | null>(null);
  const [busy, setBusy] = useState<"generate" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (input: IconClientGenerateInput) => {
      setBusy("generate");
      setError(null);
      try {
        const next = await generateTransport(input);
        setResult(next);
        return next;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Icon generation failed.");
        throw caught;
      } finally {
        setBusy(null);
      }
    },
    [generateTransport],
  );

  const edit = useCallback(
    async (input: IconClientEditInput) => {
      if (!editsEnabled || !editTransport) {
        throw new IconForgeError("EDITING_DISABLED", "Icon editing is not enabled.");
      }
      if (result && result.editsUsed >= MAX_ICON_EDITS) {
        throw new IconForgeError(
          "EDIT_LIMIT_REACHED",
          `This icon has used all ${MAX_ICON_EDITS} edit slots.`,
        );
      }
      setBusy("edit");
      setError(null);
      try {
        const next = await editTransport(input);
        setResult(next);
        return next;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Icon editing failed.");
        throw caught;
      } finally {
        setBusy(null);
      }
    },
    [editTransport, editsEnabled, result],
  );

  return {
    result,
    busy,
    error,
    generate,
    edit,
    editsEnabled: Boolean(editsEnabled && editTransport),
    editsRemaining: result ? Math.max(0, MAX_ICON_EDITS - result.editsUsed) : MAX_ICON_EDITS,
    clearError: () => setError(null),
  };
}
