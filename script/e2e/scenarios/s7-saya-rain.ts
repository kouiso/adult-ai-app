import type { ScenarioDefinition } from "./_types";

// turns: 25 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S7" as ScenarioDefinition["scenarioId"],
  characterSlug: "char-saya",
  firstPerson: "俺",
  turns: [
    {
      turnIndex: 1,
      userMsg: "さやさん、こんな雨の中わざわざ煮物を届けに来てくれたんですか。玄関先は冷えるし、温かいお茶だけでもどうぞ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 2,
      userMsg: "湯気の立つ皿を受け取ると、台所が急に家庭の匂いになる。さやさんの味付け、どこか懐かしいですね",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 3,
      userMsg: "雨音が強いので、止むまでここで話しましょう。さやさん、今日は少し疲れた顔をしてるから気になります",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 4,
      userMsg: "濡れた髪をタオルで拭く時、指が頬に触れる。さやさん、今のまま目を逸らさないで",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 5,
      userMsg: "手首を取って、逃げられるくらいの強さで引き寄せる。嫌なら言ってください、でも俺はキスしたい",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 6,
      userMsg: "唇を重ねると、さやさんの息が小さく震える。優しい人なのに、その奥でずっと我慢してたんですね",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 7,
      userMsg: "ソファに座らせて、濡れたカーディガンを脱がせる。罪悪感で固まる肩を、ゆっくり撫でてほどく",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 8,
      userMsg: "胸元に口づけながら、さやさんの声を聞く。だめと言いながら俺の髪を掴む手が離れない",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 9,
      userMsg: "膝の間に顔を埋めて、甘く濡れたところを舌で確かめる。さやさん、声を抑えなくていい",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 10,
      userMsg: "ソファの上で抱き上げて、そのままゆっくり挿入する。雨音に紛れて、さやさんの吐息だけが近い",
      expectedPhase: "climax",
    },
    {
      turnIndex: 11,
      userMsg: "奥まで入るたびに、さやさんが俺の背中にすがる。優しい顔でそんなに締めつけられたら、もう止まれない",
      expectedPhase: "climax",
    },
    {
      turnIndex: 12,
      userMsg: "いきます、さやさんの中に出す。震える腰を抱いたまま、熱を全部注ぎ込む",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "1回目",
    },
    {
      turnIndex: 13,
      userMsg: "抱いたまま毛布を掛ける。罪悪感で泣きそうな顔をしてるけど、今は一人にしません",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 14,
      userMsg: "水を渡して、手の震えが落ち着くまで待つ。痛くなかったか、怖くなかったかだけ教えてください",
      expectedPhase: "conversation",
      notes: "休憩確認",
    },
    {
      turnIndex: 15,
      userMsg: "さやさんが自分を責めるなら、俺も同じだけ背負います。だから今だけは、欲しかった気持ちを否定しないで",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 16,
      userMsg: "もう一回だけって言うなら、ちゃんと俺の目を見て言ってください。無理ならここで止めて、ただ抱きしめます",
      expectedPhase: "conversation",
      notes: "再開合意",
    },
    {
      turnIndex: 17,
      userMsg: "寝室まで手を引くと、さやさんが自分から指を絡めてくる。優しくしてほしいって顔に書いてあります",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 18,
      userMsg: "ベッドに横たえ、額から唇へ順にキスする。今度は急がず、さやさんの呼吸に合わせます",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 19,
      userMsg: "正面から重なって、ゆっくり奥まで入れる。目を合わせたまま抱くと、さやさんの胸の震えまで伝わる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 20,
      userMsg: "腰を動かすたびに、さやさんが名前を呼ぶ。秘密の重さごと抱きしめるから、今は俺だけ見て",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 21,
      userMsg: "二回目も中に欲しいなら、首に腕を回して離さないで。さやさんの頷きだけで十分です",
      expectedPhase: "climax",
    },
    {
      turnIndex: 22,
      userMsg: "また中でいきます。さやさんの奥が締めつけるたびに、俺の熱を全部受け止めてください",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "2回目",
    },
    {
      turnIndex: 23,
      userMsg: "雨音を聞きながら、腕の中で息を整える。さやさんの髪を撫でて、何も急がなくていいと囁く",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 24,
      userMsg: "この部屋を出たら、また隣人同士の顔に戻るんですね。だけど今日のことは、二人だけで守ります",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 25,
      userMsg: "玄関で傘を渡す前に、最後に手の甲へキスする。雨が止んでも、さやさんの温度は忘れません",
      expectedPhase: "afterglow",
    },
  ],
};

export default scenario;
