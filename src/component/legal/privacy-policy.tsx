const sections = [
  {
    title: "1. 収集する情報",
    body: "本アプリは、会話内容、ユーザーが入力したプロフィール情報、利用端末情報、アクセス日時、エラー情報、決済に必要な最小限の取引情報を取得する場合があります。",
  },
  {
    title: "2. 利用目的",
    body: "取得した情報は、会話機能の提供、本人確認、課金処理、サービス改善、不正利用防止、問い合わせ対応、障害解析および重要なお知らせのために利用します。",
  },
  {
    title: "3. 第三者提供",
    body: "法令に基づく場合を除き、取得した個人情報を利用者本人の同意なく第三者へ提供しません。ただし、決済、インフラ運用、生成AI提供に必要な範囲で業務委託先または外部サービスへ送信することがあります。",
  },
  {
    title: "4. Cookie 等の利用",
    body: "本アプリは、表示最適化、セッション維持、アクセス解析、不正利用対策のために Cookie またはこれに類する技術を利用する場合があります。ブラウザ設定により無効化できますが、一部機能が利用できなくなることがあります。",
  },
  {
    title: "5. IndexedDB・ローカル保存",
    body: "本アプリは、会話履歴、設定、年齢確認状態などの一部情報を利用者のブラウザ内に IndexedDB または localStorage を用いて保存します。これらの情報は端末上に保存され、利用者自身で削除できます。",
  },
  {
    title: "6. 外部AIサービスへの送信",
    body: "会話生成および画像生成のため、入力内容や会話履歴の一部が OpenRouter および Novita に送信される場合があります。送信範囲はサービス提供に必要な最小限とし、各事業者のポリシーに従って取り扱われます。",
  },
  {
    title: "7. Cloudflare ログ",
    body: "本アプリは配信・保護基盤として Cloudflare を利用しており、アクセス元IPアドレス、リクエスト情報、エラー発生状況などの通信ログが Cloudflare 上で処理・保存される場合があります。",
  },
  {
    title: "8. ユーザーの権利",
    body: "利用者は、法令の定めに従い、自己に関する情報の開示、訂正、削除、利用停止等を求めることができます。請求方法は、下記連絡先から案内します。",
  },
  {
    title: "9. 改定",
    body: "本ポリシーは、法令改正やサービス内容の変更に応じて改定されることがあります。重要な変更を行う場合は、本アプリ上または適切な方法で周知します。",
  },
  {
    title: "10. 連絡先",
    body: "個人情報の取扱いに関するお問い合わせ先は、特定商取引法表示に記載する連絡先に準じます。",
  },
] as const;

export const PrivacyPolicy = () => (
  <article className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">プライバシーポリシー</p>
      <h2 className="text-2xl font-semibold text-foreground">情報の取扱いについて</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        本ページは審査提出用の草案です。公開前に法務と実運用フローに合わせて確定してください。
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
