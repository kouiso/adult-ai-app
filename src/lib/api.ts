function parseSseChunk(data: string): string | "[DONE]" | null {
  if (data === "[DONE]") return "[DONE]";
  try {
    const parsed: { choices?: Array<{ delta?: { content?: string } }> } = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    // SSEストリームでの不完全なJSONチャンクは正常の範囲なので次へ進む
    return null;
  }
}

async function processStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const result = parseSseChunk(line.slice(6).trim());
      if (result === "[DONE]") {
        onDone();
        return;
      }
      if (result) onChunk(result);
    }
  }
  onDone();
}

export async function streamChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model }),
    });

    if (!response.ok || !response.body) {
      onError(await response.text());
      return;
    }

    await processStream(response.body, onChunk, onDone);
  } catch (err) {
    onError(String(err));
  }
}

export async function generateImage(
  prompt: string,
): Promise<{ task_id: string } | { error: string }> {
  try {
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negative_prompt: "ugly, deformed, blurry, low quality, text, watermark",
        width: 512,
        height: 768,
      }),
    });
    if (!response.ok) {
      return { error: await response.text() };
    }
    return response.json();
  } catch (err) {
    return { error: String(err) };
  }
}

type NovitaTaskStatus =
  | "TASK_STATUS_QUEUED"
  | "TASK_STATUS_PROCESSING"
  | "TASK_STATUS_SUCCEED"
  | "TASK_STATUS_FAILED"
  | "TASK_STATUS_CANCELED";

interface NovitaTaskResult {
  task: {
    task_id: string;
    status: NovitaTaskStatus;
    progress_percent: number;
  };
  images?: { image_url: string; image_url_ttl: number }[];
}

export async function getImageTaskResult(taskId: string): Promise<NovitaTaskResult> {
  const response = await fetch(`/api/image/task/${encodeURIComponent(taskId)}`);
  if (!response.ok) {
    throw new Error(`task result fetch failed: ${response.status}`);
  }
  return response.json();
}
