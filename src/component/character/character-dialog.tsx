import { useCallback, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/component/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/component/ui/dialog";
import { Textarea } from "@/component/ui/textarea";
import { createCharacter, deleteCharacter, listCharacters, type Character } from "@/lib/api";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/config";
import { cn } from "@/lib/utils";

const CHARACTER_QUERY_KEY = ["character-list"] as const;

interface CharacterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (characterId: string) => void;
}

interface CharacterFormProps {
  onCreated: (character: Character) => void;
  onCancel: () => void;
}

const CharacterForm = ({ onCreated, onCancel }: CharacterFormProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [greeting, setGreeting] = useState("");

  const mutation = useMutation({
    mutationFn: createCharacter,
    onSuccess: (character) => {
      void queryClient.invalidateQueries({ queryKey: CHARACTER_QUERY_KEY });
      onCreated(character);
    },
    onError: () => {
      toast.error("キャラクター作成に失敗しました");
    },
  });

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedPrompt = systemPrompt.trim();
    if (!trimmedName || !trimmedPrompt) {
      toast.error("名前とシステムプロンプトは必須です");
      return;
    }
    mutation.mutate({
      name: trimmedName,
      systemPrompt: trimmedPrompt,
      greeting: greeting.trim(),
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium mb-1 block">名前</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="キャラクター名"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          maxLength={100}
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">システムプロンプト</label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="キャラクターの性格や設定..."
          className="min-h-[120px] text-sm"
          maxLength={10_000}
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">挨拶メッセージ（任意）</label>
        <Textarea
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="会話開始時のメッセージ..."
          className="min-h-[60px] text-sm"
          maxLength={2000}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>
          キャンセル
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? "作成中..." : "作成"}
        </Button>
      </div>
    </div>
  );
};

interface CharacterListItemProps {
  character: Character;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

const CharacterListItem = ({
  character,
  onSelect,
  onDelete,
  isDeleting,
}: CharacterListItemProps) => (
  <div className="flex items-center gap-2 group">
    <button
      type="button"
      onClick={() => onSelect(character.id)}
      className={cn(
        "flex-1 flex items-center gap-3 rounded-lg border border-border p-3 text-left",
        "transition-colors hover:bg-muted",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
        <User className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{character.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {character.systemPrompt.slice(0, 80)}
        </p>
      </div>
    </button>
    {character.id !== "default-character" && (
      <button
        type="button"
        onClick={() => onDelete(character.id)}
        disabled={isDeleting}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )}
  </div>
);

export const CharacterDialog = ({ open, onOpenChange, onSelect }: CharacterDialogProps) => {
  const [showForm, setShowForm] = useState(false);

  const { data: characters = [] } = useQuery({
    queryKey: CHARACTER_QUERY_KEY,
    queryFn: listCharacters,
    enabled: open,
  });

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: deleteCharacter,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARACTER_QUERY_KEY });
      toast.success("キャラクターを削除しました");
    },
    onError: () => {
      toast.error("削除に失敗しました（使用中の会話がある可能性があります）");
    },
  });

  const handleSelect = useCallback(
    (characterId: string) => {
      onSelect(characterId);
      onOpenChange(false);
      setShowForm(false);
    },
    [onSelect, onOpenChange],
  );

  const handleCreated = useCallback(
    (character: Character) => {
      setShowForm(false);
      handleSelect(character.id);
    },
    [handleSelect],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) setShowForm(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{showForm ? "キャラクター作成" : "キャラクター選択"}</DialogTitle>
          <DialogDescription>
            {showForm
              ? "新しいキャラクターを作成します"
              : "会話に使用するキャラクターを選んでください"}
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <CharacterForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
        ) : (
          <>
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {characters.map((character) => (
                <CharacterListItem
                  key={character.id}
                  character={character}
                  onSelect={handleSelect}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isDeleting={deleteMutation.isPending}
                />
              ))}
              {characters.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  キャラクターがありません
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                新規作成
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
