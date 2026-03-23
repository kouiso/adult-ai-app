import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import { cors } from "hono/cors";
import { z } from "zod/v4";

import { ALLOWED_MODELS } from "../../src/lib/model";
import { characterTable, conversationTable, messageTable, userTable } from "../../src/schema";

type Bindings = {
  DB: Parameters<typeof drizzle>[0];
  OPENROUTER_API_KEY: string;
  NOVITA_API_KEY: string;
  APP_ORIGIN?: string;
};

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

const conversationCreateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

const messageCreateSchema = z.object({
  id: z.string().min(1).max(128),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().max(20_000),
  imageUrl: z.string().url().optional(),
  imageKey: z.string().max(500).optional(),
});

const messageUpdateImageSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageKey: z.string().max(500).optional(),
});

const idSchema = z.string().min(1).max(128);

const getUserEmail = (c: { req: { header: (key: string) => string | undefined } }) => {
  const accessEmail = c.req.header("CF-Access-Authenticated-User-Email");
  if (accessEmail) return accessEmail;

  const host = c.req.header("host") ?? "";
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return "local-dev@adult-ai-app.local";
  }
  return null;
};

const ensureUser = async (
  database: ReturnType<typeof drizzle>,
  userEmail: string,
): Promise<string> => {
  await database
    .insert(userTable)
    .values({
      id: userEmail,
      email: userEmail,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
  return userEmail;
};

const app = new Hono<{ Bindings: Bindings }>()
  .basePath("/api")
  .use(
    "*",
    cors({
      origin: (origin, c) => {
        const appOrigin = c.env.APP_ORIGIN;
        const allowed = [
          "http://localhost:5173",
          "http://localhost:4173",
          "http://localhost:8788",
          ...(appOrigin ? [appOrigin] : []),
        ];
        return allowed.includes(origin) || !origin ? origin : null;
      },
    }),
  )

  .get("/conversations", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);
    const conversations = await database
      .select({
        id: conversationTable.id,
        title: conversationTable.title,
        updatedAt: conversationTable.updatedAt,
        createdAt: conversationTable.createdAt,
      })
      .from(conversationTable)
      .where(eq(conversationTable.userId, userId))
      .orderBy(desc(conversationTable.updatedAt));

    return c.json({ conversations });
  })

  .post("/conversations", zValidator("json", conversationCreateSchema), async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const { title } = c.req.valid("json");
    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);
    const now = Date.now();
    const conversationId = crypto.randomUUID();
    const fallbackCharacterId = "default-character";

    await database
      .insert(characterTable)
      .values({
        id: fallbackCharacterId,
        userId,
        name: "AI",
        avatar: undefined,
        systemPrompt: "",
        greeting: "",
        tags: [],
        createdAt: now,
      })
      .onConflictDoNothing();

    await database
      .insert(conversationTable)
      .values({
        id: conversationId,
        userId,
        characterId: fallbackCharacterId,
        title: title ?? "新しい会話",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    return c.json(
      {
        conversation: {
          id: conversationId,
          title: title ?? "新しい会話",
          createdAt: now,
          updatedAt: now,
        },
      },
      201,
    );
  })

  .get("/conversations/:conversationId/messages", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const conversationId = c.req.param("conversationId");
    if (!idSchema.safeParse(conversationId).success) {
      return c.json({ error: "invalid conversation id" }, 400);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    const ownConversation = await database
      .select({ id: conversationTable.id })
      .from(conversationTable)
      .where(and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)))
      .limit(1);

    if (ownConversation.length === 0) {
      return c.json({ error: "conversation not found" }, 404);
    }

    const messages = await database
      .select({
        id: messageTable.id,
        role: messageTable.role,
        content: messageTable.content,
        imageUrl: messageTable.imageUrl,
        imageKey: messageTable.imageKey,
        createdAt: messageTable.createdAt,
      })
      .from(messageTable)
      .where(and(eq(messageTable.conversationId, conversationId), eq(messageTable.userId, userId)))
      .orderBy(asc(messageTable.createdAt));

    return c.json({ messages });
  })

  .post(
    "/conversations/:conversationId/messages",
    zValidator("json", messageCreateSchema),
    async (c) => {
      const userEmail = getUserEmail(c);
      if (!userEmail) {
        return c.json({ error: "unauthorized" }, 401);
      }

      const conversationId = c.req.param("conversationId");
      if (!idSchema.safeParse(conversationId).success) {
        return c.json({ error: "invalid conversation id" }, 400);
      }

      const database = drizzle(c.env.DB);
      const userId = await ensureUser(database, userEmail);
      const payload = c.req.valid("json");

      const conversation = await database
        .select({ id: conversationTable.id, characterId: conversationTable.characterId })
        .from(conversationTable)
        .where(and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)))
        .limit(1);

      const currentConversation = conversation[0];
      if (!currentConversation) {
        return c.json({ error: "conversation not found" }, 404);
      }

      await database.insert(messageTable).values({
        id: payload.id,
        userId,
        conversationId,
        characterId: currentConversation.characterId,
        role: payload.role,
        content: payload.content,
        imageUrl: payload.imageUrl,
        imageKey: payload.imageKey,
        createdAt: Date.now(),
      });

      await database
        .update(conversationTable)
        .set({ updatedAt: Date.now() })
        .where(and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)));

      return c.json({ ok: true }, 201);
    },
  )

  .patch("/messages/:messageId/image", zValidator("json", messageUpdateImageSchema), async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const messageId = c.req.param("messageId");
    if (!idSchema.safeParse(messageId).success) {
      return c.json({ error: "invalid message id" }, 400);
    }

    const payload = c.req.valid("json");
    if (!payload.imageUrl && !payload.imageKey) {
      return c.json({ error: "imageUrl or imageKey is required" }, 400);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    await database
      .update(messageTable)
      .set({
        imageUrl: payload.imageUrl,
        imageKey: payload.imageKey,
      })
      .where(and(eq(messageTable.id, messageId), eq(messageTable.userId, userId)));

    return c.json({ ok: true });
  })

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
      // アップストリームのエラー詳細をクライアントに漏らさない（APIキーや内部情報が含まれうる）
      console.error("OpenRouter upstream error:", response.status, await response.text());
      return c.json({ error: "upstream service error" }, 502);
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
      console.error("Novita init upstream error:", response.status, await response.text());
      return c.json({ error: "upstream service error" }, 502);
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
      console.error("Novita task upstream error:", response.status, await response.text());
      return c.json({ error: "upstream service error" }, 502);
    }

    const parsed = novitaTaskResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return c.json({ error: "unexpected upstream response shape" }, 502);
    }
    return c.json(parsed.data);
  });

export const onRequest = handle(app);
export type AppType = typeof app;
