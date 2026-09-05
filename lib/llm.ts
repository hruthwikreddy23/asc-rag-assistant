// The ONLY module in this codebase allowed to select/import a provider adapter.
// app/api/chat/route.ts and lib/guardrails.ts must call getLlmClient() from here —
// never import @anthropic-ai/sdk or openai directly elsewhere.

export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResponse {
  text: string;
  provider: "anthropic" | "openai";
  model: string;
}

export interface LlmClient {
  complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

export type LlmProvider = "anthropic" | "openai";

export function getLlmClient(): LlmClient {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic") as LlmProvider;

  if (provider === "openai") {
    const { OpenAiClient } = require("./llm-openai") as typeof import("./llm-openai");
    return new OpenAiClient();
  }

  if (provider === "anthropic") {
    const { AnthropicClient } = require("./llm-anthropic") as typeof import("./llm-anthropic");
    return new AnthropicClient();
  }

  throw new Error(
    `Unknown LLM_PROVIDER "${provider}". Expected "anthropic" or "openai".`
  );
}
