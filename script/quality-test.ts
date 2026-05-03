/**
 * API-based quality test runner
 * ブラウザ不要でチャット品質＋画像生成をテストする CLI ツール
 *
 * Usage: npx tsx script/quality-test.ts <scenario.json>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ── 型定義 ────────────────────────────────────────────────────────────────

type ScenarioTurn = {
  user: string;
  generateImage: boolean;
};

type ScenarioFile = {
  name: string;
  character: {
    systemPrompt: string;
    name: string;
  };
  turns: ScenarioTurn[];
  model: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type JudgeResult = {
  pass: boolean;
  reason?: string;
};

type ImageTaskStatus =
  | "TASK_STATUS_QUEUED"
  | "TASK_STATUS_PROCESSING"
  | "TASK_STATUS_SUCCEED"
  | "TASK_STATUS_FAILED"
  | "TASK_STATUS_CANCELED";

type TurnResult = {
  turnIndex: number;
  userMessage: string;
  assistantResponse: string;
  phase: string;
  judge?: JudgeResult;
  image?: { taskId: string; url?: string; error?: string };
  durationMs: number;
};

type Counters = { pass: number; fail: number; skip: number };

// ── 環境変数読み込み ──────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

function loadDevVars(): Record<string, string> {
  const devVarsPath = path.join(PROJECT_ROOT, ".dev.vars");
  if (!existsSync(devVarsPath)) return {};
  const content = readFileSync(devVarsPath, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ── SSE パース ──────────────────────────────────────────────────────────

function parseSseChunk(data: string): string | null {
  if (data === "[DONE]") return null;
  try {
    const parsed: { choices?: Array<{ delta?: { content?: string } }> } = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

async function streamChatApi(
  baseUrl: string,
  messages: ChatMessage[],
  model: string,
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`chat API failed: ${response.status} ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const chunk = parseSseChunk(line.slice(6).trim());
      if (chunk) accumulated += chunk;
    }
  }

  return accumulated;
}

// ── Judge API ──────────────────────────────────────────────────────────

async function callJudge(
  baseUrl: string,
  response: string,
  previousResponse: string | undefined,
  phase: string,
): Promise<JudgeResult> {
  const res = await fetch(`${baseUrl}/api/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response, previousResponse, phase }),
  });

  if (!res.ok) {
    return { pass: false, reason: `judge API error: ${res.status}` };
  }

  return (await res.json()) as JudgeResult;
}

// ── Image API ────────────────────────────────────────────────────────

async function requestImageGeneration(
  baseUrl: string,
  prompt: string,
  characterDescription: string,
  phase: string,
): Promise<{ task_id: string } | { error: string }> {
  const res = await fetch(`${baseUrl}/api/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      characterDescription,
      negative_prompt: "ugly, deformed, blurry, low quality, text, watermark",
      width: 768,
      height: 1024,
      phase,
    }),
  });

  if (!res.ok) return { error: `image API error: ${res.status}` };
  return (await res.json()) as { task_id: string } | { error: string };
}

async function pollImageTask(
  baseUrl: string,
  taskId: string,
  maxWaitMs = 120_000,
): Promise<{ url?: string; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${baseUrl}/api/image/task/${encodeURIComponent(taskId)}`);
    if (!res.ok) return { error: `task poll failed: ${res.status}` };

    const data = (await res.json()) as {
      task: { status: ImageTaskStatus };
      images?: Array<{ image_url: string }>;
    };

    if (data.task.status === "TASK_STATUS_SUCCEED") {
      return { url: data.images?.[0]?.image_url };
    }
    if (data.task.status === "TASK_STATUS_FAILED" || data.task.status === "TASK_STATUS_CANCELED") {
      return { error: `task ${data.task.status}` };
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
  return { error: "timeout" };
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);
}

// ── フェーズ推定 ─────────────────────────────────────────────────────

function estimatePhase(turnIndex: number, totalTurns: number): string {
  const ratio = turnIndex / totalTurns;
  if (ratio < 0.3) return "conversation";
  if (ratio < 0.5) return "intimate";
  if (ratio < 0.8) return "erotic";
  if (ratio < 0.95) return "climax";
  return "afterglow";
}

// ── ターン処理 ──────────────────────────────────────────────────────────

async function judgeResponse(
  baseUrl: string,
  assistantResponse: string,
  messages: ChatMessage[],
  phase: string,
  counters: Counters,
): Promise<JudgeResult | undefined> {
  if (phase !== "erotic" && phase !== "climax") {
    counters.skip++;
    return undefined;
  }

  const prevAssistant = messages.filter((m) => m.role === "assistant").slice(-2, -1)[0]?.content;
  try {
    const judgeResult = await callJudge(baseUrl, assistantResponse, prevAssistant, phase);
    if (judgeResult.pass) {
      counters.pass++;
      console.info(`  Judge: PASS`);
    } else {
      counters.fail++;
      console.info(`  Judge: FAIL — ${judgeResult.reason}`);
    }
    return judgeResult;
  } catch (err) {
    console.error(`  Judge error: ${err}`);
    counters.skip++;
    return undefined;
  }
}

async function handleImageGeneration(
  baseUrl: string,
  assistantResponse: string,
  characterName: string,
  phase: string,
  outputDir: string,
  turnIndex: number,
): Promise<TurnResult["image"]> {
  console.info(`  Generating image...`);
  const imgResult = await requestImageGeneration(
    baseUrl,
    assistantResponse.slice(0, 500),
    characterName,
    phase,
  );

  if ("error" in imgResult) {
    console.info(`  Image: ERROR — ${imgResult.error}`);
    return { taskId: "", error: imgResult.error };
  }

  const pollResult = await pollImageTask(baseUrl, imgResult.task_id);
  if (pollResult.url) {
    const imgPath = path.join(outputDir, `turn-${turnIndex}.png`);
    try {
      await downloadImage(pollResult.url, imgPath);
      console.info(`  Image: saved → ${imgPath}`);
    } catch (err) {
      console.error(`  Image download failed: ${err}`);
    }
  } else {
    console.info(`  Image: ${pollResult.error}`);
  }

  return { taskId: imgResult.task_id, url: pollResult.url, error: pollResult.error };
}

// ── レポート生成 ─────────────────────────────────────────────────────

function generateReport(
  scenario: ScenarioFile,
  baseUrl: string,
  results: TurnResult[],
  counters: Counters,
): string {
  const totalJudged = counters.pass + counters.fail;
  const passRate = totalJudged > 0 ? ((counters.pass / totalJudged) * 100).toFixed(1) : "N/A";

  const lines: string[] = [
    `# Quality Test Report`,
    ``,
    `- **Scenario**: ${scenario.name}`,
    `- **Model**: ${scenario.model}`,
    `- **Character**: ${scenario.character.name}`,
    `- **Date**: ${new Date().toISOString()}`,
    `- **Target**: ${baseUrl}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total turns | ${scenario.turns.length} |`,
    `| Judged turns | ${totalJudged} |`,
    `| PASS | ${counters.pass} |`,
    `| FAIL | ${counters.fail} |`,
    `| Skip (non-erotic) | ${counters.skip} |`,
    `| Pass rate | ${passRate}% |`,
    `| Images generated | ${results.filter((r) => r.image?.url).length} |`,
    ``,
    `## Turn Details`,
    ``,
  ];

  for (const r of results) {
    lines.push(`### Turn ${r.turnIndex} (${r.phase}, ${r.durationMs}ms)`);
    lines.push(``);
    lines.push(`**User**: ${r.userMessage}`);
    lines.push(``);
    lines.push(`**Assistant** (${r.assistantResponse.length} chars):`);
    lines.push("```");
    lines.push(r.assistantResponse.slice(0, 500));
    lines.push("```");
    if (r.judge) {
      const verdict = r.judge.pass ? "PASS" : "FAIL";
      const reason = r.judge.reason ? ` — ${r.judge.reason}` : "";
      lines.push(`**Judge**: ${verdict}${reason}`);
    }
    if (r.image) {
      const status = r.image.url ? `saved (${r.image.taskId})` : (r.image.error ?? "N/A");
      lines.push(`**Image**: ${status}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

// ── メイン実行 ──────────────────────────────────────────────────────────

async function runTurns(
  scenario: ScenarioFile,
  baseUrl: string,
  outputDir: string,
): Promise<{ results: TurnResult[]; counters: Counters }> {
  const messages: ChatMessage[] = [{ role: "system", content: scenario.character.systemPrompt }];
  const results: TurnResult[] = [];
  const counters: Counters = { pass: 0, fail: 0, skip: 0 };

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    if (!turn) continue;
    const turnIndex = i + 1;
    const phase = estimatePhase(turnIndex, scenario.turns.length);
    const startTime = Date.now();

    console.info(
      `[${turnIndex}/${scenario.turns.length}] "${turn.user.slice(0, 30)}..." (phase: ${phase})`,
    );

    messages.push({ role: "user", content: turn.user });

    let assistantResponse: string;
    try {
      assistantResponse = await streamChatApi(baseUrl, messages, scenario.model);
    } catch (err) {
      console.error(`  ERROR: ${err}`);
      results.push({
        turnIndex,
        userMessage: turn.user,
        assistantResponse: "",
        phase,
        durationMs: Date.now() - startTime,
      });
      counters.fail++;
      continue;
    }

    messages.push({ role: "assistant", content: assistantResponse });
    console.info(`  Response: ${assistantResponse.slice(0, 80)}...`);

    const result: TurnResult = {
      turnIndex,
      userMessage: turn.user,
      assistantResponse,
      phase,
      durationMs: Date.now() - startTime,
    };
    result.judge = await judgeResponse(baseUrl, assistantResponse, messages, phase, counters);

    if (turn.generateImage) {
      result.image = await handleImageGeneration(
        baseUrl,
        assistantResponse,
        scenario.character.name,
        phase,
        outputDir,
        turnIndex,
      );
    }

    results.push(result);
  }

  return { results, counters };
}

async function run() {
  const scenarioPath = process.argv[2];
  if (!scenarioPath) {
    console.error("Usage: npx tsx script/quality-test.ts <scenario.json>");
    process.exit(1);
  }

  const scenario: ScenarioFile = JSON.parse(readFileSync(scenarioPath, "utf-8"));
  const devVars = loadDevVars();
  const baseUrl =
    process.env.QUALITY_TEST_BASE_URL ?? devVars.QUALITY_TEST_BASE_URL ?? "http://localhost:8788";

  console.info(`\n=== Quality Test: ${scenario.name} ===`);
  console.info(`Model: ${scenario.model}`);
  console.info(`Turns: ${scenario.turns.length}`);
  console.info(`Target: ${baseUrl}\n`);

  const outputDir = "/tmp/quality-test-images";
  const reportPath = "/tmp/quality-test-report.md";
  mkdirSync(outputDir, { recursive: true });

  const { results, counters } = await runTurns(scenario, baseUrl, outputDir);

  const report = generateReport(scenario, baseUrl, results, counters);
  writeFileSync(reportPath, report, "utf-8");

  const totalJudged = counters.pass + counters.fail;
  const passRate = totalJudged > 0 ? ((counters.pass / totalJudged) * 100).toFixed(1) : "N/A";

  console.info(`\n=== Results ===`);
  console.info(`Pass: ${counters.pass} / Fail: ${counters.fail} / Skip: ${counters.skip}`);
  console.info(`Pass rate: ${passRate}%`);
  console.info(`Report: ${reportPath}`);
  console.info(`Images: ${outputDir}`);

  process.exit(counters.fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
