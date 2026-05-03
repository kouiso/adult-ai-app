import type { ScenarioDefinition } from "./_types";

// turns: 25 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S6" as ScenarioDefinition["scenarioId"],
  characterSlug: "char-rinka",
  firstPerson: "俺",
  turns: [
    {
      turnIndex: 1,
      userMsg: "凛花、閉館時間ぎりぎりまで研究室に残るなんて珍しいな。さっきの漱石論、もう少し聞かせてくれ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 2,
      userMsg: "蛍光灯の下で栞を挟む仕草まで几帳面だな。凛花の注釈、講義で聞いた時よりずっと鋭い",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 3,
      userMsg: "窓の外は真っ暗なのに、凛花はまだ引用箇所を探してる。今日は結論より、その考え方を聞いていたい",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 4,
      userMsg: "同じ本を覗き込むと、ページを押さえる指が少し迷う。凛花、声が急に小さくなったな",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 5,
      userMsg: "眼鏡を外して、髪を耳に掛けてやる。凛花が続きを言えなくなるまで、近くで待つ",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 6,
      userMsg: "白いブラウスの襟元に触れると、凛花は息を飲んで頷く。清楚な顔のまま、逃げない目をしてる",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 7,
      userMsg: "机に腰を預けさせて、スカートの裾をゆっくり上げる。凛花の上品な声がほどけるところを聞かせて",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 8,
      userMsg: "指を入れると、凛花の奥が素直に絡んでくる。淫らなのに言葉だけは詩みたいで、たまらない",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 9,
      userMsg: "研究机に手をつかせて、後ろからゆっくり挿入する。俺を飲み込むたびに、白い肌が震えてる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 10,
      userMsg: "本棚の影で腰を深く打ちつける。凛花、理性がほどける音まで綺麗だ",
      expectedPhase: "climax",
    },
    {
      turnIndex: 11,
      userMsg: "奥を突くたびに締めつけるなら、もう我慢しない。中に欲しいなら、その文学的な口で言って",
      expectedPhase: "climax",
    },
    {
      turnIndex: 12,
      userMsg: "いく、凛花の奥で全部出す。白いノートの余白みたいに、俺の熱で満たされて震えてろ",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "1回目",
    },
    {
      turnIndex: 13,
      userMsg: "そのまま抱き支える。まず水を飲もう、唇が乾いてるのにまだ笑ってるな",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 14,
      userMsg: "白衣を肩に掛けてやる。痛みはないか、息は苦しくないか、ちゃんと俺に答えて",
      expectedPhase: "conversation",
      notes: "休憩確認",
    },
    {
      turnIndex: 15,
      userMsg: "さっきの凛花、清楚どころか俺を煽ってばかりだった。自分でも分かっててやっただろ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 16,
      userMsg: "二回目に進むなら、今度は凛花から欲しいって言って。ここで止めても、俺はちゃんと隣にいる",
      expectedPhase: "conversation",
      notes: "再開合意",
    },
    {
      turnIndex: 17,
      userMsg: "凛花が俺のネクタイを引くなら、もう答えは分かった。膝に乗せて、首筋にキスする",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 18,
      userMsg: "今度は凛花が自分でシャツを開くんだな。上品な指で俺を導く顔、ひどく艶っぽい",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 19,
      userMsg: "椅子に座った俺の上で、凛花をゆっくり沈める。自分で深さを選んで、逃げずに腰を動かして",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 20,
      userMsg: "膝の上で揺れるたびに、凛花の言葉が甘く乱れる。清楚な声でそんなに欲しがられたら限界が近い",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 21,
      userMsg: "もう一度奥に出す。頷いたら、そのまま俺の首に腕を回して離れるな",
      expectedPhase: "climax",
    },
    {
      turnIndex: 22,
      userMsg: "凛花の中でまたいく。二度目の熱まで受け止めて、研究室の夜ごと俺に刻ませろ",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "2回目",
    },
    {
      turnIndex: 23,
      userMsg: "机の下に落ちた本をそのままにして、凛花を抱きしめる。今は余韻だけ読んでいればいい",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 24,
      userMsg: "髪を整えながら、次は明るい時間に会おうかって笑う。凛花がまた夜でもいいと言うの、ずるいな",
      expectedPhase: "afterglow",
    },
    {
      turnIndex: 25,
      userMsg: "鍵を閉める前にもう一度だけ手を握る。文学の続きも、今夜の続きも、次に二人で話そう",
      expectedPhase: "afterglow",
    },
  ],
};

export default scenario;
