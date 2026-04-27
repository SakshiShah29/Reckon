import type { FillRecord } from "@reckon-protocol/types";
import { PRIMARY_MODEL, FALLBACK_MODEL } from "@reckon-protocol/types";

interface TriageResult {
  score: number; // 0-1, higher = more suspicious
  model: string;
  rawResponse: string;
}

interface SlashExplanation {
  explanation: string;
  model: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0G SDK types are loosely typed
export type ComputeBroker = any;

/**
 * Runs suspicion triage via 0G Compute (Qwen3-32B).
 * Scores a fill 0-1 on suspicion before running expensive EBBO computation.
 *
 * On parse failure → defaults to 0.5 (proceed to deterministic math).
 * On provider offline → defaults to 0.5 (never blocks the pipeline).
 */
export async function runSuspicionTriage(
  fill: FillRecord,
  providerAddress: string,
  broker: ComputeBroker,
): Promise<TriageResult> {
  const prompt = buildTriagePrompt(fill);

  try {
    const meta = await broker.inference.getServiceMetadata(providerAddress);
    const headers = await broker.inference.getRequestHeaders(
      providerAddress,
      prompt,
    );

    // Use OpenAI SDK compatibility
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey: "app-sk-not-used", // broker headers carry the auth
      baseURL: `${meta.endpoint}/v1/proxy`,
      defaultHeaders: headers,
    });

    let model: string = PRIMARY_MODEL;
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: PRIMARY_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 64,
        temperature: 0.1,
      });
    } catch {
      // Fallback to smaller model
      model = FALLBACK_MODEL;
      completion = await openai.chat.completions.create({
        model: FALLBACK_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 64,
        temperature: 0.1,
      });
    }

    // Settle payment
    await broker.inference.processResponse(providerAddress, completion);

    const rawResponse = completion.choices[0]?.message?.content ?? "";
    const score = parseTriageScore(rawResponse);

    return { score, model, rawResponse };
  } catch (err) {
    // Provider offline or other failure — default to 0.5
    console.warn(
      `[triage] 0G Compute unavailable, defaulting to 0.5: ${err instanceof Error ? err.message : err}`,
    );
    return { score: 0.5, model: "fallback", rawResponse: "provider_offline" };
  }
}

/**
 * Generates a natural-language explanation for a successful slash.
 * Purely cosmetic — never blocks the slash itself.
 */
export async function generateSlashExplanation(
  fill: FillRecord,
  benchmarkPrice: string,
  actualPrice: string,
  shortfallPct: string,
  providerAddress: string,
  broker: ComputeBroker,
): Promise<SlashExplanation> {
  const prompt = buildExplanationPrompt(
    fill,
    benchmarkPrice,
    actualPrice,
    shortfallPct,
  );

  try {
    const meta = await broker.inference.getServiceMetadata(providerAddress);
    const headers = await broker.inference.getRequestHeaders(
      providerAddress,
      prompt,
    );

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey: "app-sk-not-used",
      baseURL: `${meta.endpoint}/v1/proxy`,
      defaultHeaders: headers,
    });

    let model: string = PRIMARY_MODEL;
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: PRIMARY_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
        temperature: 0.3,
      });
    } catch {
      model = FALLBACK_MODEL;
      completion = await openai.chat.completions.create({
        model: FALLBACK_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 256,
        temperature: 0.3,
      });
    }

    await broker.inference.processResponse(providerAddress, completion);

    const explanation = completion.choices[0]?.message?.content ?? "";
    return { explanation, model };
  } catch {
    // Fallback to template string
    return {
      explanation: buildTemplateExplanation(
        fill,
        benchmarkPrice,
        actualPrice,
        shortfallPct,
      ),
      model: "template",
    };
  }
}

function buildTriagePrompt(fill: FillRecord): string {
  return `You are an EBBO (Execution Best Bid Offer) analyst for DeFi solver fills.
Score the following fill on a scale of 0.0 to 1.0 where:
- 0.0 = fill looks normal, unlikely to be slashable
- 1.0 = fill looks highly suspicious, likely slashable

Output ONLY a decimal number between 0.0 and 1.0 on the first line.

Fill details:
- Order hash: ${fill.orderHash}
- Filler: ${fill.fillerNamehash}
- Input amount: ${fill.inputAmount} (token: ${fill.tokenIn})
- Output amount: ${fill.outputAmount} (token: ${fill.tokenOut})
- EBBO tolerance: ${fill.eboToleranceBps} bps
- Fill block: ${fill.fillBlock}`;
}

function buildExplanationPrompt(
  fill: FillRecord,
  benchmarkPrice: string,
  actualPrice: string,
  shortfallPct: string,
): string {
  return `Write a one-sentence human-readable explanation for why this DeFi solver fill was slashed.

Fill details:
- Solver: ${fill.fillerNamehash}
- Input: ${fill.inputAmount} of ${fill.tokenIn}
- Output: ${fill.outputAmount} of ${fill.tokenOut}
- EBBO benchmark price: ${benchmarkPrice}
- Actual execution price: ${actualPrice}
- Shortfall: ${shortfallPct}% beyond the ${fill.eboToleranceBps / 100}% tolerance

Write a clear, factual one-sentence explanation suitable for a dashboard.`;
}

function buildTemplateExplanation(
  fill: FillRecord,
  benchmarkPrice: string,
  actualPrice: string,
  shortfallPct: string,
): string {
  return `Solver ${fill.fillerNamehash} was slashed because the EBBO benchmark of ${benchmarkPrice} exceeded their fill price of ${actualPrice} by ${shortfallPct}%, beyond the swapper's ${fill.eboToleranceBps / 100}% tolerance.`;
}

/**
 * Parse triage score from LLM response.
 * Regex: first line, a number 0-1. On failure, default to 0.5.
 */
function parseTriageScore(raw: string): number {
  const match = raw.match(/^\s*([01](?:\.\d+)?)/m);
  if (!match) return 0.5;
  const score = parseFloat(match[1]);
  if (isNaN(score) || score < 0 || score > 1) return 0.5;
  return score;
}
