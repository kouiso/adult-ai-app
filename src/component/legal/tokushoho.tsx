const rows = [
  {
    label: "販売業者",
    value: "磯貝孝輔（個人）",
  },
  {
    label: "運営統括責任者",
    value: "磯貝孝輔",
  },
  {
    label: "所在地",
    value: "請求があった場合、遅滞なく開示します。",
  },
  {
    label: "電話番号",
    value: "請求があった場合、遅滞なく開示します。",
  },
  {
    label: "メールアドレス",
    value: "contact@example.com",
  },
  {
    label: "販売価格",
    value: "無料（将来、有料プランを追加する可能性があります。）",
  },
  {
    label: "支払方法",
    value: "現在、支払方法はありません。",
  },
  {
    label: "引渡時期",
    value: "本サービスはWebサービスとして、利用開始後ただちに利用できます。",
  },
  {
    label: "返品・キャンセル",
    value: "デジタルサービスの性質上、提供開始後の返品・キャンセルはできません。",
  },
  {
    label: "動作環境",
    value: "最新版の主要ブラウザでの利用を推奨します。通信料は利用者の負担となります。",
  },
] as const;

export const Tokushoho = () => (
  <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">特定商取引法に基づく表記</p>
      <h2 className="text-2xl font-semibold text-foreground">事業者情報</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        本サービスの特定商取引法に基づく表示です。
      </p>
    </header>
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border/60 last:border-b-0">
              <th className="w-40 bg-muted/40 px-4 py-4 align-top font-medium text-foreground sm:w-52">
                {row.label}
              </th>
              <td className="px-4 py-4 leading-7 text-muted-foreground">
                <span>{row.value}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </article>
);
