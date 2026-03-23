import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useSettingsStore } from '@/stores/settings-store'

const MODELS = [
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Venice Uncensored（無料）', tier: '無料', desc: '24Bモデル・制限なし' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B（無料）', tier: '無料', desc: '405Bモデル・高品質' },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo 12B', tier: 'スタンダード', desc: '高速・低コスト' },
  { id: 'thedrummer/unslopnemo-12b', name: 'UnslopNemo 12B（RP向け）', tier: 'スタンダード', desc: 'ロールプレイ特化' },
  { id: 'nousresearch/hermes-3-llama-3.1-70b', name: 'Hermes 3 70B', tier: 'プレミアム', desc: '高品質・汎用' },
  { id: 'nousresearch/hermes-4-70b', name: 'Hermes 4 70B', tier: 'プレミアム', desc: '最新・最高品質' },
]

export function SettingsPanel() {
  const { model, nsfwBlur, darkMode, autoGenerateImages, setModel, toggleNsfwBlur, toggleDarkMode, toggleAutoGenerateImages } = useSettingsStore()

  return (
    <Sheet>
      <SheetTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10">
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
                  onClick={() => setModel(m.id)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                    model === m.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                >
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.tier} — {m.desc}</div>
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
