import { describe, expect, it } from "vitest";

import { buildMessageSearchSnippet } from "./message-search";

describe("buildMessageSearchSnippet", () => {
  it("keeps short matching content unchanged", () => {
    expect(buildMessageSearchSnippet("hello search result", "search")).toBe("hello search result");
  });

  it("centers long snippets around the matched query", () => {
    const content = `${"a".repeat(120)}target${"b".repeat(120)}`;
    const snippet = buildMessageSearchSnippet(content, "target", 80);

    expect(snippet).toContain("target");
    expect(snippet.startsWith("...")).toBe(true);
    expect(snippet.endsWith("...")).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(86);
  });

  it("normalizes whitespace before truncating", () => {
    expect(buildMessageSearchSnippet("alpha\n\n  beta\tgamma", "beta")).toBe("alpha beta gamma");
  });
});
