const rows = [
  "販売業者",
  "運営責任者",
  "所在地",
  "連絡先",
  "販売価格",
  "支払方法",
  "引渡時期",
  "返品・交換",
  "動作環境",
] as const;

export const Tokushoho = () => (
  <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">特定商取引法に基づく表記</p>
      <h2 className="text-2xl font-semibold text-foreground">事業者情報</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        決済導線に必要な開示項目です。各欄は公開前に事業者情報へ置き換えてください。
      </p>
    </header>
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <tbody>
          {rows.map((label) => (
            <tr key={label} className="border-b border-border/60 last:border-b-0">
              <th className="w-40 bg-muted/40 px-4 py-4 align-top font-medium text-foreground sm:w-52">
                {label}
              </th>
              <td className="px-4 py-4 leading-7 text-muted-foreground">
                <span>準備中</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </article>
);
