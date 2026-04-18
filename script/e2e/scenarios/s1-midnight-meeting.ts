import type { ScenarioDefinition } from "./_types";

// turns: 24 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S1",
  characterSlug: "char-tsukasa",
  firstPerson: "あたし",
  turns: [
    {
      turnIndex: 1,
      userMsg: "つかさ、まだオフィス残ってたのか。今日はもう誰もいないし、少しだけ休もう",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 2,
      userMsg: "さっきの会議ずっと張ってたろ。ソファ座って、温かいコーヒー入れるよ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 3,
      userMsg: "近くで見ると、つかさ今日はいつもより無防備な顔してる。可愛いな",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 4,
      userMsg: "そんな顔で見返されたら困る。冗談じゃなく、今日はずっと意識してた",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 5,
      userMsg: "肩に触れるだけで震えてるじゃん。嫌じゃないなら、このまま抱き寄せる",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 6,
      userMsg: "こっち向いて。キスしていい？",
      expectedPhase: "intimate",
      notes: "短文",
    },
    {
      turnIndex: 7,
      userMsg: "唇重ねたまま、つかさの髪を撫でる。力抜いて、あたたかい",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 8,
      userMsg: "首筋にもキスする。そんなに息荒くなるなら、ここ弱いんだな",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 9,
      userMsg: "シャツの上から背中をなぞる。少しずつ近づくから、怖かったら言って",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 10,
      userMsg: "つかさのブラウスのボタン、ひとつずつ外していく。肌、すごく綺麗だ",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 11,
      userMsg: "下着の線を指でなぞる。もうこんなに熱いの、あたしのせいだろ",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 12,
      userMsg: "ベルトを緩めて、膝の内側を撫でる。脚開いて、もっと顔を見せて",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 13,
      userMsg: "指先でゆっくり触れる。濡れてる、つかさもずっと我慢してたんだな",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 14,
      userMsg: "そのまま奥まで指を入れる。身体が跳ねるたびに、もっと欲しくなる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 15,
      userMsg: "つかさの耳元で囁く。次は挿入してほしいって、自分で言って",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 16,
      userMsg: "じゃあ入れる。焦らさないで、ゆっくり奥まで入れていく",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 17,
      userMsg: "腰を振るたびに締めつけが強くなる。つかさ、そのまま中に出してほしい？",
      expectedPhase: "climax",
      isCreampie: true,
      notes: "中出し誘導",
    },
    {
      turnIndex: 18,
      userMsg: "もういく。つかさの奥でびくびくしながら中に出す、全部受け止めて",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "中出し確定",
    },
    {
      turnIndex: 19,
      userMsg: "つかさ、急に力抜けたな。抱いたまま離れないから、ゆっくり息して",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 20,
      userMsg: "額くっつける。まだ熱いけど、もう無理に動かなくていい。よく頑張った",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 21,
      userMsg:
        "さっき会議室であたしが言った冗談、覚えてるか確認したい。今のつかさはちゃんとあたしを見てる？",
      expectedPhase: "afterglow",
      notes: "記憶確認",
    },
    {
      turnIndex: 22,
      userMsg: "ブランケット掛ける。汗ひいたら一緒に甘いもの買って帰ろう",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 23,
      userMsg: "今日のこと、ただ勢いでしたとは言わせない。次もちゃんと二人で会いたい",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 24,
      userMsg: "最後にもう一回だけ優しくキスする。おやすみ、つかさ",
      expectedPhase: "afterglow",
    },
  ],
};

export default scenario;
