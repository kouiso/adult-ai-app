import { describe, expect, it } from "vitest";

import {
  isXmlResponse,
  parseXmlResponse,
  stripRememberTags,
  stripXmlTagsStreaming,
  stripXmlTags,
  wrapConversationPlainAsXml,
} from "./xml-response-parser";

describe("isXmlResponse", () => {
  it("<response>タグを含む文字列を検出する", () => {
    expect(isXmlResponse("<response><dialogue>こんにちは</dialogue></response>")).toBe(true);
  });

  it("開始タグのみはfalse", () => {
    expect(isXmlResponse("<response>こんにちは")).toBe(false);
  });

  it("タグなしはfalse", () => {
    expect(isXmlResponse("こんにちは")).toBe(false);
  });
});

describe("parseXmlResponse", () => {
  it("dialogue + action + inner を正しくパースする", () => {
    const xml =
      "<response><action>*微笑む*</action><dialogue>「やあ」</dialogue><inner>嬉しい</inner></response>";
    const result = parseXmlResponse(xml);
    expect(result).not.toBeNull();
    expect(result?.action).toBe("*微笑む*");
    expect(result?.dialogue).toBe("「やあ」");
    expect(result?.inner).toBe("嬉しい");
  });

  it("dialogueのみでもパースできる", () => {
    const xml = "<response><dialogue>「こんにちは」</dialogue></response>";
    const result = parseXmlResponse(xml);
    expect(result).not.toBeNull();
    expect(result?.dialogue).toBe("「こんにちは」");
    expect(result?.action).toBe("");
    expect(result?.inner).toBe("");
  });

  it("dialogue がない場合は null", () => {
    const xml = "<response><action>*歩く*</action></response>";
    const result = parseXmlResponse(xml);
    expect(result).toBeNull();
  });

  it("XMLでない文字列は null", () => {
    expect(parseXmlResponse("普通のテキスト")).toBeNull();
  });

  it("narration タグもパースする", () => {
    const xml =
      "<response><dialogue>「ねえ」</dialogue><narration>彼女は振り返った</narration></response>";
    const result = parseXmlResponse(xml);
    expect(result?.narration).toBe("彼女は振り返った");
  });

  it("単一のrememberタグを抽出しdialogueから除去する", () => {
    const xml =
      "<response><dialogue>「またカフェ行こ」<remember>ユーザーは駅前のカフェが好き</remember></dialogue></response>";
    const result = parseXmlResponse(xml);
    expect(result?.dialogue).toBe("「またカフェ行こ」");
    expect(result?.remember).toEqual(["ユーザーは駅前のカフェが好き"]);
  });

  it("複数のrememberタグを抽出する", () => {
    const xml = `<response><dialogue>「覚えてるよ」
<remember>ユーザーは辛い物が苦手</remember>
<remember>次は金曜の夜に話したい</remember></dialogue></response>`;
    const result = parseXmlResponse(xml);
    expect(result?.remember).toEqual(["ユーザーは辛い物が苦手", "次は金曜の夜に話したい"]);
  });

  it("rememberタグがなければ空配列", () => {
    const xml = "<response><dialogue>「おかえり」</dialogue></response>";
    const result = parseXmlResponse(xml);
    expect(result?.remember).toEqual([]);
  });
});

describe("stripXmlTags", () => {
  it("全XMLタグを除去する", () => {
    const xml =
      "<response><action>*微笑む*</action><dialogue>「やあ」</dialogue><inner>嬉しい</inner></response>";
    const plain = stripXmlTags(xml);
    expect(plain).toContain("*微笑む*");
    expect(plain).toContain("「やあ」");
    expect(plain).toContain("嬉しい");
    expect(plain).not.toContain("<response>");
    expect(plain).not.toContain("<dialogue>");
  });

  it("連続改行を1つにまとめる", () => {
    const input = "<response>\n\n\n<dialogue>test</dialogue>\n\n</response>";
    const result = stripXmlTags(input);
    expect(result).not.toMatch(/\n{2,}/);
  });
});

describe("stripRememberTags", () => {
  it("rememberタグだけを除去する", () => {
    const result = stripRememberTags("「了解」<remember>次は海に行きたい</remember>");
    expect(result).toBe("「了解」");
  });
});

describe("stripXmlTagsStreaming", () => {
  it("完全なXMLタグを除去する", () => {
    expect(stripXmlTagsStreaming("<response><narration>hello</narration></response>")).toBe(
      "hello",
    );
  });

  it("未完了の開始タグを除去する", () => {
    const result = stripXmlTagsStreaming("<response>\n<narratio");
    expect(result.trim()).toBe("");
    expect(result).not.toContain("<narratio");
  });

  it("タグ内のストリーミング途中コンテンツは保持する", () => {
    expect(stripXmlTagsStreaming("<response><narration>hel")).toBe("hel");
  });

  it("rememberタグを除去する", () => {
    expect(stripXmlTagsStreaming("「了解」<remember>次は海に行きたい</remember>")).toBe("「了解」");
  });

  it("空文字列は空文字列のまま返す", () => {
    expect(stripXmlTagsStreaming("")).toBe("");
  });
});

describe("wrapConversationPlainAsXml", () => {
  it("プレーンテキストを<response><dialogue>でラップする", () => {
    const result = wrapConversationPlainAsXml("「こんにちは」");
    expect(result).toBe("<response><dialogue>「こんにちは」</dialogue></response>");
  });

  it("すでにXMLの場合はそのまま返す", () => {
    const xml = "<response><dialogue>「やあ」</dialogue></response>";
    expect(wrapConversationPlainAsXml(xml)).toBe(xml);
  });

  it("空文字列はそのまま返す", () => {
    expect(wrapConversationPlainAsXml("")).toBe("");
  });

  it("裸の<dialogue>タグを救済する", () => {
    const input = "<dialogue>「こんにちは」</dialogue>";
    const result = wrapConversationPlainAsXml(input);
    expect(result).toBe("<response><dialogue>「こんにちは」</dialogue></response>");
  });
});
