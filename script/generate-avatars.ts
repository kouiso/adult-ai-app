import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// .dev.varsからNOVITA_API_KEYを取得
const devVars = readFileSync(join(import.meta.dirname, "..", ".dev.vars"), "utf-8");
const apiKeyMatch = devVars.match(/NOVITA_API_KEY=(.+)/);
if (!apiKeyMatch) throw new Error("NOVITA_API_KEY not found in .dev.vars");
const NOVITA_API_KEY = apiKeyMatch[1].trim();

const AVATARS_DIR = join(import.meta.dirname, "..", "public", "avatars");

// キャラIDと外見描写のマッピング
// systemPromptの日本語記述から英語のanime portrait promptに変換済み
const CHARACTER_PROMPTS: Record<string, string> = {
  "char-mitsuki":
    "1girl, bartender, age 24, long black hair, mature woman, open chest white shirt, black vest, alluring smile, bar counter background, warm lighting",
  "char-rinka":
    "1girl, college student, age 20, glasses, brown hair in ponytail, innocent look, white blouse, cardigan, university library background, soft lighting",
  "char-azusa":
    "1girl, female doctor, age 28, short black hair, cool expression, white lab coat, stethoscope, hospital office background, professional lighting",
  "char-hikari":
    "1girl, maid, age 22, twin tails, pink hair, mischievous smile, frilly maid outfit, black and white dress, cafe background, bright lighting",
  "char-saya":
    "1girl, married woman, age 32, gentle expression, long brown hair, apron over casual dress, kitchen background, warm domestic lighting",
  "char-reina":
    "1girl, dominatrix, age 26, long silver hair, sharp red eyes, confident smirk, black leather outfit, choker, dark room background, dramatic lighting",
  "char-suzu":
    "1girl, maid, age 19, short blue hair, shy expression, classic maid uniform, headband, mansion interior background, gentle lighting",
  "char-yuno":
    "1girl, yandere, age 21, long pink hair, obsessive loving eyes, school uniform with cardigan, bedroom background, dim lighting",
  "char-tsukasa":
    "1girl, office worker, age 23, short brown hair, tsundere expression, business suit, glasses pushed up, office background, fluorescent lighting",
  "char-mamiko":
    "1girl, maternal figure, age 35, long wavy brown hair, warm gentle smile, loose sweater, living room background, cozy warm lighting",
  "char-ran":
    "1girl, gyaru, age 20, blonde hair with highlights, tanned skin, bright smile, crop top, accessories, city night background, neon lighting",
  "char-lilith":
    "1girl, succubus, demon horns, long purple hair, seductive red eyes, revealing dark dress, bat wings, fantasy dark castle background, moonlight",
  "char-kaori":
    "1girl, teacher, age 29, glasses, brown hair in bun, strict expression, white blouse, tight pencil skirt, classroom background, afternoon light",
  "char-chihaya":
    "1girl, shrine maiden, age 22, long black hair, traditional miko outfit, white haori and red hakama, shrine background, serene lighting",
  "char-akane":
    "1girl, sporty girl, age 24, short red hair, tanned skin, confident grin, sports bra, athletic build, gym background, bright lighting",
  "char-shizuku":
    "1girl, widow, age 30, long black hair, melancholic expression, black mourning dress, elegant, traditional Japanese room, dim candle lighting",
  "char-mei":
    "1girl, counselor, age 27, medium purple hair, mysterious smile, professional blazer, hypnotic spiral eyes, therapy room background, soft lighting",
  "char-mao":
    "1girl, seductress, age 25, short black bob hair, bold expression, tight red dress, elevator interior background, dramatic close-up lighting",
  "char-natsumi":
    "1girl, office lady, age 26, long brown hair, elegant, black stockings focus, pencil skirt, office desk background, warm lighting",
  "char-koharu":
    "1girl, perfumer, age 23, wavy light brown hair, dreamy expression, floral dress, surrounded by perfume bottles, boutique background, golden lighting",
  "char-rio":
    "1girl, gravure model, age 22, long blonde hair, playful wink, swimsuit, outdoor park background, bright sunlight",
  "char-miku":
    "1girl, cosplayer, age 21, multicolor hair, excited expression, elaborate costume, convention hall background, colorful lighting",
  "char-noir":
    "1girl, vampire, age unknown, long white hair, red eyes, gothic lolita dress, fangs visible, dark castle interior, moonlight through window",
  "char-alice":
    "1girl, ojou-sama, age 18, long blonde curly hair, innocent wide eyes, white lace dress, rose garden background, soft romantic lighting",
  "char-sora":
    "1girl, twin sister elder, age 20, medium blue hair, confident expression, matching outfit with ribbon, bedroom background, natural lighting",
  "char-umi":
    "1girl, twin sister younger, age 20, medium blue hair, shy expression, matching outfit with different ribbon, bedroom background, natural lighting",
  "char-sumire":
    "1girl, female boss, age 34, short dark hair, stern expression, power suit, high heels, executive office background, cold lighting",
  "char-tsubaki":
    "1girl, rope artist, age 28, long black hair with red highlights, calm artistic expression, traditional kimono loosely worn, tatami room, warm lighting",
  "char-kirara":
    "1girl, VTuber streamer, age 21, long pink twintails, starry eyes, cute idol outfit with headset, streaming room with monitors, RGB lighting",
  "char-hinata":
    "1girl, nurse, age 25, short orange hair, caring smile, white nurse uniform, hospital room background, clinical lighting",
  "char-kanon":
    "1girl, step-sister, age 23, long light brown hair, slightly embarrassed expression, oversized t-shirt, home interior background, morning light",
  "char-risa":
    "1girl, escort, age 26, glamorous, long wavy black hair, beautiful makeup, elegant black dress, luxury hotel lobby background, ambient lighting",
  "char-sieglinde":
    "1girl, female knight, age 24, muscular build, long blonde braided hair, armor partially removed, medieval castle background, torch lighting",
  "char-tama":
    "1girl, catgirl, age 19, cat ears, short orange hair, playful expression, oversized sweater, tail visible, cozy room background, warm lighting",
  "char-sayoko":
    "1girl, mature woman, age 50, elegant grey-streaked black hair in updo, calm composed expression, traditional kimono, calligraphy room, soft lighting",
  "char-iris07":
    "1girl, android, age unknown, short silver hair, LED blue eyes, minimal expression, white bodysuit with circuit patterns, sci-fi lab background, blue lighting",
  "char-nagisa":
    "1girl, girlfriend, age 22, medium brown hair, gentle loving expression, casual sundress, park bench background, golden hour lighting",
  "char-aoi":
    "1girl, news anchor, age 27, styled black bob hair, professional smile, elegant blouse, TV studio background, studio lighting",
  "char-madoka":
    "1girl, fortune teller, age 25, long wavy dark purple hair, mysterious expression, flowing robe with stars, crystal ball, dimly lit tent, candlelight",
  "char-ushirokono":
    "1girl, ghost girl, age unknown, long pale white hair, hollow dark eyes, tattered white dress, dark apartment room, eerie blue-white lighting",
};

const COMMON_PREFIX =
  "masterpiece, best quality, anime style, 1girl, portrait, face focus, upper body, looking at viewer, detailed face, beautiful eyes, ";
const COMMON_NEGATIVE =
  "worst quality, low quality, normal quality, lowres, bad anatomy, bad hands, extra fingers, missing fingers, text, watermark, signature, blurry, realistic, photorealistic, 3d, western, multiple girls, nsfw, nude, nipples";

async function initTask(prompt: string): Promise<string> {
  const res = await fetch("https://api.novita.ai/v3/async/txt2img", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOVITA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      extra: { response_image_type: "jpeg" },
      request: {
        model_name: "meinahentai_v4_70340.safetensors",
        prompt: COMMON_PREFIX + prompt,
        negative_prompt: COMMON_NEGATIVE,
        width: 512,
        height: 512,
        sampler_name: "DPM++ 2M Karras",
        steps: 28,
        guidance_scale: 7,
        image_num: 1,
        seed: -1,
      },
    }),
  });
  if (!res.ok) throw new Error(`Novita init failed: ${res.status} ${await res.text()}`);
  const data: { task_id: string } = await res.json();
  return data.task_id;
}

async function pollTask(taskId: string, maxAttempts = 60): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(
      `https://api.novita.ai/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${NOVITA_API_KEY}` } },
    );
    if (!res.ok) throw new Error(`Novita poll failed: ${res.status}`);
    const data = await res.json();
    if (data.task?.status === "TASK_STATUS_SUCCEED") {
      const imageUrl = data.images?.[0]?.image_url;
      if (!imageUrl) throw new Error("No image URL in response");
      return imageUrl;
    }
    if (data.task?.status === "TASK_STATUS_FAILED") {
      throw new Error(`Task failed: ${JSON.stringify(data.task)}`);
    }
    process.stdout.write(".");
  }
  throw new Error(`Task ${taskId} timed out after ${maxAttempts * 3}s`);
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buffer);
}

async function main() {
  const entries = Object.entries(CHARACTER_PROMPTS);
  console.log(`\n🎨 Generating ${entries.length} character avatars...\n`);

  // 既に生成済みのキャラはスキップ
  const pending = entries.filter(([id]) => {
    const path = join(AVATARS_DIR, `${id}.jpg`);
    if (existsSync(path)) {
      console.log(`⏭  ${id} — already exists, skipping`);
      return false;
    }
    return true;
  });

  if (pending.length === 0) {
    console.log("\n✅ All avatars already generated!");
    return;
  }

  console.log(`\n📦 ${pending.length} avatars to generate\n`);

  // Novita APIのレート制限を考慮して3並列で処理
  const CONCURRENCY = 3;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async ([id, prompt]) => {
        try {
          process.stdout.write(`🖌  ${id}: initiating...`);
          const taskId = await initTask(prompt);
          process.stdout.write(` task=${taskId.slice(0, 8)}... polling`);
          const imageUrl = await pollTask(taskId);
          const destPath = join(AVATARS_DIR, `${id}.jpg`);
          await downloadImage(imageUrl, destPath);
          console.log(`\n✅ ${id}: saved to ${destPath}`);
        } catch (error) {
          console.error(`\n❌ ${id}: ${error instanceof Error ? error.message : error}`);
        }
      }),
    );
  }

  console.log("\n🎉 Avatar generation complete!");
  console.log("Next steps:");
  console.log("  1. Run: pnpm db:seed:reset  (avatars will be linked automatically)");
}

main().catch(console.error);
