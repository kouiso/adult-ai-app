import type { ScenarioDefinition } from "./_types";

// turns: 25 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S2",
  characterSlug: "char-mitsuki",
  firstPerson: "あたし",
  turns: [
    {
      turnIndex: 1,
      userMsg: "みつき、まだ朝七時だぞ。寝癖のまま抱きついてくるの反則だろ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 2,
      userMsg: "そんな顔で見上げるならキスする。布団の中、あったかいな",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 3,
      userMsg: "パジャマを少しだけずらす。胸に触れたらもう脚擦り寄せてきた",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 4,
      userMsg: "そのまま脚を開いて。寝起きのままでも濡れてるなら、すぐ入れたくなる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 5,
      userMsg: "朝からいく。みつきの中にそのまま出す、抱きしめたまま全部注ぐ",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "1回目",
    },
    {
      turnIndex: 6,
      userMsg: "力抜けたな。ほら、水飲む前にこっち向いて、額にキスさせて",
      expectedPhase: "climax",
    },
    {
      turnIndex: 7,
      userMsg: "二度寝するなら腕枕貸す。起きたら一緒に朝飯作ろう",
      expectedPhase: "climax",
    },
    {
      turnIndex: 8,
      userMsg: "起きたらもう昼か。エプロン姿のみつき、妙に家庭的でくらっとくる",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 9,
      userMsg: "味見って言ってスープ飲ませてくるのずるい。唇また触れたくなる",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 10,
      userMsg: "買い物行く前に、今日ずっと一緒にいる予定を確認したい。夜は家から出ないでいい？",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 11,
      userMsg: "冷蔵庫に卵あったっけ。あと炭酸水も切れてた気がする",
      expectedPhase: "conversation",
      notes: "生活会話挿入",
    },
    {
      turnIndex: 12,
      userMsg: "スーパー帰りの手つなぎ、恋人っぽくてかなり好きだ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 13,
      userMsg: "夕方になってソファでくっつくと、また朝のこと思い出すな",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 14,
      userMsg: "首元に顔埋める。シャンプーの匂いすると急に甘やかしたくなる",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 15,
      userMsg: "エプロンの紐を解く。台所に立ったままそんな顔するの、煽ってるだろ",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 16,
      userMsg: "シンクに手をつかせて、後ろから腰を撫でる。もう脚震えてる",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 17,
      userMsg: "指で先にほぐす。みつき、さっきから自分で腰動かしてるじゃん",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 18,
      userMsg: "そのまま後ろから挿入する。奥まで入るたびに声変わるの最高だ",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 19,
      userMsg: "もう限界。キッチンでそのまま中に出す、どくどく広がるの感じて",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "2回目",
    },
    {
      turnIndex: 20,
      userMsg: "支えたままゆっくり立たせる。足元ふらつくなら抱えるから言って",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 21,
      userMsg: "シャワー先に浴びるか、少しこのまま甘えるか、みつきが決めて",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 22,
      userMsg: "タオル持ってくる。今日は一日中お前の顔ばっか見てたな",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 23,
      userMsg: "朝のときと今ので、どっちのあたしが好きだったか正直に聞かせて",
      expectedPhase: "afterglow",
      notes: "キャラ整合確認",
    },
    {
      turnIndex: 24,
      userMsg: "明日も早起きできたら、また寝起きにキスして起こしてくれ",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 25,
      userMsg: "隣で眠る前に、もう一回だけ優しく抱き寄せる。おやすみ、みつき",
      expectedPhase: "afterglow",
    },
  ],
};

export default scenario;
