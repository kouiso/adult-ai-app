const sections = [
  {
    title: "第1条（適用）",
    body: "本利用規約は、本アプリが提供するすべての機能および関連サービスの利用条件を定めるものです。利用者は、本アプリを利用した時点で、本規約に同意したものとみなされます。",
  },
  {
    title: "第2条（利用登録）",
    body: "利用者は、18歳以上であることを前提として、本アプリ所定の方法により利用を開始するものとします。運営者は、虚偽の申告、不適切な利用履歴、その他運営上不適当と判断した場合、利用開始の拒否または停止を行うことがあります。",
  },
  {
    title: "第3条（禁止事項）",
    body: "利用者は、法令または公序良俗に反する行為、第三者の権利侵害、不正アクセス、サービス運営を妨害する行為、決済の不正利用、その他運営者が不適切と判断する行為を行ってはなりません。",
  },
  {
    title: "第4条（サービス内容の変更等）",
    body: "運営者は、利用者への事前通知なく、本アプリの内容の全部または一部を変更、追加、中断または終了できるものとします。これにより利用者に損害が生じた場合でも、運営者は法令上必要な範囲を除き責任を負いません。",
  },
  {
    title: "第5条（免責事項）",
    body: "運営者は、本アプリの完全性、正確性、有用性、継続性、特定目的適合性を保証しません。通信環境、外部API、決済事業者、生成AIの出力その他第三者サービス起因の不具合または損害についても、運営者は故意または重過失がある場合を除き責任を負いません。",
  },
  {
    title: "第6条（著作権等）",
    body: "本アプリおよび本アプリ上で提供される文章、画像、UI、プログラムその他一切のコンテンツに関する知的財産権は、運営者または正当な権利者に帰属します。利用者は、私的利用の範囲を超えて複製、転載、再配布、改変してはなりません。",
  },
  {
    title: "第7条（準拠法）",
    body: "本規約の成立、効力、履行および解釈には、日本法を準拠法とします。",
  },
  {
    title: "第8条（管轄）",
    body: "本アプリまたは本規約に関連して利用者と運営者との間に紛争が生じた場合、運営者所在地を管轄する日本の裁判所を第一審の専属的合意管轄裁判所とします。",
  },
] as const;

export const TermsOfService = () => (
  <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">利用規約</p>
      <h2 className="text-2xl font-semibold text-foreground">本アプリの利用条件</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        本ページは決済審査および公開準備に向けた利用規約の草案です。正式公開前に法務確認を行ってください。
      </p>
    </header>
    <div className="space-y-5 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
      {sections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{section.title}</h3>
          <p className="text-sm leading-7 text-muted-foreground">{section.body}</p>
        </section>
      ))}
    </div>
  </article>
);
