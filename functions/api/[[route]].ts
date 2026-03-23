import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import { cors } from "hono/cors";
import { z } from "zod/v4";

type Bindings = {
  OPENROUTER_API_KEY: string;
  NOVITA_API_KEY: string;
};

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  model: z
    .string()
    .optional()
    .default("cognitivecomputations/dolphin-mistral-24b-venice-edition:free"),
});

const imageSchema = z.object({
  prompt: z.string(),
  negative_prompt: z
    .string()
    .optional()
    .default("ugly, deformed, blurry, low quality"),
  width: z.number().optional().default(512),
  height: z.number().optional().default(768),
});

const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use("*", cors())

  .post("/chat", zValidator("json", chatSchema), async (c) => {
    const { messages, model } = c.req.valid("json");

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai-chat.app",
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          provider: {
            allow_fallbacks: false,
          },
        }),
      },
    );

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

    const data = await response.json();
    return c.json(data);
  });

export const onRequest = handle(app);
export type AppType = typeof app;
