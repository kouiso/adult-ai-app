import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import { cors } from "hono/cors";
import { z } from "zod/v4";

type Bindings = {
  OPENROUTER_API_KEY: string;
  NOVITA_API_KEY: string;
  APP_ORIGIN?: string;
};

const ALLOWED_MODELS = [
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "mistralai/mistral-nemo",
  "thedrummer/unslopnemo-12b",
  "gryphe/mythomax-l2-13b",
  "nousresearch/hermes-3-llama-3.1-70b",
  "nousresearch/hermes-4-70b",
  "sao10k/l3.1-euryale-70b",
  "sao10k/l3-euryale-70b",
] as const;

const TASK_ID_PATTERN = /^[\w-]{4,128}$/;

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(10_000),
      }),
    )
    .max(100),
  model: z.enum(ALLOWED_MODELS).optional().default("sao10k/l3.1-euryale-70b"),
});

const imageSchema = z.object({
  prompt: z.string().min(1).max(1_000),
  negative_prompt: z.string().max(500).optional().default("ugly, deformed, blurry, low quality"),
  width: z.number().int().min(64).max(2_048).optional().default(512),
  height: z.number().int().min(64).max(2_048).optional().default(768),
});

const novitaInitResponseSchema = z.object({ task_id: z.string() });

const novitaTaskResponseSchema = z.object({
  task: z.object({
    task_id: z.string(),
    status: z.enum([
      "TASK_STATUS_QUEUED",
      "TASK_STATUS_PROCESSING",
      "TASK_STATUS_SUCCEED",
      "TASK_STATUS_FAILED",
      "TASK_STATUS_CANCELED",
    ]),
    progress_percent: z.number(),
  }),
  images: z.array(z.object({ image_url: z.string(), image_url_ttl: z.number() })).optional(),
});

const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use(
    "*",
    cors({
      // Cloudflare Pages は同一オリジンなので不要だが、ローカル開発用に localhost を許可
      origin: (origin) => {
        const allowed = ["http://localhost:5173", "http://localhost:4173", "http://localhost:8788"];
        return allowed.includes(origin) || !origin ? origin : null;
      },
    }),
  )

  .post("/chat", zValidator("json", chatSchema), async (c) => {
    const { messages, model } = c.req.valid("json");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": c.env.APP_ORIGIN ?? "https://ai-chat.app",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.75,
        top_p: 0.9,
        frequency_penalty: 0.4,
        presence_penalty: 0.3,
        max_tokens: 1024,
        provider: {
          allow_fallbacks: false,
        },
      }),
    });

    if (!response.ok || !response.body) {
      const error = await response.text();
      return c.json({ error, upstreamStatus: response.status }, 502);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })

  .post("/image", zValidator("json", imageSchema), async (c) => {
    const { prompt, negative_prompt, width, height } = c.req.valid("json");

    const response = await fetch("https://api.novita.ai/v3/async/txt2img", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.NOVITA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_name: "cyberrealistic_classicV31_113034.safetensors",
        prompt,
        negative_prompt,
        width,
        height,
        sampler_name: "Euler a",
        steps: 25,
        cfg_scale: 7,
        seed: -1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error, upstreamStatus: response.status }, 502);
    }

    const parsed = novitaInitResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return c.json({ error: "unexpected upstream response shape" }, 502);
    }
    return c.json(parsed.data);
  })

  .get("/image/task/:taskId", async (c) => {
    const taskId = c.req.param("taskId");

    if (!TASK_ID_PATTERN.test(taskId)) {
      return c.json({ error: "invalid task_id format" }, 400);
    }

    const response = await fetch(
      `https://api.novita.ai/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`,
      {
        headers: {
          Authorization: `Bearer ${c.env.NOVITA_API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      return c.json({ error, upstreamStatus: response.status }, 502);
    }

    const parsed = novitaTaskResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return c.json({ error: "unexpected upstream response shape" }, 502);
    }
    return c.json(parsed.data);
  });

export const onRequest = handle(app);
export type AppType = typeof app;
