import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createIconForge } from "../dist/index.js";
import {
  createFalProvider,
  createFalVectorizer,
} from "../dist/providers/fal.js";

const apiKey = (process.env.FAL_KEY ?? process.env.ANIMATE_FAL_KEY ?? "").trim();
if (!apiKey) {
  throw new Error("Set FAL_KEY before generating README examples.");
}

const outputDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../examples/generated",
);
const forge = createIconForge({
  providers: [createFalProvider({ apiKey })],
  defaultProvider: "fal",
  vectorizer: createFalVectorizer({ apiKey }),
});
const contextText = [
  "This is decorative artwork for a task approval card.",
  "Use a consistent neutral palette: warm white, charcoal, muted blue, and restrained orange accents.",
  "No text, letters, logos, people, or decorative frame.",
].join(" ");
const examples = [
  {
    id: "fix-checkout",
    caption: "Fix a checkout bug",
    description:
      "A compact shopping bag beside a small wrench, representing a checkout bug being fixed",
  },
  {
    id: "launch-website",
    caption: "Launch a new website",
    description:
      "A compact browser window lifting off from a tiny launch pad, representing a website launch",
  },
  {
    id: "schedule-campaign",
    caption: "Schedule a social campaign",
    description:
      "A compact calendar beside a small megaphone, representing a scheduled social media campaign",
  },
];

await mkdir(outputDir, { recursive: true });
const generated = await Promise.all(
  examples.map(async (example) => {
    const result = await forge.generate({
      description: example.description,
      style: "isometric",
      context: { text: contextText },
      quality: "low",
      signal: AbortSignal.timeout(7 * 60_000),
    });
    await writeFile(resolve(outputDir, `${example.id}.svg`), `${result.svg}\n`);
    return {
      ...example,
      contextText,
      style: "isometric",
      provider: result.provider,
      model: result.model,
      promptProfile: result.prompt.profileId,
      promptVersion: result.prompt.profileVersion,
      vectorizer: result.vectorizer ?? null,
    };
  }),
);

await writeFile(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify(
    {
      generatedBy: "react-icon-forge@0.1.0",
      pipeline: "fal/openai/gpt-image-2 -> fal/fal-ai/image2svg -> sanitizeIconSvg",
      generatedAt: new Date().toISOString(),
      examples: generated,
    },
    null,
    2,
  )}\n`,
);
console.log(`Generated ${generated.length} sanitized SVG examples in ${outputDir}`);
