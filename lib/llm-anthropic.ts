import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmCompletionRequest, LlmCompletionResponse, LlmMessage } from "./llm";

const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicClient implements LlmClient {
  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env.local (see .env.example)."
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    // `temperature` is intentionally omitted: it's deprecated/rejected for the
    // Claude 5 model family (e.g. claude-sonnet-5) and the API 400s if it's sent.
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: req.messages
        .filter((m): m is LlmMessage & { role: "user" | "assistant" } => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return { text, provider: "anthropic", model: this.model };
  }
}
