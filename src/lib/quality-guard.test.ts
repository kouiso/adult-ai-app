import { describe, expect, it } from "vitest";

import { checkWrongFirstPerson } from "./quality-guard";

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
