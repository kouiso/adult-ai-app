import { beforeEach, describe, expect, it } from "vitest";

import { useSettingsStore } from "./settings-store";

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      model: "sao10k/l3.1-euryale-70b",
      nsfwBlur: false,
      darkMode: true,
      autoGenerateImages: false,
      ttsEnabled: false,
      ttsVoiceUri: "",
      ttsRate: 1,
      ttsPitch: 1,
    });
  });

  it("setModel: モデルが変更される", () => {
    useSettingsStore.getState().setModel("new-model");
    expect(useSettingsStore.getState().model).toBe("new-model");
  });

  it("toggleNsfwBlur: NSFWぼかしがトグルされる", () => {
    expect(useSettingsStore.getState().nsfwBlur).toBe(false);
    useSettingsStore.getState().toggleNsfwBlur();
    expect(useSettingsStore.getState().nsfwBlur).toBe(true);
    useSettingsStore.getState().toggleNsfwBlur();
    expect(useSettingsStore.getState().nsfwBlur).toBe(false);
  });

  it("toggleDarkMode: ダークモードがトグルされる", () => {
    expect(useSettingsStore.getState().darkMode).toBe(true);
    useSettingsStore.getState().toggleDarkMode();
    expect(useSettingsStore.getState().darkMode).toBe(false);
  });

  it("toggleAutoGenerateImages: 自動画像生成がトグルされる", () => {
    expect(useSettingsStore.getState().autoGenerateImages).toBe(false);
    useSettingsStore.getState().toggleAutoGenerateImages();
    expect(useSettingsStore.getState().autoGenerateImages).toBe(true);
  });

  it("toggleTts: TTS設定がトグルされる", () => {
    expect(useSettingsStore.getState().ttsEnabled).toBe(false);
    useSettingsStore.getState().toggleTts();
    expect(useSettingsStore.getState().ttsEnabled).toBe(true);
  });

  it("setTtsRate / setTtsPitch: TTS速度・ピッチが変更される", () => {
    useSettingsStore.getState().setTtsRate(1.5);
    expect(useSettingsStore.getState().ttsRate).toBe(1.5);

    useSettingsStore.getState().setTtsPitch(0.8);
    expect(useSettingsStore.getState().ttsPitch).toBe(0.8);
  });
});
