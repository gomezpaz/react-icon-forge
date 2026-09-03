import type { FormEvent, ReactNode } from "react";
import { GeneratedIcon } from "./react.js";

export type IconReviewValue = "unreviewed" | "pass" | "fail";

export interface IconAdminGeneration {
  id: string;
  svg?: string;
  title: string;
  subtitle?: string;
  style: string;
  provider: string;
  model: string;
  promptVersion: number;
  review: IconReviewValue;
  createdAt: number;
  error?: string;
}

export interface IconGalleryProps {
  generations: readonly IconAdminGeneration[];
  onReview?: (id: string, review: Exclude<IconReviewValue, "unreviewed">) => void;
  onReplay?: (id: string) => void;
  empty?: ReactNode;
  className?: string;
}

/** Unstyled, accessible contact sheet for prompt-harness and admin surfaces. */
export function IconForgeGallery({
  generations,
  onReview,
  onReplay,
  empty = "No icon attempts yet.",
  className,
}: IconGalleryProps) {
  if (generations.length === 0) return <div className={className}>{empty}</div>;
  return (
    <ol className={className} data-icon-forge-gallery="">
      {generations.map((generation) => (
        <li key={generation.id} data-review={generation.review}>
          {generation.svg ? (
            <GeneratedIcon svg={generation.svg} label={generation.title} size={128} />
          ) : (
            <div role="img" aria-label={`${generation.title} failed`} />
          )}
          <div>
            <strong>{generation.title}</strong>
            {generation.subtitle ? <p>{generation.subtitle}</p> : null}
            <small>
              {generation.style} · {generation.provider}/{generation.model} · prompt v
              {generation.promptVersion}
            </small>
            {generation.error ? <p role="alert">{generation.error}</p> : null}
          </div>
          {onReview || onReplay ? (
            <div aria-label={`Actions for ${generation.title}`} role="group">
              {onReview ? (
                <>
                  <button type="button" onClick={() => onReview(generation.id, "pass")}>
                    Pass
                  </button>
                  <button type="button" onClick={() => onReview(generation.id, "fail")}>
                    Fail
                  </button>
                </>
              ) : null}
              {onReplay ? (
                <button type="button" onClick={() => onReplay(generation.id)}>
                  Replay
                </button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export interface PromptProfileEditorValue {
  baseInstructions: string;
  negativeInstructions: string;
  note: string;
}

export interface PromptProfileEditorProps {
  value: PromptProfileEditorValue;
  onChange(value: PromptProfileEditorValue): void;
  onSave(value: PromptProfileEditorValue): void | Promise<void>;
  busy?: boolean;
  className?: string;
}

/** Controlled editor so persistence, auth, and version activation stay server-owned. */
export function PromptProfileEditor({
  value,
  onChange,
  onSave,
  busy = false,
  className,
}: PromptProfileEditorProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSave(value);
  };
  return (
    <form className={className} onSubmit={submit} data-icon-forge-prompt-editor="">
      <label>
        Base instructions
        <textarea
          required
          maxLength={8_000}
          value={value.baseInstructions}
          onChange={(event) => onChange({ ...value, baseInstructions: event.target.value })}
        />
      </label>
      <label>
        Avoid
        <textarea
          maxLength={4_000}
          value={value.negativeInstructions}
          onChange={(event) =>
            onChange({ ...value, negativeInstructions: event.target.value })
          }
        />
      </label>
      <label>
        Version note
        <input
          maxLength={300}
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </label>
      <button type="submit" disabled={busy || !value.baseInstructions.trim()}>
        {busy ? "Saving…" : "Save draft"}
      </button>
    </form>
  );
}
