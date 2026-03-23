import { Volume2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Separator } from "@/component/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/component/ui/sheet";
import { Switch } from "@/component/ui/switch";
import { useSpeechSynthesis } from "@/hook/use-speech-synthesis";
import { TYPE_LABELS, VOICE_TYPE_ORDER } from "@/lib/tts-constants";
import { useSettingsStore } from "@/store/settings-store";

const MODELS = [
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    name: "Venice Uncensored（無料）",
    tier: "無料",
    desc: "24Bモデル・制限なし",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    name: "Hermes 3 405B（無料）",
    tier: "無料",
    desc: "405Bモデル・高品質",
  },
  {
    id: "mistralai/mistral-nemo",
    name: "Mistral Nemo 12B",
    tier: "スタンダード",
    desc: "高速・低コスト",
  },
  {
    id: "thedrummer/unslopnemo-12b",
    name: "UnslopNemo 12B（RP向け）",
    tier: "スタンダード",
    desc: "ロールプレイ特化",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B（RP向け）",
    tier: "スタンダード",
    desc: "ロールプレイ向け・13B",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Hermes 3 70B",
    tier: "プレミアム",
    desc: "高品質・汎用",
  },
  {
    id: "nousresearch/hermes-4-70b",
    name: "Hermes 4 70B",
    tier: "プレミアム",
    desc: "最新・最高品質",
  },
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Euryale 70B（RP最強）",
    tier: "プレミアム",
    desc: "RP特化fine-tune済み70B・業界最高品質",
  },
  {
    id: "sao10k/l3-euryale-70b",
    name: "Euryale 70B v2（RP）",
    tier: "プレミアム",
    desc: "Euryale旧版・安定した人気モデル",
  },
];

const PREVIEW_TEXT = "こんにちは、今日はいいお天気ですね。" as const;

export const SettingsPanel = () => {
  const {
    model,
    nsfwBlur,
    darkMode,
    autoGenerateImages,
    ttsEnabled,
    ttsVoiceUri,
    ttsRate,
    ttsPitch,
    setModel,
    toggleNsfwBlur,
    toggleDarkMode,
    toggleAutoGenerateImages,
    toggleTts,
    setTtsVoiceUri,
    setTtsRate,
    setTtsPitch,
  } = useSettingsStore(
    useShallow((s) => ({
      model: s.model,
      nsfwBlur: s.nsfwBlur,
      darkMode: s.darkMode,
      autoGenerateImages: s.autoGenerateImages,
      ttsEnabled: s.ttsEnabled,
      ttsVoiceUri: s.ttsVoiceUri,
      ttsRate: s.ttsRate,
      ttsPitch: s.ttsPitch,
      setModel: s.setModel,
      toggleNsfwBlur: s.toggleNsfwBlur,
      toggleDarkMode: s.toggleDarkMode,
      toggleAutoGenerateImages: s.toggleAutoGenerateImages,
      toggleTts: s.toggleTts,
      setTtsVoiceUri: s.setTtsVoiceUri,
      setTtsRate: s.setTtsRate,
      setTtsPitch: s.setTtsPitch,
    })),
  );

  const { categorizedVoices, isSupported, preview, isSpeaking, stop } = useSpeechSynthesis(
    ttsVoiceUri,
    ttsRate,
    ttsPitch,
  );

  const voiceGroups = VOICE_TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    voices: categorizedVoices.filter((v) => v.type === type),
  })).filter((g) => g.voices.length > 0);

  const handlePreview = (voiceURI: string) => {
    if (isSpeaking) {
      stop();
      return;
    }
    const found = categorizedVoices.find((v) => v.voice.voiceURI === voiceURI);
    if (found) {
      preview(PREVIEW_TEXT, found.voice);
    }
  };

  return (
    <Sheet>
      <SheetTrigger
        aria-label="設定を開く"
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10"
      >
        ⚙️
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>設定</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">モデル選択</h3>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    model === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {m.tier} — {m.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">NSFWぼかし</p>
                <p className="text-xs text-muted-foreground">画像をクリックするまでぼかす</p>
              </div>
              <Switch checked={nsfwBlur} onCheckedChange={toggleNsfwBlur} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">ダークモード</p>
                <p className="text-xs text-muted-foreground">テーマの切り替え</p>
              </div>
              <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">自動画像生成</p>
                <p className="text-xs text-muted-foreground">AIが適切なタイミングで画像を生成</p>
              </div>
              <Switch checked={autoGenerateImages} onCheckedChange={toggleAutoGenerateImages} />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">音声読み上げ（TTS）</h3>
            {!isSupported ? (
              <p className="text-xs text-muted-foreground">
                このブラウザは音声合成に対応していません
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">音声読み上げ</p>
                    <p className="text-xs text-muted-foreground">AIの応答を音声で再生</p>
                  </div>
                  <Switch checked={ttsEnabled} onCheckedChange={toggleTts} />
                </div>
                {ttsEnabled && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">音声タイプ</label>
                      <div className="flex gap-2">
                        <select
                          value={ttsVoiceUri}
                          onChange={(e) => setTtsVoiceUri(e.target.value)}
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="">デフォルト</option>
                          {voiceGroups.map((group) => (
                            <optgroup key={group.type} label={group.label}>
                              {group.voices.map((v) => (
                                <option key={v.voice.voiceURI} value={v.voice.voiceURI}>
                                  {v.voice.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handlePreview(ttsVoiceUri)}
                          className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        🔊 ボタンで選択中の声を試聴
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-medium">速度</label>
                        <span className="text-xs text-muted-foreground">{ttsRate.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={ttsRate}
                        onChange={(e) => setTtsRate(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-medium">ピッチ</label>
                        <span className="text-xs text-muted-foreground">{ttsPitch.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={ttsPitch}
                        onChange={(e) => setTtsPitch(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
