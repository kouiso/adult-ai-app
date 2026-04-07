// LLMのXML構造化出力をパースする
// プロンプトで<response><action>/<dialogue>/<inner>タグを強制し、
// 各セクションを独立して品質チェック・レンダリングできるようにする

export interface StructuredResponse {
  action: string;
  dialogue: string;
  inner: string;
  raw: string;
}

// XMLタグの中身を抽出（最初のマッチのみ）
function extractTag(text: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const match = text.match(re);
  return match ? match[1].trim() : "";
}

// シーンフェーズ用: action + dialogue + inner の完全XML
export function parseXmlResponse(text: string): StructuredResponse | null {
  if (!isXmlResponse(text)) return null;

  const action = extractTag(text, "action");
  const dialogue = extractTag(text, "dialogue");
  const inner = extractTag(text, "inner");

  // dialogueは必須（会話フェーズでもdialogueだけは必要）
  if (!dialogue) return null;

  return { action, dialogue, inner, raw: text };
}

// <response>タグを含むかどうかの軽量判定
export function isXmlResponse(text: string): boolean {
  return text.includes("<response>") && text.includes("</response>");
}

// XMLタグを除去してプレーンテキストに変換（品質チェック・TTS用）
export function stripXmlTags(text: string): string {
  return text
    .replace(/<\/?(?:response|action|dialogue|inner)>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
