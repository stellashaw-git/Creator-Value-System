export interface OpenAIUsageLog {
  model: string;
  images_sent: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

/** Rough gpt-4o-mini list pricing — dev estimate only. */
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

export function estimateOpenAICostUsd(
  inputTokens: number,
  outputTokens: number
): number {
  return inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
}

export function buildUsageLog(
  model: string,
  imagesSent: number,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number
): OpenAIUsageLog {
  return {
    model,
    images_sent: imagesSent,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: Number(
      estimateOpenAICostUsd(inputTokens, outputTokens).toFixed(6)
    ),
  };
}

export function logExtractionUsage(usage: OpenAIUsageLog): void {
  console.log("[extract-screenshot] openai usage", usage);
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[extract-screenshot] estimated cost: $${usage.estimated_cost_usd.toFixed(4)} USD`
    );
  }
}
