import OpenAI from "openai";
import type { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "./llm";

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAiClient implements LlmClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your .env.local (see .env.example)."
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
      messages: [
        { role: "system", content: req.system },
        ...req.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";

    return { text, provider: "openai", model: this.model };
  }
}
