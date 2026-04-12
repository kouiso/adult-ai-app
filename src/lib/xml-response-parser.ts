// LLMのXML構造化出力をパースする
// プロンプトで<response><action>/<dialogue>/<inner>タグを強制し、
// 各セクションを独立して品質チェック・レンダリングできるようにする

export interface StructuredResponse {
  action: string;
  dialogue: string;
  inner: string;
  narration: string;
  raw: string;
}

// <response>タグを含むかどうかの軽量判定
export function isXmlResponse(text: string): boolean {
  return text.includes("<response>") && text.includes("</response>");
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
  const narration = extractTag(text, "narration");

  // dialogueは必須（会話フェーズでもdialogueだけは必要）
  if (!dialogue) return null;

  return { action, dialogue, inner, narration, raw: text };
}

// XMLタグを除去してプレーンテキストに変換（品質チェック・TTS用）
export function stripXmlTags(text: string): string {
  return text
    .replace(/<\/?(?:response|action|dialogue|inner|narration)>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// モデルがXMLラッパーを省略したプレーン応答を<response><dialogue>でラップする
// 会話フェーズ限定の救済策。シーンフェーズは<action>/<inner>必須のため適用しない
// 理由: 会話フェーズの「平文対話」は意味的にdialogue相当であり、
// XMLラッパーは構造オーバーヘッドにすぎない。救済せずリトライ枯渇で送信エラー
// にするのはUXとして致命的
export function wrapConversationPlainAsXml(text: string): string {
  if (isXmlResponse(text)) return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return text;
  // 裸の<dialogue>タグだけ出力された場合も救済
  const dialogueOnly = trimmed.match(/^<dialogue>([\S\s]*?)<\/dialogue>$/);
  if (dialogueOnly) {
    return `<response><dialogue>${dialogueOnly[1].trim()}</dialogue></response>`;
  }
  return `<response><dialogue>${trimmed}</dialogue></response>`;
}
