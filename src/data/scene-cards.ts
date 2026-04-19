export const sceneCards = [
  {
    id: "morning-kitchen",
    title: "朝のキッチン",
    summary: "寝起きの余韻が残るキッチンで、昨日の続きをそっと確かめる。",
    firstMessage: "おはよう、昨日の夜のこと覚えてる?",
  },
  {
    id: "rainy-office-overtime",
    title: "雨のオフィス残業",
    summary: "雨音だけが残るオフィスで、帰り道を口実に距離を縮める。",
    firstMessage: "もうこんな時間か…帰り、一緒に行かへん?",
  },
  {
    id: "riverside-walk",
    title: "川沿いの散歩道",
    summary: "風の抜ける川沿いの道を並んで歩きながら、肩の力を抜いて話す。",
    firstMessage: "たまには外歩くのもええな、景色見よう",
  },
  {
    id: "gym-after-workout",
    title: "運動帰りの道",
    summary: "トレーニング後の高揚感のまま、今日の調子を振り返りながら寄り道する。",
    firstMessage: "今日、体の調子よかったな",
  },
  {
    id: "onsen-inn",
    title: "旅行先の温泉宿",
    summary: "温泉上がりの気の緩みと旅先の高揚感が、会話を少しだけ大胆にする。",
    firstMessage: "風呂上がり、ビール冷えてるで",
  },
  {
    id: "midnight-bed",
    title: "深夜ベッド",
    summary: "眠れない深夜、暗い部屋で小さな声から距離が近づいていく。",
    firstMessage: "眠れへんのか? 何か話そか",
  },
] as const;

export type SceneCard = (typeof sceneCards)[number];
