import { useState } from "react";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/component/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/component/ui/dialog";
import {
  CHIP_CATEGORIES,
  SITUATION_PRESETS,
  generateCharacter,
  type CharacterSelections,
  type GeneratedCharacter,
} from "@/lib/character-generator";
import { useSettingsStore } from "@/store/settings-store";

// ── 型定義 ───────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

interface CharacterWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveDirectly: (result: GeneratedCharacter) => void;
  onEditAndSave: (result: GeneratedCharacter) => void;
}

// ── Step 1: 属性チップ選択 ───────────────────────────────────────────────

interface ChipSelectProps {
  label: string;
  chips: readonly string[];
  selected: string[];
  onToggle: (chip: string) => void;
}

const ChipSelect = ({ label, chips, selected, onToggle }: ChipSelectProps) => (
  <div>
    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const isSelected = selected.includes(chip);
        return (
          <button
            key={chip}
            type="button"
            onClick={() => onToggle(chip)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {chip}
          </button>
        );
      })}
    </div>
  </div>
);

interface WizardStep1Props {
  selections: CharacterSelections;
  onUpdate: (patch: Partial<CharacterSelections>) => void;
  onNext: () => void;
}

const WizardStep1 = ({ selections, onUpdate, onNext }: WizardStep1Props) => {
  const toggleChip = (key: keyof CharacterSelections, chip: string) => {
    if (key === "freeText") return;
    const current = selections[key];
    const next = current.includes(chip) ? current.filter((c) => c !== chip) : [...current, chip];
    onUpdate({ [key]: next });
  };

  return (
    <div className="space-y-4">
      {CHIP_CATEGORIES.map((cat) => (
        <ChipSelect
          key={cat.key}
          label={cat.label}
          chips={cat.chips}
          selected={selections[cat.key]}
          onToggle={(chip) => toggleChip(cat.key, chip)}
        />
      ))}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">その他（自由入力）</p>
        <input
          type="text"
          value={selections.freeText}
          onChange={(e) => onUpdate({ freeText: e.target.value })}
          placeholder="例: 眼鏡、タトゥー、関西弁..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          maxLength={500}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onNext}>次へ</Button>
      </div>
    </div>
  );
};

// ── Step 2: シチュエーション & こだわり ───────────────────────────────────

interface WizardStep2Props {
  situation: string;
  details: string;
  onSituationChange: (v: string) => void;
  onDetailsChange: (v: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

const WizardStep2 = ({
  situation,
  details,
  onSituationChange,
  onDetailsChange,
  onBack,
  onGenerate,
  isGenerating,
}: WizardStep2Props) => {
  // 親stateの値がプリセットに含まれていなければカスタム入力モードで初期化
  const isPreset = SITUATION_PRESETS.some((p) => p === situation);
  const [customSituation, setCustomSituation] = useState(!isPreset && situation.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium">シチュエーション</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SITUATION_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                onSituationChange(preset);
                setCustomSituation(false);
              }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                situation === preset && !customSituation
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomSituation(true);
              onSituationChange("");
            }}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              customSituation
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            自由に入力
          </button>
        </div>
        {customSituation && (
          <input
            type="text"
            value={situation}
            onChange={(e) => onSituationChange(e.target.value)}
            placeholder="好きなシチュエーションを入力..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            maxLength={500}
            autoFocus
          />
        )}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">こだわりポイント（任意）</p>
        <textarea
          value={details}
          onChange={(e) => onDetailsChange(e.target.value)}
          placeholder={
            "例: 最初は嫌がるけど途中から積極的になる、\n方言で喋る、Mっ気がある、など何でもOK"
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
          maxLength={1000}
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          戻る
        </Button>
        <Button onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              AIで生成
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

// ── Step 3: プレビュー & アクション ──────────────────────────────────────

interface WizardStep3Props {
  result: GeneratedCharacter;
  onRegenerate: (feedback: string) => void;
  onSaveDirectly: () => void;
  onEditAndSave: () => void;
  onBack: () => void;
  isRegenerating: boolean;
}

const WizardStep3 = ({
  result,
  onRegenerate,
  onSaveDirectly,
  onEditAndSave,
  onBack,
  isRegenerating,
}: WizardStep3Props) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">名前</p>
          <p className="text-sm font-medium">{result.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">性格・見た目</p>
          <p className="text-sm leading-relaxed">{result.personality}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">シナリオ</p>
          <p className="text-sm leading-relaxed">{result.scenario}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">挨拶</p>
          <p className="text-sm italic leading-relaxed">「{result.greeting}」</p>
        </div>
        {(result.tags ?? []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">タグ</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {(result.tags ?? []).map((tag, i) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showFeedback && (
        <div className="space-y-2">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="例: もっと積極的に、名前を変えて..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            maxLength={500}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowFeedback(false);
                setFeedback("");
              }}
            >
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onRegenerate(feedback);
                setShowFeedback(false);
                setFeedback("");
              }}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              再生成
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          戻る
        </Button>
        {!showFeedback && (
          <Button variant="outline" onClick={() => setShowFeedback(true)} disabled={isRegenerating}>
            <RefreshCw className="mr-2 h-4 w-4" />
            再生成
          </Button>
        )}
        <Button variant="outline" onClick={onEditAndSave}>
          編集して保存
        </Button>
        <Button onClick={onSaveDirectly}>このまま保存</Button>
      </div>
    </div>
  );
};

// ── メインウィザード ────────────────────────────────────────────────────

const INITIAL_SELECTIONS: CharacterSelections = {
  types: [],
  relations: [],
  personalities: [],
  bodyTypes: [],
  freeText: "",
};

const STEP_TITLES: Record<WizardStep, string> = {
  1: "キャラクターの方向性",
  2: "シチュエーション & こだわり",
  3: "生成結果",
};

export const CharacterWizard = ({
  open,
  onOpenChange,
  onSaveDirectly: onSaveDirectlyProp,
  onEditAndSave: onEditAndSaveProp,
}: CharacterWizardProps) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [selections, setSelections] = useState<CharacterSelections>(INITIAL_SELECTIONS);
  const [situation, setSituation] = useState("");
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<GeneratedCharacter | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const model = useSettingsStore((s) => s.model);

  const resetWizard = () => {
    setStep(1);
    setSelections(INITIAL_SELECTIONS);
    setSituation("");
    setDetails("");
    setResult(null);
    setIsGenerating(false);
  };

  const handleGenerate = async (feedback?: string) => {
    setIsGenerating(true);
    try {
      const generated = await generateCharacter({
        selections,
        situation,
        details,
        model,
        previousResult: feedback && result ? result : undefined,
        feedback: feedback || undefined,
      });
      setResult(generated);
      setStep(3);
    } catch {
      toast.error("生成に失敗しました。もう一度お試しください。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDirectly = () => {
    if (!result) return;
    onSaveDirectlyProp(result);
    resetWizard();
    onOpenChange(false);
  };

  const handleEditAndSave = () => {
    if (!result) return;
    onEditAndSaveProp(result);
    resetWizard();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) resetWizard();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AIキャラクター作成 — {STEP_TITLES[step]}
          </DialogTitle>
          <div className="flex gap-1 pt-2">
            {([1, 2, 3] as const).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        {step === 1 && (
          <WizardStep1
            selections={selections}
            onUpdate={(patch) => setSelections((prev) => ({ ...prev, ...patch }))}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <WizardStep2
            situation={situation}
            details={details}
            onSituationChange={setSituation}
            onDetailsChange={setDetails}
            onBack={() => setStep(1)}
            onGenerate={() => void handleGenerate()}
            isGenerating={isGenerating}
          />
        )}

        {step === 3 && result && (
          <WizardStep3
            result={result}
            onRegenerate={(fb) => void handleGenerate(fb)}
            onSaveDirectly={handleSaveDirectly}
            onEditAndSave={handleEditAndSave}
            onBack={() => setStep(2)}
            isRegenerating={isGenerating}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
