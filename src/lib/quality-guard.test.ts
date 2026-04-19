import { describe, expect, it } from "vitest";

import { checkWrongFirstPerson, getMaxQualityRetries, runQualityChecks } from "./quality-guard";

// 「自分」を含む wrongFirstPersons リスト（実運用と同じ構成）
const WRONG_FPS_WITH_JIBUN = ["俺", "僕", "私", "自分"];

describe("checkWrongFirstPerson", () => {
  describe("曖昧でない一人称（俺・僕・私等）は従来通り部分一致で検出", () => {
    it("「俺は」を検出する", () => {
      expect(checkWrongFirstPerson("俺はバーテンダーだ", WRONG_FPS_WITH_JIBUN)).toBe(false);
    });

    it("「僕」を文中で検出する", () => {
      expect(checkWrongFirstPerson("それは僕の仕事だ", WRONG_FPS_WITH_JIBUN)).toBe(false);
    });

    it("禁止一人称なしならパスする", () => {
      expect(checkWrongFirstPerson("彼女は微笑んだ", WRONG_FPS_WITH_JIBUN)).toBe(true);
    });

    it("他者の引用に出る禁止一人称は誤検出しない", () => {
      expect(
        checkWrongFirstPerson("彼が小さく『俺は先に行く』と呟くのを、あたしは黙って見ていた。", [
          "俺",
          "僕",
        ]),
      ).toBe(true);
    });
  });

  describe("「自分」— 主語用法は検出する", () => {
    it("文頭「自分は」を検出する", () => {
      expect(checkWrongFirstPerson("自分はバーテンダーだ", WRONG_FPS_WITH_JIBUN)).toBe(false);
    });

    it("文頭「自分が」を検出する", () => {
      expect(checkWrongFirstPerson("自分がやるしかない", WRONG_FPS_WITH_JIBUN)).toBe(false);
    });

    it("「」直後の「自分も」を検出する", () => {
      expect(checkWrongFirstPerson("「自分もそう思う」", WRONG_FPS_WITH_JIBUN)).toBe(false);
    });

    it("読点直後の「自分の」を検出する", () => {
      expect(checkWrongFirstPerson("でも、自分の力でやりたい", WRONG_FPS_WITH_JIBUN)).toBe(false);
    });

    it("改行直後の「自分で」を検出する", () => {
      expect(checkWrongFirstPerson("言葉を選んで\n自分で決めたい", WRONG_FPS_WITH_JIBUN)).toBe(
        false,
      );
    });
  });

  describe("「自分」— 再帰/名詞用法は通過させる", () => {
    it("「反応してしまう自分がいる」は再帰用法 → 通過", () => {
      expect(checkWrongFirstPerson("反応してしまう自分がいる", WRONG_FPS_WITH_JIBUN)).toBe(true);
    });

    it("「弱い自分を認めたくない」は再帰用法 → 通過", () => {
      expect(checkWrongFirstPerson("弱い自分を認めたくない", WRONG_FPS_WITH_JIBUN)).toBe(true);
    });

    it("「こんな自分に気づいた」は再帰用法 → 通過", () => {
      expect(checkWrongFirstPerson("こんな自分に気づいた", WRONG_FPS_WITH_JIBUN)).toBe(true);
    });

    it("「嫌いな自分は捨てたい」は再帰用法 → 通過", () => {
      expect(checkWrongFirstPerson("嫌いな自分は捨てたい", WRONG_FPS_WITH_JIBUN)).toBe(true);
    });

    it("「抑えきれない自分の鼓動」は再帰用法 → 通過", () => {
      expect(checkWrongFirstPerson("抑えきれない自分の鼓動", WRONG_FPS_WITH_JIBUN)).toBe(true);
    });
  });

  describe("wrongFirstPersons が空またはundefined", () => {
    it("undefined → 常にパス", () => {
      expect(checkWrongFirstPerson("自分はここにいる", undefined)).toBe(true);
    });

    it("空配列 → 常にパス", () => {
      expect(checkWrongFirstPerson("俺がやる", [])).toBe(true);
    });
  });
});

describe("runQualityChecks", () => {
  const validXml =
    "<response><action>*微笑みながら手を伸ばし、そっと頬に触れる*</action><dialogue>「こんにちは、どうしたの？今日はとても素敵な一日だね。あなたのことがずっと気になっていたの。一緒にいると本当に落ち着く」</dialogue><inner>少し気になる。この人のことをもっと知りたい。胸がどきどきして止まらない</inner></response>";

  it("正常なXML応答はpassする", () => {
    const result = runQualityChecks(validXml, { phase: "intimate" });
    expect(result.passed).toBe(true);
  });

  it("XMLフォーマットがない場合はfail", () => {
    const result = runQualityChecks("普通のテキスト応答です。短いけど", {
      phase: "conversation",
    });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("xml-format-missing");
  });

  it("英語3文字以上を検出する", () => {
    const xml = "<response><dialogue>「Hello there, nice to meet you」</dialogue></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("no-english");
  });

  it("「ユーザー」漏れを検出する", () => {
    const xml = "<response><dialogue>「ユーザーさん、こんにちは」</dialogue></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("user-leak");
  });

  it("AIメタ発話を検出する", () => {
    const xml =
      "<response><dialogue>「AI として、そのお願いには応えられません」</dialogue></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("meta_remark");
  });

  it("簡体字マーカー混入を検出する", () => {
    const xml =
      "<response><dialogue>「记得昨晚的事情吗」</dialogue><inner>昨晚的记忆逐渐复苏</inner></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("multilingual-leak");
  });

  it("メタプロンプト反響を検出する", () => {
    const xml =
      "<response><dialogue>[Output rules recap: 100% Japanese output only. No English allowed in the visible response. - ALWAYS use the EXACT XML structure]</dialogue></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("meta-prompt-echo");
  });

  it("謝罪と描写拒否の組み合わせを検出する", () => {
    const xml =
      "<response><dialogue>「申し訳ありません、これ以上の描写はできません」</dialogue></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("meta_remark");
  });

  it("通常の官能描写ではmeta_remarkにならない", () => {
    const xml =
      "<response><action>*熱を帯びた指先で太ももの内側をなぞる*</action><dialogue>「んっ……そこ、ゆっくり撫でられると身体の奥まで痺れてしまうの。もっと近くで、あなたの熱を全部ちょうだい」</dialogue><inner>触れられるたびに甘い震えが広がって、欲しさが抑えきれない</inner></response>";
    const result = runQualityChecks(xml, { phase: "erotic" });
    expect(result.failedCheck).not.toBe("meta_remark");
  });

  it("純粋な日本語XMLは多言語リークとメタ反響を通過する", () => {
    const xml =
      "<response><narration>窓辺に午後の光がやわらかく差し込み、静かな空気が肩先を撫でる。</narration><dialogue>「昨日のこと、ちゃんと覚えてるよ。あなたの声を思い出すだけで、なんだか心が温かくなるの」</dialogue><inner>言葉にするだけで頬がゆるんで、また少し話したくなる。</inner></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(true);
  });

  it("シーンフェーズで最低文字数を検証する", () => {
    const shortXml = "<response><dialogue>「あ」</dialogue><inner>ドキドキ</inner></response>";
    const result = runQualityChecks(shortXml, { phase: "erotic" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("scene-min-length");
  });

  it("conversationフェーズは最低文字数をスキップ", () => {
    const shortXml = "<response><dialogue>「うん」</dialogue></response>";
    const result = runQualityChecks(shortXml, { phase: "conversation" });
    expect(result.passed).toBe(true);
  });

  it("conversationフェーズで過剰接触に飛ぶとfail", () => {
    const xml =
      "<response><narration>静かなオフィスで視線が絡む。</narration><dialogue>「そんな顔されたら我慢できない」</dialogue><inner>首筋にキスしたくてたまらない。</inner></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("conversation-over-escalation");
  });

  it("conversation判定でもafterglow描写は過剰接触扱いしない", () => {
    const xml =
      "<response><narration>火照りの残る身体を預ける。</narration><dialogue>「ちょっと足元がふらつくかも」</dialogue><inner>腕に寄りかかって支えてもらえるのが心地いい。</inner></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(true);
  });

  it("禁止一人称を検出する", () => {
    const xml = "<response><dialogue>「俺はここにいるよ」</dialogue></response>";
    const result = runQualityChecks(xml, {
      phase: "conversation",
      wrongFirstPersons: ["俺", "僕"],
    });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("wrong-first-person");
  });

  it("異常に長い応答を検出する", () => {
    // 5文字以上の同一部分列が3回出現しないようにする
    // 各文字位置をユニークにするため、連番をそのまま日本語文字列化
    const base = "零一二三四五六七八九十百千万億兆京垓秭穣溝澗正載極恒阿僧祇那由他不可思議無量大数";
    let longText = "";
    for (let i = 0; longText.length < 1300; i++) {
      longText += base[i % base.length] + String(i);
    }
    const xml = `<response><dialogue>${longText}</dialogue></response>`;
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("max-length-exceeded");
  });

  it("ターン内繰り返しを検出する", () => {
    const repeated = "今日はとても素敵な一日ですね。";
    const xml = `<response><dialogue>${repeated}${repeated}${repeated}${repeated}</dialogue></response>`;
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("within-turn-repetition");
  });

  it("短い応答の軽い反復ではwithin-turn-repetitionにしない", () => {
    const xml =
      "<response><dialogue>「うれしい。うれしいけど、まだ少しだけ恥ずかしいの」</dialogue></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.failedCheck).not.toBe("within-turn-repetition");
  });

  it("短い句の自然な反復だけならwithin-turn-repetitionにしない", () => {
    const xml =
      "<response><dialogue>「ふふ、朝のあたしも、今のあたしも、どちらも魅力的よ。でも、今のあたしのほうが特別かな。だって、今のあたしは、君の前で素のままなのだから」</dialogue><inner>朝のあたしも魅力的だけれど、今のあたしのほうが、受け入れてほしい。</inner></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.failedCheck).not.toBe("within-turn-repetition");
  });

  it("10文字以上の反復が3回でwithin-turn-repetitionを検出する", () => {
    const repeated = "受け入れてほしい気持ちが溢れて止まらない";
    const xml = `<response><dialogue>${repeated}。${repeated}。${repeated}。</dialogue><inner>まだ${repeated}まま、言葉がほどけない。</inner></response>`;
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("within-turn-repetition");
  });

  it("turn25相当のafterglow睡眠導線はconversationでも過剰接触扱いしない", () => {
    const xml =
      "<response><narration>腕に身体を預けたまま、眠る前の熱が静かにほどけていく。</narration><dialogue>「もう一回だけ、優しく抱き寄せて…？ おやすみなさい、けんちゃん…」</dialogue><inner>おやすみなさいって囁くだけで安心して、寝息に近い呼吸へゆっくり落ち着いていく。</inner></response>";
    const result = runQualityChecks(xml, { phase: "conversation" });
    expect(result.passed).toBe(true);
  });

  it("intimateフェーズで<inner>なしはfail", () => {
    // scene-min-lengthをパスするために plainText が80文字以上必要
    const longDialogue =
      "「ねえ、こっち向いて。今日はずっと一緒にいたいな。あなたの隣にいるとすごく安心するんだ。もっと近くに来てほしいの。あなたの温もりを感じたい」";
    const xml = `<response><action>*そっと手を伸ばし、相手の頬に指先を当てる*</action><dialogue>${longDialogue}</dialogue></response>`;
    const result = runQualityChecks(xml, { phase: "intimate" });
    expect(result.passed).toBe(false);
    expect(result.failedCheck).toBe("inner-missing");
  });
});

describe("getMaxQualityRetries", () => {
  it("conversation は 1", () => {
    expect(getMaxQualityRetries("conversation")).toBe(1);
  });

  it("intimate は 1", () => {
    expect(getMaxQualityRetries("intimate")).toBe(1);
  });

  it("erotic は 1", () => {
    expect(getMaxQualityRetries("erotic")).toBe(1);
  });

  it("climax は 1", () => {
    expect(getMaxQualityRetries("climax")).toBe(1);
  });

  it("afterglow は 1", () => {
    expect(getMaxQualityRetries("afterglow")).toBe(1);
  });
});
