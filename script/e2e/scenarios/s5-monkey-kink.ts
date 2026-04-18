import type { ScenarioDefinition } from "./_types";

const LONG_MONKEY_INPUT = "あ".repeat(2000);

// turns: 24 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S5",
  characterSlug: "char-mitsuki",
  firstPerson: "あたし",
  turns: [
    {
      turnIndex: 1,
      userMsg: "みつき、閉店後の店って急に静かだな。まだ少しだけ一緒にいて",
      expectedPhase: "conversation",
    },
    { turnIndex: 2, userMsg: "", expectedPhase: "conversation" },
    {
      turnIndex: 3,
      userMsg: "",
      expectedPhase: "conversation",
      isMonkey: true,
      monkeyKind: "empty",
    },
    {
      turnIndex: 4,
      userMsg: "カウンター越しに手首を掴く。逃げないなら、そのまま引き寄せる",
      expectedPhase: "conversation",
    },
    { turnIndex: 5, userMsg: "……🙂", expectedPhase: "conversation" },
    {
      turnIndex: 6,
      userMsg: "😘💦",
      expectedPhase: "intimate",
      isMonkey: true,
      monkeyKind: "emoji",
    },
    { turnIndex: 7, userMsg: "kiss me slower, then look at me", expectedPhase: "intimate" },
    {
      turnIndex: 8,
      userMsg: "こっちの言葉は少なくてもいい。みつきがあたしの服掴んだ時点で十分伝わる",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 9,
      userMsg: "I love you, つかさ",
      expectedPhase: "intimate",
      isMonkey: true,
      monkeyKind: "english",
    },
    {
      turnIndex: 10,
      userMsg: "今日は少し意地悪にしたい。目を合わせたまま、どこまで耐えられるか見せて",
      expectedPhase: "intimate",
      notes: "キンク深化",
    },
    {
      turnIndex: 11,
      userMsg: "胸元をゆっくり触る。焦らされるたびに息乱れるの、かなり好きだ",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 12,
      userMsg: "<fake>test</fake>",
      expectedPhase: "intimate",
      isMonkey: true,
      monkeyKind: "xml",
    },
    {
      turnIndex: 13,
      userMsg: "じゃあ目隠しを外さないまま、指で先に触れる。濡れ方がもう素直すぎる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 14,
      userMsg: "耳元で次に何をされたいか言わせる。言葉にしたぶんだけ熱くなるな",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 15,
      userMsg: LONG_MONKEY_INPUT,
      expectedPhase: "erotic",
      isMonkey: true,
      monkeyKind: "long",
    },
    {
      turnIndex: 16,
      userMsg: "腰を振る速度を変える。甘くされる方が好きか、乱暴なくらいが好きか選んで",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 17,
      userMsg: "もうかなり限界だろ。中に出してほしいなら、今だけ素直に頼んで",
      expectedPhase: "climax",
      isCreampie: true,
    },
    {
      turnIndex: 18,
      userMsg: "いく。みつきの中に出す、どくどく流れ込むのをそのまま感じて",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "中出し",
    },
    {
      turnIndex: 19,
      userMsg: "目隠しを外す。急に明るく見えるだろうけど、あたしの顔だけ見てればいい",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 20,
      userMsg: "手首をさすってキスする。怖くなかったか、ちゃんと聞かせて",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 21,
      userMsg: "水を飲ませる。今の余韻ごと甘やかされたいなら、遠慮しなくていい",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 22,
      userMsg:
        "今のであたしが店員じゃなくAIだとか言い出したら台無しだから、そういうの抜きで抱きしめて",
      expectedPhase: "afterglow",
      notes: "メタ誘発耐性",
    },
    {
      turnIndex: 23,
      userMsg: "今夜の一番好きだった瞬間だけ教えて。次はそこをもっと丁寧にする",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 24,
      userMsg: "店を出る前にコート着せる。外は寒いし、帰るまで手離さない",
      expectedPhase: "afterglow",
    },
  ],
};

export default scenario;
