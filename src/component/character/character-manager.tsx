import { useEffect, useState } from "react";

import { ChevronDown, ChevronRight, Pencil, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { CharacterWizard } from "@/component/character/character-wizard";
import { Button } from "@/component/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/component/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/component/ui/sheet";
import { useCharacterQuery } from "@/hook/use-character-query";
import { useChatQuery } from "@/hook/use-chat-query";
import type { Character, CharacterInput } from "@/lib/api";
import type { GeneratedCharacter } from "@/lib/character-generator";
import { buildSystemPrompt, parseSystemPrompt } from "@/lib/prompt-builder";
import { useChatStore } from "@/store/chat-store";
import { useSettingsStore } from "@/store/settings-store";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

interface AdvancedPromptSectionProps {
  value: string;
  onChange: (value: string) => void;
}

const AdvancedPromptSection = ({ value, onChange }: AdvancedPromptSectionProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        高度な設定
      </button>
      {open && (
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            追加のシステムプロンプト（上記フィールドに加えて追記される指示）
          </label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="追加の指示やルールがあればここに記述..."
            className={`${FIELD_CLASS} min-h-[100px] resize-y font-mono text-xs`}
            maxLength={5000}
          />
          <p className="mt-1 text-xs text-muted-foreground">{value.length} / 5000文字</p>
        </div>
      )}
    </div>
  );
};

interface CharacterFormProps {
  initial?: Character;
  onSave: (input: CharacterInput) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

interface CharacterFormState {
  name: string;
  avatar: string;
  personality: string;
  scenario: string;
  greeting: string;
  tagsRaw: string;
  customPrompt: string;
}

const EMPTY_FORM_STATE: CharacterFormState = {
  name: "",
  avatar: "",
  personality: "",
  scenario: "",
  greeting: "",
  tagsRaw: "",
  customPrompt: "",
};

function createInitialFormState(initial?: Character): CharacterFormState {
  if (!initial) return EMPTY_FORM_STATE;
  const parsed = parseSystemPrompt(initial.systemPrompt);
  return {
    name: initial.name,
    avatar: initial.avatar ?? "",
    personality: parsed.personality,
    scenario: parsed.scenario,
    greeting: initial.greeting,
    tagsRaw: (initial.tags ?? []).join(", "),
    customPrompt: parsed.custom,
  };
}

function formStateToInput(state: CharacterFormState): CharacterInput {
  const tags = state.tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const systemPrompt = buildSystemPrompt({
    name: state.name.trim(),
    personality: state.personality.trim(),
    scenario: state.scenario.trim(),
    custom: state.customPrompt.trim(),
  });
  return {
    name: state.name.trim(),
    avatar: state.avatar.trim() || undefined,
    systemPrompt,
    greeting: state.greeting,
    tags,
  };
}

interface CharacterFormFieldsProps {
  state: CharacterFormState;
  onChange: (patch: Partial<CharacterFormState>) => void;
  touched: Set<string>;
  onBlur: (field: string) => void;
}

const CharacterFormFields = ({ state, onChange, touched, onBlur }: CharacterFormFieldsProps) => (
  <>
    <div>
      <label className="mb-1.5 block text-sm font-medium">キャラクター名 *</label>
      <input
        type="text"
        value={state.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onBlur={() => onBlur("name")}
        placeholder="例: 美咲"
        className={`${FIELD_CLASS} ${touched.has("name") && !state.name.trim() ? "border-destructive" : ""}`}
        maxLength={100}
      />
      {touched.has("name") && !state.name.trim() && (
        <p className="mt-1 text-xs text-destructive">キャラクター名は必須です</p>
      )}
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium">アバター（絵文字またはURL）</label>
      <input
        type="text"
        value={state.avatar}
        onChange={(e) => onChange({ avatar: e.target.value })}
        placeholder="例: 🌸 または https://..."
        className={FIELD_CLASS}
        maxLength={500}
      />
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium">性格・見た目</label>
      <textarea
        value={state.personality}
        onChange={(e) => onChange({ personality: e.target.value })}
        placeholder="例: 色白で小柄な大学2年生。恥ずかしがり屋だけど好奇心旺盛。黒髪ロング。"
        className={`${FIELD_CLASS} min-h-[80px] resize-y`}
        maxLength={2000}
      />
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium">シナリオ・シチュエーション</label>
      <textarea
        value={state.scenario}
        onChange={(e) => onChange({ scenario: e.target.value })}
        placeholder="例: 渋谷のカフェで偶然隣に座った。話しかけてみたら意外と乗ってきた。"
        className={`${FIELD_CLASS} min-h-[80px] resize-y`}
        maxLength={2000}
      />
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium">
        グリーティング（会話開始時のメッセージ）
      </label>
      <textarea
        value={state.greeting}
        onChange={(e) => onChange({ greeting: e.target.value })}
        placeholder="例: えっ、あ、こんにちは...隣いいですか？"
        className={`${FIELD_CLASS} min-h-[72px] resize-y`}
        maxLength={2000}
      />
    </div>

    <div>
      <label className="mb-1.5 block text-sm font-medium">タグ（カンマ区切り）</label>
      <input
        type="text"
        value={state.tagsRaw}
        onChange={(e) => onChange({ tagsRaw: e.target.value })}
        placeholder="例: ツンデレ, 年上, 先生"
        className={FIELD_CLASS}
      />
    </div>
  </>
);

const CharacterForm = ({ initial, onSave, onCancel, isSaving }: CharacterFormProps) => {
  const [state, setState] = useState(() => createInitialFormState(initial));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const updateField = (patch: Partial<CharacterFormState>) =>
    setState((prev) => ({ ...prev, ...patch }));
  const handleBlur = (field: string) => setTouched((prev) => new Set(prev).add(field));

  const handleSave = async () => {
    setTouched(new Set(["name"]));
    if (!state.name.trim()) {
      toast.error("キャラクター名を入力してください");
      return;
    }
    await onSave(formStateToInput(state));
  };

  return (
    <div className="space-y-4">
      <CharacterFormFields
        state={state}
        onChange={updateField}
        touched={touched}
        onBlur={handleBlur}
      />
      <AdvancedPromptSection
        value={state.customPrompt}
        onChange={(v) => updateField({ customPrompt: v })}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          キャンセル
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving || !state.name.trim()}>
          {isSaving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
};

type DialogMode =
  | { type: "create" }
  | { type: "create-from-wizard"; generated: GeneratedCharacter }
  | { type: "edit"; character: Character }
  | null;

interface CharacterListItemProps {
  character: Character;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: (id: string) => void;
  onEdit: (character: Character) => void;
  onDelete: (id: string) => void;
}

const CharacterAvatar = ({ character }: { character: Character }) => {
  const av = character.avatar;
  if (!av) return <>{character.name.slice(0, 2)}</>;
  if (av.startsWith("http") || av.startsWith("/")) {
    return <img src={av} alt={character.name} className="h-8 w-8 rounded-full object-cover" />;
  }
  return <>{av}</>;
};

const CharacterListItem = ({
  character,
  isActive,
  isDeleting,
  onSelect,
  onEdit,
  onDelete,
}: CharacterListItemProps) => (
  <div
    className={`group relative rounded-lg border p-3 transition-colors ${
      isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
    }`}
  >
    <button type="button" onClick={() => onSelect(character.id)} className="w-full text-left">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs">
          <CharacterAvatar character={character} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{character.name}</p>
          {(character.tags ?? []).length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              {(character.tags ?? []).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </button>
    <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
      <button
        type="button"
        onClick={() => onEdit(character)}
        className="rounded p-1 hover:bg-background"
        aria-label="編集"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(character.id)}
        disabled={isDeleting}
        className="rounded p-1 hover:bg-background text-destructive"
        aria-label="削除"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);

interface CharacterManagerProps {
  onCharacterSelect?: (characterId: string | null) => void;
  manualCreateSignal?: number;
  // 親から開閉を制御したい場合のオプション。未指定なら内部状態のみで動く
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface CharacterSheetListProps {
  characters: Character[];
  isLoading: boolean;
  activeCharacterId: string | null;
  deletingId: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (character: Character) => void;
  onDelete: (id: string) => void;
  onCreateClick: () => void;
  onWizardClick: () => void;
}

const CharacterSheetList = ({
  characters,
  isLoading,
  activeCharacterId,
  deletingId,
  onSelect,
  onEdit,
  onDelete,
  onCreateClick,
  onWizardClick,
}: CharacterSheetListProps) => (
  <>
    <div className="mt-4 flex-1 overflow-y-auto space-y-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
          activeCharacterId === null
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted"
        }`}
      >
        <p className="font-medium">デフォルト AI</p>
        <p className="text-xs text-muted-foreground mt-0.5">キャラクターなし</p>
      </button>

      {isLoading && <p className="py-4 text-center text-sm text-muted-foreground">読み込み中...</p>}

      {characters.map((ch) => (
        <CharacterListItem
          key={ch.id}
          character={ch}
          isActive={activeCharacterId === ch.id}
          isDeleting={deletingId === ch.id}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}

      {!isLoading && characters.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">キャラクターがありません</p>
      )}
    </div>

    <div className="mt-4 space-y-2 border-t pt-4">
      <Button className="w-full" variant="default" onClick={onWizardClick}>
        <Sparkles className="mr-2 h-4 w-4" />
        AIで作成
      </Button>
      <Button className="w-full" variant="default" onClick={onCreateClick}>
        <Plus className="mr-2 h-4 w-4" />
        手動で作成
      </Button>
    </div>
  </>
);

export const CharacterManager = ({
  onCharacterSelect,
  manualCreateSignal,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CharacterManagerProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  // 制御モード（親から open を渡された）と非制御モードを両立させる
  const isSheetOpen = controlledOpen ?? internalOpen;
  const setSheetOpen = (next: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isWizardOpen, setWizardOpen] = useState(false);

  const {
    characters,
    isLoading,
    createCharacterEntry,
    updateCharacterEntry,
    deleteCharacterEntry,
  } = useCharacterQuery();
  const { activeCharacterId, setActiveCharacterId } = useSettingsStore(
    useShallow((s) => ({
      activeCharacterId: s.activeCharacterId,
      setActiveCharacterId: s.setActiveCharacterId,
    })),
  );
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const { updateConversationCharacterEntry } = useChatQuery(currentConversationId);

  useEffect(() => {
    if ((manualCreateSignal ?? 0) > 0) {
      setDialogMode({ type: "create" });
    }
  }, [manualCreateSignal]);

  const handleCreate = async (input: CharacterInput) => {
    setIsSaving(true);
    try {
      await createCharacterEntry(input);
      setDialogMode(null);
      toast.success("キャラクターを作成しました");
    } catch {
      toast.error("作成に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (id: string, input: CharacterInput) => {
    setIsSaving(true);
    try {
      await updateCharacterEntry(id, input);
      setDialogMode(null);
      toast.success("キャラクターを更新しました");
    } catch {
      toast.error("更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCharacterEntry(id);
      if (activeCharacterId === id) {
        setActiveCharacterId(null);
        onCharacterSelect?.(null);
      }
      toast.success("キャラクターを削除しました");
    } catch {
      toast.error("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  // キャラクター選択時は次回以降の新規会話のデフォルトを更新するだけでなく、
  // 現在開いている会話の characterId も同期更新する。
  // これをしないと「キャラ未バインドの会話にsystemPrompt空文字が流れ、モデルが暴走する」バグが起きる
  const handleSelect = async (id: string | null) => {
    setActiveCharacterId(id);
    onCharacterSelect?.(id);
    setSheetOpen(false);
    if (currentConversationId && id) {
      try {
        await updateConversationCharacterEntry(currentConversationId, id);
      } catch {
        toast.error("会話へのキャラクター反映に失敗しました");
      }
    }
  };

  const handleWizardSaveDirectly = (generated: GeneratedCharacter) => {
    const input: CharacterInput = {
      name: generated.name,
      systemPrompt: buildSystemPrompt({
        name: generated.name,
        personality: generated.personality,
        scenario: generated.scenario,
        custom: "",
      }),
      greeting: generated.greeting,
      tags: generated.tags,
    };
    void handleCreate(input);
  };

  const handleWizardEditAndSave = (generated: GeneratedCharacter) => {
    setDialogMode({ type: "create-from-wizard", generated });
  };

  return (
    <>
      <Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          aria-label="キャラクター管理"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10"
        >
          <Users className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>キャラクター管理</SheetTitle>
          </SheetHeader>
          <CharacterSheetList
            characters={characters}
            isLoading={isLoading}
            activeCharacterId={activeCharacterId}
            deletingId={deletingId}
            onSelect={(id) => void handleSelect(id)}
            onEdit={(c) => setDialogMode({ type: "edit", character: c })}
            onDelete={(id) => void handleDelete(id)}
            onCreateClick={() => setDialogMode({ type: "create" })}
            onWizardClick={() => {
              setSheetOpen(false);
              setWizardOpen(true);
            }}
          />
        </SheetContent>
      </Sheet>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogMode?.type === "edit" ? "キャラクターを編集" : "新しいキャラクターを作成"}
            </DialogTitle>
          </DialogHeader>
          {dialogMode?.type === "create" && (
            <CharacterForm
              onSave={handleCreate}
              onCancel={() => setDialogMode(null)}
              isSaving={isSaving}
            />
          )}
          {dialogMode?.type === "create-from-wizard" && (
            <CharacterForm
              initial={{
                id: "",
                userId: "",
                name: dialogMode.generated.name,
                avatar: null,
                systemPrompt: buildSystemPrompt({
                  name: dialogMode.generated.name,
                  personality: dialogMode.generated.personality,
                  scenario: dialogMode.generated.scenario,
                  custom: "",
                }),
                greeting: dialogMode.generated.greeting,
                tags: dialogMode.generated.tags,
                createdAt: 0,
              }}
              onSave={handleCreate}
              onCancel={() => setDialogMode(null)}
              isSaving={isSaving}
            />
          )}
          {dialogMode?.type === "edit" && (
            <CharacterForm
              initial={dialogMode.character}
              onSave={(input) => handleUpdate(dialogMode.character.id, input)}
              onCancel={() => setDialogMode(null)}
              isSaving={isSaving}
            />
          )}
        </DialogContent>
      </Dialog>

      <CharacterWizard
        open={isWizardOpen}
        onOpenChange={setWizardOpen}
        onSaveDirectly={handleWizardSaveDirectly}
        onEditAndSave={handleWizardEditAndSave}
      />
    </>
  );
};
