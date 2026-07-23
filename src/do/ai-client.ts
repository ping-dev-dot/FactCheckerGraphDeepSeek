/**
 * AI Client — Effect service wrapping the Vercel AI SDK directly with AI Gateway.
 * Uses @ai-sdk/openai-compatible pointed at the DeepSeek Gateway endpoint.
 */

import { Context, Effect, Layer } from "effect";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText } from "ai";

// ── Service Tag ──

export interface AiClientShape {
  readonly generateText: (params: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }) => Effect.Effect<string, AiClientError>;
  readonly streamText: (params: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }) => AsyncGenerator<string, void, unknown>;
}

export class DeepSeekClient extends Context.Tag("DeepSeekClient")<
  DeepSeekClient,
  AiClientShape
>() {}

// ── Error ──

export class AiClientError extends Error {
  readonly _tag = "AiClientError";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AiClientError";
  }
}

// ── Factory ──

// Cloudflare account ID — routes AI Gateway requests to the correct account
const CF_ACCOUNT_ID = "ce6ed2c0c296f91487c51bff4c8133e0";
const GATEWAY_URL =
  `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/fact-checker/deepseek`;

export function makeAiClient(cfAigToken: string): AiClientShape {
  const provider = createOpenAICompatible({
    baseURL: GATEWAY_URL,
    headers: { "cf-aig-authorization": `Bearer ${cfAigToken}` },
    name: "deepseek-gateway",
  });
  const model = provider.chatModel("deepseek-chat");

  return {
    generateText: ({ system, prompt, maxTokens = 4096 }) =>
      Effect.tryPromise({
        try: async () => {
          const { text } = await generateText({
            model,
            system,
            prompt,
            maxTokens,
          });
          return text;
        },
        catch: (err) =>
          new AiClientError(
            `AI Gateway generation failed: ${err instanceof Error ? err.message : String(err)}`,
            err
          ),
      }),

    streamText: async function* ({ system, prompt, maxTokens = 4096 }) {
      try {
        const { textStream } = streamText({
          model,
          system,
          prompt,
          maxTokens,
        });
        for await (const chunk of textStream) {
          yield chunk;
        }
      } catch (err) {
        throw new AiClientError(
          `AI Gateway streaming failed: ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }
    },
  };
}

// ── Layer ──

export const AiClientLive = (cfAigToken: string) =>
  Layer.succeed(DeepSeekClient, makeAiClient(cfAigToken));
