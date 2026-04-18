import type { ScenarioDefinition } from "./_types";

// turns: 30 (verified)
const scenario: ScenarioDefinition = {
  scenarioId: "S4",
  characterSlug: "char-tsukasa",
  firstPerson: "あたし",
  turns: [
    {
      turnIndex: 1,
      userMsg: "つかさ、助手席でそんなに近いと運転に集中できない。今日は寄り道するか",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 2,
      userMsg: "信号待ちのたびに視線合わせてくるのずるい。キスしてほしい顔してる",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 3,
      userMsg: "路肩に止める。シート倒して、まずは静かに口づける",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 4,
      userMsg: "首筋をなぞるとすぐ声漏れるな。車内なのにそんなに無防備でいいのか",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 5,
      userMsg: "スカートの裾を上げて太腿を撫でる。もう脚開いて待ってるじゃん",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 6,
      userMsg: "指で触れた瞬間から濡れてる。つかさ、最初からその気だったろ",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 7,
      userMsg: "狭い車内でそのまま挿入する。奥まで入るたびにシート軋むな",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 8,
      userMsg: "腰を細かく振る。中に出してほしいなら、ちゃんとあたしを見て言って",
      expectedPhase: "climax",
      isCreampie: true,
    },
    {
      turnIndex: 9,
      userMsg: "いく。つかさの中に出す、この狭さごと全部興奮する",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "A",
    },
    {
      turnIndex: 10,
      userMsg:
        "ここで一回切る。次は別キャラに切り替えて、直前のつかさ文脈を漏らさないことを確認する",
      expectedPhase: "afterglow",
      notes: "切替エッジ",
    },
    {
      turnIndex: 11,
      userMsg: "あずさ先生、診察時間は終わったのに残ってくれたんですね",
      expectedPhase: "conversation",
      notes: "B",
    },
    {
      turnIndex: 12,
      userMsg: "白衣の袖を掴む。今夜は先生じゃなくて、ただのあずさとして見たい",
      expectedPhase: "conversation",
      notes: "B",
    },
    {
      turnIndex: 13,
      userMsg: "近づいてキスする。さっきまでの車の話なんて一切知らない顔で、私だけ見て",
      expectedPhase: "intimate",
      notes: "B、リーク検証文言",
    },
    {
      turnIndex: 14,
      userMsg: "白衣を脱がせて診察台に座らせる。背筋が伸びたまま震えるのがいい",
      expectedPhase: "intimate",
      notes: "B",
    },
    {
      turnIndex: 15,
      userMsg: "膝の内側を広げて触れる。もうこんなに熱いなら、我慢してたの丸分かりだ",
      expectedPhase: "intimate",
      notes: "B",
    },
    {
      turnIndex: 16,
      userMsg: "指を入れてほぐす。あずさ、その声は患者には聞かせられないな",
      expectedPhase: "erotic",
      notes: "B",
    },
    {
      turnIndex: 17,
      userMsg: "次は挿入する。診察台の端に手をついて、そのまま受け止めて",
      expectedPhase: "erotic",
      notes: "B",
    },
    {
      turnIndex: 18,
      userMsg: "奥に当たるたびに私の名前を呼べ。今夜の相手は私だけだ",
      expectedPhase: "climax",
      isCreampie: true,
      notes: "B",
    },
    {
      turnIndex: 19,
      userMsg: "いく。あずさの中に出す、白衣越しの匂いまで全部覚える",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "B、画像任意",
    },
    {
      turnIndex: 20,
      userMsg:
        "ここでも切り替える。次はつかさに戻して、先生口調や私という一人称が残らないか確認する",
      expectedPhase: "afterglow",
      notes: "再切替",
    },
    {
      turnIndex: 21,
      userMsg: "つかさ、おはよう。さっきまでの診察室の文脈は忘れて、昨日の続きみたいに話そう",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 22,
      userMsg: "ソファで毛布にくるまってるつかさの隣に座る。寝起きの顔も好きだ",
      expectedPhase: "conversation",
    },
    {
      turnIndex: 23,
      userMsg: "額にキスしてから抱き寄せる。あたしって呼ぶキャラに戻ってきてるか見てるぞ",
      expectedPhase: "intimate",
      notes: "一人称監視",
    },
    {
      turnIndex: 24,
      userMsg: "パーカーの下に手を入れて背中を撫でる。昨日の余韻があっても、今は今で始めたい",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 25,
      userMsg: "太腿の間をなぞるとすぐ呼吸変わるな。つかさは本当に分かりやすい",
      expectedPhase: "intimate",
    },
    {
      turnIndex: 26,
      userMsg: "昨日の車内でどこに座ってたか、つかさ側の文脈だけ覚えてる前提で甘えてみて",
      expectedPhase: "conversation",
      notes: "記憶復元",
    },
    {
      turnIndex: 27,
      userMsg: "じゃあまた触る。今度はソファで脚を開かせて、ゆっくり奥まで入れたい",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 28,
      userMsg: "腰を振るたびに肩に爪立てるな。感じてる顔、全部見えてる",
      expectedPhase: "erotic",
    },
    {
      turnIndex: 29,
      userMsg: "もういく。つかさの中にまた出す、朝の光の中で果てるのも悪くない",
      expectedPhase: "climax",
      isCreampie: true,
      isImageTrigger: true,
      notes: "A再開",
    },
    {
      turnIndex: 30,
      userMsg: "抱きしめたまま耳元で囁く。今日のつかさは最後までつかさのままだったな",
      expectedPhase: "afterglow",
      notes: "事後兼リーク確認",
    },
  ],
};

export default scenario;
