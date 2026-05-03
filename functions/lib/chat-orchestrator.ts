import { z } from "zod/v4";

import {
  runServerQualityChecks,
  type QualityCheckContext,
  type ScenePhase,
} from "./quality-checks";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type OpenRouterChatRequester = (
  apiKey: string,
  appOrigin: string,
  model: string,
  phase: ScenePhase,
  messages: ChatMessage[],
) => Promise<{ response: Response; usedModel: string }>;

export type MessageAugmenter = (messages: ChatMessage[], phase: ScenePhase) => ChatMessage[];

export interface OrchestrateChatParams {
  messages: ChatMessage[];
  model: string;
  phase: ScenePhase;
  qualityContext?: { prevTexts?: string[] };
  openRouterApiKey: string;
  appOrigin: string;
  claudeSessionToken?: string;
  requestOpenRouterChat: OpenRouterChatRequester;
  augmentMessages: MessageAugmenter;
}

export interface OrchestratedChat {
  stream: ReadableStream<Uint8Array>;
  usedModel: string;
}

const MAX_QUALITY_RETRIES = 3;
const SSE_TEXT_CHUNK_SIZE = 80;

const JUDGE_SYSTEM_PROMPT = `You are a quality judge for Japanese erotic roleplay responses. Evaluate the response and return ONLY a JSON object.

Criteria:
1. VARIETY: Response must differ substantially from prevResponse (if provided). Same phrases/structure = FAIL.
2. SPECIFICITY: For erotic/climax/intimate phases, response must include concrete sensory details (body parts, sensations, movements). Vague or euphemistic = FAIL.
3. CHARACTER_VOICE: Response must maintain consistent Japanese character voice throughout. Breaking character or using meta-language = FAIL.
4. COHERENCE: Response must be well-structured and narratively coherent.

Return EXACTLY this JSON (no markdown, no explanation):
{"passed": true/false, "reason": "one-line-explanation"}

If ALL criteria pass, return {"passed": true, "reason": "ok"}.
If ANY criterion fails, return {"passed": false, "reason": "<CRITERION>: <brief explanation>"}.`;

const judgeResultSchema = z.object({
  passed: z.boolean(),
  reason: z.string(),
});

type JudgeResult = z.infer<typeof judgeResultSchema>;

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
}

function parseOpenRouterSseLine(data: string): string | "[DONE]" | null {
  if (data === "[DONE]") return "[DONE]";
  try {
    const parsed: { choices?: Array<{ delta?: { content?: string } }> } = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch (error) {
    console.error("failed to parse OpenRouter SSE line", error);
    return null;
  }
}

function appendSseLine(line: string, accumulated: string): string | null {
  if (!line.startsWith("data: ")) return accumulated;
  const parsed = parseOpenRouterSseLine(line.slice(6).trim());
  if (parsed === "[DONE]") return null;
  return parsed ? accumulated + parsed : accumulated;
}

function appendSseLines(lines: string[], accumulated: string): string | null {
  let nextAccumulated = accumulated;
  for (const line of lines) {
    const next = appendSseLine(line, nextAccumulated);
    if (next === null) return null;
    nextAccumulated = next;
  }
  return nextAccumulated;
}

async function collectOpenRouterText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      const next = appendSseLines(lines, accumulated);
      if (next === null) return accumulated;
      accumulated = next;
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

function streamBufferedTextAsSse(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const characters = Array.from(text);
      for (let index = 0; index < characters.length; index += SSE_TEXT_CHUNK_SIZE) {
        const content = characters.slice(index, index + SSE_TEXT_CHUNK_SIZE).join("");
        const payload = JSON.stringify({ choices: [{ delta: { content } }] });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function buildRetryMessages(
  originalMessages: ChatMessage[],
  lastResponse: string,
  failedReason: string,
): ChatMessage[] {
  return [
    ...originalMessages,
    { role: "assistant", content: lastResponse },
    {
      role: "user",
      content:
        `前回の応答は品質基準を満たしませんでした。理由: ${failedReason}。` +
        "改善して再度応答してください。<response><action>...</action><dialogue>...</dialogue><inner>...</inner></response> のXML形式を守り、日本語のみで返答してください。",
    },
  ];
}

async function runClaudeJudge(
  token: string | undefined,
  responseText: string,
  phase: ScenePhase,
  previousResponse: string,
): Promise<JudgeResult> {
  if (!token) return { passed: true, reason: "judge-unavailable" };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Phase: ${phase}

Previous response:
${previousResponse || "(none)"}

Current response to judge:
${responseText}`,
          },
        ],
      }),
    });

    if (!response.ok) return { passed: true, reason: "judge-error" };

    const message: AnthropicMessage = await response.json();
    const text = message.content[0]?.text;
    if (!text) return { passed: true, reason: "judge-error" };

    const parsed = judgeResultSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : { passed: true, reason: "judge-error" };
  } catch (error) {
    console.error("Claude judge failed", error);
    return { passed: true, reason: "judge-error" };
  }
}

function shouldRunClaudeJudge(phase: ScenePhase): boolean {
  return phase === "erotic" || phase === "climax";
}

async function requestAttempt(
  params: OrchestrateChatParams,
  messages: ChatMessage[],
): Promise<{ text: string; usedModel: string }> {
  const { response, usedModel } = await params.requestOpenRouterChat(
    params.openRouterApiKey,
    params.appOrigin,
    params.model,
    params.phase,
    params.augmentMessages(messages, params.phase),
  );
  if (!response.ok || !response.body) throw new Error("upstream service error");
  return { text: await collectOpenRouterText(response.body), usedModel };
}

async function directProxyConversation(params: OrchestrateChatParams): Promise<OrchestratedChat> {
  const { response, usedModel } = await params.requestOpenRouterChat(
    params.openRouterApiKey,
    params.appOrigin,
    params.model,
    params.phase,
    params.augmentMessages(params.messages, params.phase),
  );
  if (!response.ok || !response.body) throw new Error("upstream service error");
  return { stream: response.body, usedModel };
}

async function evaluateAttempt(
  params: OrchestrateChatParams,
  text: string,
  qualityContext: QualityCheckContext,
): Promise<{ passed: true } | { passed: false; reason: string }> {
  const deterministic = runServerQualityChecks(text, qualityContext);
  if (!deterministic.passed) {
    return { passed: false, reason: deterministic.failedCheck ?? "quality-check" };
  }
  if (!shouldRunClaudeJudge(params.phase)) return { passed: true };

  const judge = await runClaudeJudge(
    params.claudeSessionToken,
    text,
    params.phase,
    qualityContext.prevTexts?.at(-1) ?? "",
  );
  return judge.passed
    ? { passed: true }
    : { passed: false, reason: `claude-judge: ${judge.reason}` };
}

export async function orchestrateChat(params: OrchestrateChatParams): Promise<OrchestratedChat> {
  if (params.phase === "conversation") return directProxyConversation(params);

  const qualityContext: QualityCheckContext = {
    phase: params.phase,
    prevTexts: params.qualityContext?.prevTexts?.filter((text) => text.trim().length > 0) ?? [],
  };
  let attemptMessages = params.messages;
  let bestText = "";
  let usedModel = params.model;
  let lastFailure = "unknown";

  for (let attempt = 0; attempt <= MAX_QUALITY_RETRIES; attempt += 1) {
    const result = await requestAttempt(params, attemptMessages);
    bestText = result.text;
    usedModel = result.usedModel;

    const evaluation = await evaluateAttempt(params, result.text, qualityContext);
    console.info(
      `[server-quality] attempt=${attempt} phase=${params.phase} passed=${evaluation.passed} reason=${evaluation.passed ? "ok" : evaluation.reason}`,
    );
    if (evaluation.passed) return { stream: streamBufferedTextAsSse(result.text), usedModel };

    lastFailure = evaluation.reason;
    attemptMessages = buildRetryMessages(params.messages, result.text, lastFailure);
  }

  console.warn(
    `[server-quality] retries exhausted phase=${params.phase} lastFailure=${lastFailure}`,
  );
  return { stream: streamBufferedTextAsSse(bestText), usedModel };
}
