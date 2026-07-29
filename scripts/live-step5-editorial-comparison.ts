import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import {
  HARD_MAX_REFRAIN_CHARACTERS,
  deriveRefrainBudget,
  normalizeRefrain,
  refrainBudgetViolations,
  rhymePairViolations
} from "../app/api/direction-pipeline.ts";
import { calculateCost, pricingFor } from "../app/api/openai-control.ts";
import { deterministicViolations } from "../app/api/translation-quality.ts";
import { directionsEvaluationPrompt } from "../app/api/translation-prompts.ts";

const MODEL = "gpt-5.6-sol";
const TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 3_500;
const AUTOMATIC_RETRIES = 0;
const CONFIRMATION = "RUN_EDITORIAL_COMPARISON_ABC";
const SOURCE_ARTIFACT = resolve("artifacts/live-step5/2026-07-29T16-29-23-901Z-rhythm.json");
const MAX_ESTIMATED_COST_USD = 3 * calculateCost(
  { inputTokens: 4_000, cachedInputTokens: 0, outputTokens: MAX_OUTPUT_TOKENS },
  pricingFor(MODEL)
);

if (process.env.CONFIRM_STEP5_EDITORIAL_COMPARISON !== CONFIRMATION) {
  throw new Error(
    `Editorial comparison blocked. Set CONFIRM_STEP5_EDITORIAL_COMPARISON=${CONFIRMATION} only after explicit approval.`
  );
}

const source = [
  "I love my happy, hairy friend who's nestled on a tree.\nI really love you oh-so-MUSH for watching over me.",
  "These mushroom friends have many hands to hold and spin around.\nI really love you oh-so-MUSH! You lift me off the ground!",
  "I spy my jiggly orange friends.\nIt's fun the way you move.\nI really love you oh-so-MUSH!"
];
const visualContexts = [
  "A friendly mushroom narrator looks toward a large hairy forest friend resting beside a tree.",
  "Orange mushroom friends hold hands in a circle and spin around the central mushroom.",
  "The mushroom narrator watches bright orange friends moving playfully in the forest."
];
const priority = "rhythm" as const;
const freedom = "natural" as const;
const sourceArtifact = JSON.parse(await readFile(SOURCE_ARTIFACT, "utf8"));
const cachedPrivateCandidates = z.array(z.object({
  name: z.string(),
  refrain: z.string(),
  approach: z.string(),
  directionIndex: z.number().int()
})).length(5).parse(sourceArtifact.survivors);
const refrainBudget = deriveRefrainBudget(source);

const rhymePairSchema = z.object({
  endingA: z.string().trim().min(1).max(30),
  endingB: z.string().trim().min(1).max(30)
});
const productionOptionSchema = z.object({
  sourceCandidateIndex: z.number().int().min(-1).max(4),
  label: z.string().trim().min(1).max(40),
  refrain: z.string().trim().min(1).max(HARD_MAX_REFRAIN_CHARACTERS),
  description: z.string().trim().min(1).max(120),
  genderDependency: z.string().trim().min(1).max(120),
  construction: z.enum(["couplet", "playful_hook", "lyrical_refrain"]),
  rhymePairs: z.array(rhymePairSchema).min(1).max(2)
});
const productionOutputSchema = z.object({ options: z.array(productionOptionSchema).length(3) });
const techniques = [
  "balanced_couplet",
  "repeated_hook",
  "call_and_response",
  "internal_rhyme",
  "end_rhyme",
  "rhythmic_parallelism",
  "grounded_lyrical_image",
  "direct_affection"
] as const;
const revisedOptionSchema = z.object({
  refrain: z.string().trim().min(1).max(HARD_MAX_REFRAIN_CHARACTERS),
  technique: z.enum(techniques),
  rhymePairs: z.array(rhymePairSchema).min(1).max(2)
});
const revisedOutputSchema = z.object({ options: z.array(revisedOptionSchema).length(3) });

const productionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    options: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourceCandidateIndex: { type: "integer", minimum: -1, maximum: 4 },
          label: { type: "string", maxLength: 40 },
          refrain: { type: "string", maxLength: HARD_MAX_REFRAIN_CHARACTERS },
          description: { type: "string", maxLength: 120 },
          genderDependency: { type: "string", maxLength: 120 },
          construction: { type: "string", enum: ["couplet", "playful_hook", "lyrical_refrain"] },
          rhymePairs: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                endingA: { type: "string", maxLength: 30 },
                endingB: { type: "string", maxLength: 30 }
              },
              required: ["endingA", "endingB"]
            }
          }
        },
        required: [
          "sourceCandidateIndex",
          "label",
          "refrain",
          "description",
          "genderDependency",
          "construction",
          "rhymePairs"
        ]
      }
    }
  },
  required: ["options"]
} as const;

const revisedJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    options: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          refrain: { type: "string", maxLength: HARD_MAX_REFRAIN_CHARACTERS },
          technique: { type: "string", enum: [...techniques] },
          rhymePairs: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                endingA: { type: "string", maxLength: 30 },
                endingB: { type: "string", maxLength: 30 }
              },
              required: ["endingA", "endingB"]
            }
          }
        },
        required: ["refrain", "technique", "rhymePairs"]
      }
    }
  },
  required: ["options"]
} as const;

const currentPrompt = directionsEvaluationPrompt({
  texts: source,
  visualContexts,
  priority,
  freedom,
  directionsJson: JSON.stringify(cachedPrivateCandidates),
  refrainBudget
});

const revisedPrompt = `VLOGA
Deluješ kot izkušen slovenski urednik otroške književnosti. Iz petih zasebnih osnutkov pripravi natanko tri kratke, končne refrene. Vrni samo strukturirani JSON. Ne vračaj razlag, ocen ali besedila za starše.

IZVIRNI ANGLEŠKI REFREN
${refrainBudget.sourceRefrain}

CELOTNO POTRJENO BESEDILO
${source.map((text, index) => `${index + 1}. ${text}`).join("\n")}

USTREZNI SLIKOVNI IN VSEBINSKI KONTEKST
${visualContexts.map((context, index) => `${index + 1}. ${context}`).join("\n")}

ZASEBNI OSNUTKI
${JSON.stringify(cachedPrivateCandidates)}

UREDNIŠKA HIERARHIJA — UPOŠTEVAJ JO V TEM VRSTNEM REDU
1. Idiomatična, sodobna slovenščina, ki bi jo slovenski starš brez zadrege večkrat izgovoril na glas.
2. Zvestoba pomenu angleškega izvirnika.
3. Gladek ritem in lahka ponovljivost.
4. Prepričljiva, nevsiljena zvočna rima.
5. Smiselna raznolikost med tremi možnostmi.

Rima in raznolikost nikoli ne upravičita nenaravne slovenščine.

OBVEZNA JEZIKOVNA MERILA
- Nikoli ne obračaj običajnega slovenskega besednega reda samo zato, da dosežeš rimo.
- Ne uporabljaj mašil ali nepotrebnega ponavljanja besed, kot so »vsi«, »prav« in podobni poudarki.
- Ne izberi zaznamovane, hrvaško zveneče, arhaične ali pretirano knjižne besede, če obstaja nevtralna slovenska možnost.
- Ne uporabi slovnične oblike z neustreznim ali po nepotrebnem omejenim spolom oziroma številom.
- Angleške zveze prevedi tako, kot bi isto misel naravno povedali po slovensko; ne prevajaj jih dobesedno.
- Ne uporabljaj vzvišenih izrazov, kot je »obožuje«, če izvirnik nima takega čustvenega registra.
- Naravna približna rima je boljša od tehnično natančne rime, dosežene z okorno skladnjo.
- Če je zasebni osnutek slab, ga zavrzi. Končne možnosti niso dolžne ohraniti njegovega besedila.
- Vsak predlog v mislih preberi na glas.
- Pri vsakem se vprašaj: »Bi slovenski starš ta stavek udobno večkrat ponovil med branjem malčku?«

NEGATIVNI UREDNIŠKI PRIMERI — NE POSNEMAJ JIH
- »Ker skrbite zame, rada imam prav vas same.«: »prav vas same« je prisiljeno, lahko po nepotrebnem odpira vprašanje spola in očitno služi rimi z »zame«.
- »Vsi, prav vsi — pazite name, pri srcu ste mi!«: »Vsi, prav vsi« je mašilo; »pazite name« zveni kot navodilo; celota je ritmično natrpana.
- »Rada vas imam, za vašo skrb vam hvalo dam.«: »vam hvalo dam« je nenaraven obrat, narejen zaradi rime z »imam«.
- »Čuvate me vi«: nenaraven obrat in neustrezno oziroma zaznamovano besedišče.
- »Hvala za vas«: dobesedna, v slovenščini nenaravna zveza.
- »Moje srce vas obožuje«: toga in pretirano vzvišena formulacija.

POZITIVNA SMER ZA TA POMEN
»Ker skrbite zame vsak dan, prav vse vas rada imam.« ni nujno končna rešitev, vendar pokaže pravilno hierarhijo: najprej naravna slovenščina, nato zvest pomen, nato gladek ritem in šele nato nevsiljena rima.

MOŽNE TEHNIKE
- balanced_couplet: uravnotežen dvovrstičen refren
- repeated_hook: kratek ponovljeni vzklik ali sidro
- call_and_response: naraven klic in odgovor
- internal_rhyme: notranja rima
- end_rhyme: končna rima
- rhythmic_parallelism: ritmični paralelizem
- grounded_lyrical_image: kratka lirična podoba, ki jo podpira izvirnik
- direct_affection: neposredna ljubeča izjava

Izberi tri tehnike, ki najbolje služijo temu konkretnemu izvirniku. Ne uporabi neprimerne oblike samo zato, da zapolniš seznam. V dejanskem jeziku morajo biti vidni različni začetki, ritmične oblike, rimski pari in skladenjske zgradbe. Ne vračaj treh sopomenskih preoblikovanj.

OMEJITVE
- Natanko tri končne možnosti.
- Vsaka mora biti kratka, samostojna, slovnično dokončana in primerna za ponavljanje.
- Največ ${HARD_MAX_REFRAIN_CHARACTERS} znakov na možnost.
- Brez novih dejanj, oseb, prizorišč ali čustvenih trditev, ki jih izvirnik ne podpira.
- Goba kot pripovedovalka je ženskega spola, kadar oblika razkriva spol.
- V rhymePairs navedi dejanske končne besede rimskega para.

Vrni samo zahtevani objekt options.`;

type Configuration = {
  id: "A" | "B" | "C";
  label: string;
  reasoningEffort: "low" | "medium";
  prompt: string;
  schemaName: string;
  jsonSchema: typeof productionJsonSchema | typeof revisedJsonSchema;
  parse: (value: unknown) => Array<{ refrain: string; technique: string; rhymePairs: Array<{ endingA: string; endingB: string }> }>;
};

const configurations: Configuration[] = [
  {
    id: "A",
    label: "Current prompt · Sol low",
    reasoningEffort: "low",
    prompt: currentPrompt,
    schemaName: "current_editorial_low",
    jsonSchema: productionJsonSchema,
    parse(value) {
      return productionOutputSchema.parse(value).options.map((option) => ({
        refrain: option.refrain,
        technique: option.construction,
        rhymePairs: option.rhymePairs
      }));
    }
  },
  {
    id: "B",
    label: "Current prompt · Sol medium",
    reasoningEffort: "medium",
    prompt: currentPrompt,
    schemaName: "current_editorial_medium",
    jsonSchema: productionJsonSchema,
    parse(value) {
      return productionOutputSchema.parse(value).options.map((option) => ({
        refrain: option.refrain,
        technique: option.construction,
        rhymePairs: option.rhymePairs
      }));
    }
  },
  {
    id: "C",
    label: "Native-editor prompt · Sol medium",
    reasoningEffort: "medium",
    prompt: revisedPrompt,
    schemaName: "native_editorial_medium",
    jsonSchema: revisedJsonSchema,
    parse(value) {
      return revisedOutputSchema.parse(value).options;
    }
  }
];

function diagnostics(options: Array<{
  refrain: string;
  technique: string;
  rhymePairs: Array<{ endingA: string; endingB: string }>;
}>) {
  const hardFailures: Array<{ code: string; message: string; option?: number }> = [];
  const qualityWarnings: Array<{ code: string; message: string; option?: number }> = [];
  const seen = new Set<string>();
  if (options.length !== 3) hardFailures.push({ code: "WRONG_COUNT", message: "Expected exactly three options." });
  for (const [index, option] of options.entries()) {
    const normalized = normalizeRefrain(option.refrain);
    if (!normalized || !/\p{L}/u.test(option.refrain)) {
      hardFailures.push({ code: "MALFORMED", message: "Empty or malformed refrain.", option: index + 1 });
    }
    if (option.refrain.length > HARD_MAX_REFRAIN_CHARACTERS) {
      hardFailures.push({ code: "GROSSLY_OVERLONG", message: "Refrain exceeds absolute UI limit.", option: index + 1 });
    }
    if (seen.has(normalized)) {
      hardFailures.push({ code: "EXACT_DUPLICATE", message: "Exactly duplicates another refrain.", option: index + 1 });
    }
    seen.add(normalized);
    for (const message of deterministicViolations(option.refrain, { requireCompleteSentence: false })) {
      hardFailures.push({ code: "NON_FINAL_TEXT", message, option: index + 1 });
    }
    for (const message of refrainBudgetViolations(option.refrain, refrainBudget)) {
      qualityWarnings.push({ code: "SOURCE_RELATIVE_SHAPE", message, option: index + 1 });
    }
    for (const message of rhymePairViolations(option.refrain, option.rhymePairs)) {
      qualityWarnings.push({ code: "RHYME_HEURISTIC", message, option: index + 1 });
    }
  }
  return { hardFailures, qualityWarnings };
}

const client = new OpenAI();
const results: unknown[] = [];

for (const configuration of configurations) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Editorial configuration ${configuration.id} exceeded ${TIMEOUT_MS}ms.`)),
    TIMEOUT_MS
  );
  const started = Date.now();
  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: configuration.reasoningEffort },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [{ role: "user", content: [{ type: "input_text", text: configuration.prompt }] }],
      text: {
        format: {
          type: "json_schema",
          name: configuration.schemaName,
          strict: true,
          schema: configuration.jsonSchema
        }
      }
    }, { signal: controller.signal, maxRetries: AUTOMATIC_RETRIES });
    if (response.status !== "completed" || !response.output_text?.trim()) {
      throw new Error(`Configuration ${configuration.id} returned ${response.status}: ${response.incomplete_details?.reason || "missing output"}.`);
    }
    const options = configuration.parse(JSON.parse(response.output_text));
    const inputTokens = response.usage?.input_tokens || 0;
    const cachedInputTokens = response.usage?.input_tokens_details?.cached_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    results.push({
      id: configuration.id,
      label: configuration.label,
      editorialReasoningEffort: configuration.reasoningEffort,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens || 0
      },
      estimatedCostUsd: calculateCost(
        { inputTokens, cachedInputTokens, outputTokens },
        pricingFor(MODEL)
      ),
      responseId: response.id,
      responseStatus: response.status,
      options,
      validation: diagnostics(options),
      rawResponse: response
    });
  } catch (error) {
    results.push({
      id: configuration.id,
      label: configuration.label,
      editorialReasoningEffort: configuration.reasoningEffort,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

const artifact = {
  experiment: "step5-editorial-comparison-abc",
  createdAt: new Date().toISOString(),
  sourceArtifact: SOURCE_ARTIFACT,
  originalEnglishRefrain: refrainBudget.sourceRefrain,
  sourceTexts: source,
  visualContexts,
  cachedPrivateCandidates,
  constants: {
    model: MODEL,
    timeoutMsPerCall: TIMEOUT_MS,
    maxOutputTokensPerCall: MAX_OUTPUT_TOKENS,
    automaticRetries: AUTOMATIC_RETRIES,
    maximumEstimatedCostUsd: MAX_ESTIMATED_COST_USD
  },
  prompts: {
    current: currentPrompt,
    revisedNativeEditor: revisedPrompt
  },
  results
};
const directory = resolve("artifacts/live-step5-editorial-comparison");
await mkdir(directory, { recursive: true });
const path = resolve(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(path, JSON.stringify(artifact, null, 2));
process.stdout.write(`${JSON.stringify({ artifact: path, results }, null, 2)}\n`);
