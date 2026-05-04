const SEARCH_SNIPPET_RADIUS = 64;

const normalizeSnippetText = (content: string) => content.replace(/\s+/g, " ").trim();

export function buildMessageSearchSnippet(content: string, query: string, maxLength = 160): string {
  const normalized = normalizeSnippetText(content);
  if (normalized.length <= maxLength) return normalized;

  const normalizedQuery = normalizeSnippetText(query).toLowerCase();
  const matchIndex = normalizedQuery ? normalized.toLowerCase().indexOf(normalizedQuery) : -1;
  const start = matchIndex === -1 ? 0 : Math.max(0, matchIndex - SEARCH_SNIPPET_RADIUS);
  const end = Math.min(normalized.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";

  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}
