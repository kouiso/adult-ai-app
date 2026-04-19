// LLMのXML構造化出力をパースする
// プロンプトで<response><action>/<dialogue>/<inner>タグを強制し、
// 各セクションを独立して品質チェック・レンダリングできるようにする

export interface StructuredResponse {
  action: string;
  dialogue: string;
  inner: string;
  narration: string;
  remember: string[];
  raw: string;
}

// <response>タグを含むかどうかの軽量判定
export function isXmlResponse(text: string): boolean {
  return text.includes("<response>") && text.includes("</response>");
}

// XMLタグの中身を抽出（静的パターンで security/detect-non-literal-regexp 回避）
const TAG_PATTERNS: Record<string, RegExp> = {
  action: /<action>([\S\s]*?)<\/action>/,
  dialogue: /<dialogue>([\S\s]*?)<\/dialogue>/,
  inner: /<inner>([\S\s]*?)<\/inner>/,
  narration: /<narration>([\S\s]*?)<\/narration>/,
};
const REMEMBER_PATTERN = /<remember>([\S\s]*?)<\/remember>/g;

function extractTag(text: string, tag: string): string {
  const pattern = TAG_PATTERNS[tag];
  if (!pattern) return "";
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function extractRememberTags(text: string): string[] {
  return [...text.matchAll(REMEMBER_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((note) => note.length > 0);
}

export function stripRememberTags(text: string): string {
  return text.replace(REMEMBER_PATTERN, "").trim();
}

// ストリーミング表示用: 完全タグと未完了の開始タグを除去して生XML露出を防ぐ
export function stripXmlTagsStreaming(text: string): string {
  return text
    .replace(/<remember>[\S\s]*?<\/remember>/g, "")
    .replace(/<\/?(?:response|action|dialogue|inner|narration|remember)[^>]*>?/g, "")
    .replace(/<\/?res(?:p(?:o(?:n(?:s(?:e?)?)?)?)?)?$/g, "")
    .replace(/<\/?act(?:i(?:o(?:n?)?)?)?$/g, "")
    .replace(/<\/?dia(?:l(?:o(?:g(?:u(?:e?)?)?)?)?)?$/g, "")
    .replace(/<\/?inn(?:e(?:r?)?)?$/g, "")
    .replace(/<\/?nar(?:r(?:a(?:t(?:i(?:o(?:n?)?)?)?)?)?)?$/g, "")
    .replace(/<\/?rem(?:e(?:m(?:b(?:e(?:r?)?)?)?)?)?$/g, "")
    .trim();
}

// シーンフェーズ用: action + dialogue + inner の完全XML
export function parseXmlResponse(text: string): StructuredResponse | null {
  if (!isXmlResponse(text)) return null;

  const action = extractTag(text, "action");
  const dialogue = stripRememberTags(extractTag(text, "dialogue"));
  const inner = extractTag(text, "inner");
  const narration = extractTag(text, "narration");
  const remember = extractRememberTags(text);

  // dialogueは必須（会話フェーズでもdialogueだけは必要）
  if (!dialogue) return null;

  return { action, dialogue, inner, narration, remember, raw: text };
}

// XMLタグを除去してプレーンテキストに変換（品質チェック・TTS用）
export function stripXmlTags(text: string): string {
  return stripRememberTags(text)
    .replace(/<\/?(?:response|action|dialogue|inner|narration|remember)>/g, "")
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
