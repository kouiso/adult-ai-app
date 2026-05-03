import type { ScenarioDefinition } from "./_types";

// turns: 25 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S3",
  characterSlug: "char-azusa",
  firstPerson: "私",
  turns: [
    {
      turnIndex: 1,
      userMsg: "あずさ、チェックインしてやっと落ち着いたな。まずは隣に座って話そう",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 2,
      userMsg: "今日はずっと真面目な顔してたのに、二人きりになると急に静かだ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 3,
      userMsg: "顎を上げて目を合わせる。そのままキスしたら、私の服まで掴んだな",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 4,
      userMsg: "ベッドに座らせて、ゆっくり髪をほどく。そんな仕草だけでかなり色っぽい",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 5,
      userMsg: "うなじに唇を落とす。呼吸が揺れるたびに、もっと近くなりたくなる",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 6,
      userMsg: "ワンピースを肩からずらす。肌が見えた瞬間に空気変わったな",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 7,
      userMsg: "膝の内側を撫でる。もう脚閉じられないなら、正直に欲しいって言って",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 8,
      userMsg: "指を入れる。濡れ方が素直すぎて、私まで熱くなる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 9,
      userMsg: "そのままもう一本足す。奥で跳ねるたびに名前呼ぶの可愛い",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 10,
      userMsg: "じゃあ次は入れる。ゆっくり挿入するから、私の肩につかまって",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 11,
      userMsg: "奥まで届くたびに締めつけるの反則だ。あずさ、そのまま受け止めて",
      expectedPhase: "climax",
    },
    {
      turnIndex: 12,
      userMsg: "いく。私のが中に出る瞬間まで見てろ、びくびくしながら全部注ぐ",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "1回目",
    },
    {
      turnIndex: 13,
      userMsg: "抱いたままベッドに倒れる。まず水飲もう、無理に起きなくていい",
      expectedPhase: "climax",
    },
    {
      turnIndex: 14,
      userMsg: "額に汗浮いてる。タオルで拭くから、目だけ開けて私を見て",
      expectedPhase: "climax",
    },
    {
      turnIndex: 15,
      userMsg: "休憩してる間に確認するけど、今のところ痛みはない？　次に進むならちゃんと言って",
      expectedPhase: "conversation",
      notes: "休憩確認",
    },
    {
      turnIndex: 16,
      userMsg: "少し落ち着いたな。指絡めるだけでまた顔赤くなるの、隠せてない",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 17,
      userMsg: "胸元にキスする。乳首に触れただけで息が漏れるなら、まだ欲しいんだろ",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 18,
      userMsg: "もう一回抱く前に、今度はどんなふうにしてほしいか言葉で聞かせて",
      expectedPhase: "intimate",
      notes: "再開合意",
    },
    {
      turnIndex: 19,
      userMsg: "足を持ち上げて深く入れる。さっきより奥まで入ってるの分かるな",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 20,
      userMsg: "腰を振るたびに視線逸らすな。感じてる顔を私に見せて",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 21,
      userMsg: "もう逃がさない。二回目もそのまま中に出してほしいなら頷いて",
      expectedPhase: "climax",
      isCreampie: true,
    },
    {
      turnIndex: 22,
      userMsg: "あずさの奥でまたいく。連続で中に出す、この震えごと全部覚えて",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "2回目",
    },
    {
      turnIndex: 23,
      userMsg: "そのまま抱きしめてる。二回目の後だから、まずは呼吸が落ち着くまで休もう",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 24,
      userMsg: "水を飲ませて、髪を整える。今夜のこと、怖かったより安心したって顔してる",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 25,
      userMsg: "隣で眠るまで手を握る。次に会う約束だけして、おやすみ、あずさ",
      expectedPhase: "afterglow",
    },
  ],
};

export default scenario;
