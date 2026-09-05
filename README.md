# react-icon-forge

Generate an icon from text and image context, refine it up to three times, and
return a sanitized SVG. `react-icon-forge` is BYOK, provider-neutral, and small:
the core has no runtime dependencies, React is an optional peer, and the fal and
OpenRouter adapters use `fetch` directly.

Created and maintained by [Santiago Gomez Paz](https://github.com/gomezpaz).

## Generated examples

These SVGs were generated with the package's default pipeline: GPT Image 2 on
fal, followed by `fal-ai/image2svg` and the built-in SVG sanitizer.

| Fix checkout | Launch a website | Schedule a campaign |
| --- | --- | --- |
| <img src="./examples/generated/fix-checkout.svg" width="180" alt="Isometric shopping bag and wrench icon" /> | <img src="./examples/generated/launch-website.svg" width="180" alt="Isometric website launch icon" /> | <img src="./examples/generated/schedule-campaign.svg" width="180" alt="Isometric campaign calendar icon" /> |
| `Fix a checkout bug` | `Launch a new website` | `Schedule a social campaign` |

Reproduce them with `FAL_KEY=… npm run examples:generate`. The exact briefs
and generation metadata are checked in at
[`examples/generated/manifest.json`](./examples/generated/manifest.json).

## What ships

- Text plus up to four private image references
- Built-in `minimal`, `isometric`, `soft-3d`, `storybook`, and `editorial` styles
- Custom style instructions and reference-driven generation
- fal and OpenRouter image adapters, plus a provider interface for any model
- Raster-to-SVG conversion through a pluggable vectorizer
- Strict SVG rejection for scripts, external resources, embedded rasters, and CSS
- Follow-up editing off by default with an immutable three-edit ceiling
- Optional React renderer, client transport hook, gallery, and prompt editor
- Prompt profiles with ids and integer versions for repeatable evaluation

## Install

```bash
npm install react-icon-forge
```

The default path uses GPT Image 2 and `fal-ai/image2svg` through fal:

```ts
import { createIconForge } from "react-icon-forge";
import {
  createFalProvider,
  createFalVectorizer,
} from "react-icon-forge/providers/fal";

const falKey = process.env.FAL_KEY!;
const forge = createIconForge({
  providers: [createFalProvider({ apiKey: falKey })],
  defaultProvider: "fal",
  vectorizer: createFalVectorizer({ apiKey: falKey }),
});

const icon = await forge.generate({
  description: "A tiny neighborhood bakery with an open front door",
  style: "isometric",
  context: {
    text: "Warm sourdough shop. Navy, flour white, and apricot palette.",
    images: [{ url: "data:image/png;base64,...", label: "brand board" }],
  },
});

console.log(icon.svg);
```

Provider keys belong on a server. Do not call fal or OpenRouter directly from a
browser. The React hook accepts your authenticated server transport:

```tsx
import { GeneratedIcon, useIconForgeClient } from "react-icon-forge/react";

function IconMaker() {
  const forge = useIconForgeClient({
    generate: (input) =>
      fetch("/api/icons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "generate", ...input }),
      }).then((response) => response.json()),
  });

  return forge.result ? (
    <GeneratedIcon svg={forge.result.svg} label="Bakery" size={48} />
  ) : null;
}
```

## Multiple models with OpenRouter

OpenRouter's dedicated Image API accepts model ids and optional image references.
Add it beside fal, then select `provider` and `model` per request:

```ts
import { createOpenRouterProvider } from "react-icon-forge/providers/openrouter";

const forge = createIconForge({
  providers: [
    createFalProvider({ apiKey: process.env.FAL_KEY! }),
    createOpenRouterProvider({
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultModel: "openai/gpt-image-1",
      appName: "My icon studio",
      siteUrl: "https://example.com",
    }),
  ],
  defaultProvider: "fal",
  vectorizer: createFalVectorizer({ apiKey: process.env.FAL_KEY! }),
});

await forge.generate({
  description: "A folded paper map pin",
  provider: "openrouter",
  model: "black-forest-labs/flux.2-pro",
});
```

Check the selected model's live OpenRouter capability record before passing
reference images or provider-specific options.

## Editing

Editing must be explicitly enabled. `MAX_ICON_EDITS` is always `3` and cannot be
configured upward. Persist the root chain's `editsUsed` count in your server-side
store and update it atomically before paid work so parallel requests cannot evade
the limit.

```ts
const forge = createIconForge({
  providers: [createFalProvider({ apiKey: falKey })],
  defaultProvider: "fal",
  vectorizer: createFalVectorizer({ apiKey: falKey }),
  editsEnabled: true,
});

const edited = await forge.edit({
  description: "A neighborhood bakery",
  source: { url: previousRasterDataUrl, mimeType: "image/png" },
  suggestion: "Make the awning navy and remove the wheat stalk",
  editsUsed: 0,
});
```

## Prompt hardening

Every result returns the exact compiled prompt, profile id, profile version,
provider, model, request id, duration, and reported usage. `usage.costUsd` is
only set when the complete total is known; `usage.costs` preserves separately
reported generation and vectorization charges when one component is unknown.
Store those beside a pass/fail review and replay the same input against a draft
prompt profile. The optional `react-icon-forge/admin` entry exports an unstyled
contact sheet and a controlled prompt-profile editor for this loop.

## Security and privacy

- Keep provider keys and generation calls server-side.
- Convert private references to data URLs in memory. Do not make them public just
  so a provider can fetch them.
- Enforce ownership before loading references, source rasters, or SVG results.
- Treat the included SVG sanitizer as a strict final gate, not a substitute for
  an authenticated asset-serving boundary.
- Generated icons are artwork. Do not silently replace accessibility-critical
  platform controls with generated imagery.

## Development

```bash
npm run check
npm pack --dry-run
```

MIT © 2026 Santiago Gomez Paz.
