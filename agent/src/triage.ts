import type { FillRecord } from "@reckon-protocol/types";
import { PRIMARY_MODEL } from "@reckon-protocol/types";

interface TriageResult {
  score: number; // 0-1, higher = more suspicious
  model: string;
  rawResponse: string;
}

interface SlashExplanation {
  explanation: string;
  model: string;
}


const ZG_ROUTER_BASE_URL = "https://router-api-testnet.integratenetwork.work/v1";

export async function runSuspicionTriage(
  fill: FillRecord,
  apiKey: string,
): Promise<TriageResult> {
  const prompt = buildTriagePrompt(fill);

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey,
      baseURL: ZG_ROUTER_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 64,
      temperature: 0.1,
    });

    const rawResponse = completion.choices[0]?.message?.content ?? "";
    const score = parseTriageScore(rawResponse);

    return { score, model: PRIMARY_MODEL, rawResponse };
  } catch (err) {
    console.warn(
      `[triage] 0G Compute unavailable, defaulting to 0.5: ${err instanceof Error ? err.message : err}`,
    );
    return { score: 0.5, model: "fallback", rawResponse: "provider_offline" };
  }
}

export async function generateSlashExplanation(
  fill: FillRecord,
  benchmarkPrice: string,
  actualPrice: string,
  shortfallPct: string,
  apiKey: string,
): Promise<SlashExplanation> {
  const prompt = buildExplanationPrompt(
    fill,
    benchmarkPrice,
    actualPrice,
    shortfallPct,
  );

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey,
      baseURL: ZG_ROUTER_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
      temperature: 0.3,
    });

    const explanation = completion.choices[0]?.message?.content ?? "";
    return { explanation, model: PRIMARY_MODEL };
  } catch {
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

function parseTriageScore(raw: string): number {
  const match = raw.match(/^\s*([01](?:\.\d+)?)/m);
  if (!match) return 0.5;
  const score = parseFloat(match[1]);
  if (isNaN(score) || score < 0 || score > 1) return 0.5;
  return score;
}
