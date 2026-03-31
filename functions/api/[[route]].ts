import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
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
  characterId: z.string().min(1).max(128).optional(),
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

const characterCreateSchema = z.object({
  name: z.string().min(1).max(100),
  avatar: z.string().max(500).optional(),
  systemPrompt: z.string().max(10_000),
  greeting: z.string().max(2_000),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

const characterUpdateSchema = characterCreateSchema;

const conversationUpdateTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

const conversationUpdateCharacterSchema = z.object({
  characterId: z.string().min(1).max(128),
});

const generateTitleSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(2_000),
      }),
    )
    .max(10),
  model: z.enum(ALLOWED_MODELS).optional().default("sao10k/l3.1-euryale-70b"),
});

const messageUpdateContentSchema = z.object({
  content: z.string().max(20_000),
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

const DEFAULT_CHARACTER_ID = "default-character" as const;

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

  // ── 会話一覧（キャラクター情報をJOINして返す） ──────────────────────────
  .get("/conversations", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);
    const rows = await database
      .select({
        id: conversationTable.id,
        title: conversationTable.title,
        updatedAt: conversationTable.updatedAt,
        createdAt: conversationTable.createdAt,
        characterId: conversationTable.characterId,
        characterName: characterTable.name,
        characterGreeting: characterTable.greeting,
        characterSystemPrompt: characterTable.systemPrompt,
        characterAvatar: characterTable.avatar,
      })
      .from(conversationTable)
      .leftJoin(characterTable, eq(conversationTable.characterId, characterTable.id))
      .where(eq(conversationTable.userId, userId))
      .orderBy(desc(conversationTable.updatedAt));

    const conversations = rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      characterId: r.characterId,
      characterName: r.characterName ?? "AI",
      characterGreeting: r.characterGreeting ?? "",
      characterSystemPrompt: r.characterSystemPrompt ?? "",
      characterAvatar: r.characterAvatar ?? null,
    }));

    return c.json({ conversations });
  })

  .post("/conversations", zValidator("json", conversationCreateSchema), async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const { title, characterId } = c.req.valid("json");
    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);
    const now = Date.now();
    const conversationId = crypto.randomUUID();

    // デフォルトキャラクターが存在しない場合だけ作る
    await database
      .insert(characterTable)
      .values({
        id: DEFAULT_CHARACTER_ID,
        userId,
        name: "AI",
        avatar: undefined,
        systemPrompt: "",
        greeting: "",
        tags: [],
        createdAt: now,
      })
      .onConflictDoNothing();

    // 指定されたキャラクターが存在するか確認
    let resolvedCharacterId = characterId ?? DEFAULT_CHARACTER_ID;
    if (characterId && characterId !== DEFAULT_CHARACTER_ID) {
      const found = await database
        .select({ id: characterTable.id })
        .from(characterTable)
        .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, userId)))
        .limit(1);
      if (found.length === 0) resolvedCharacterId = DEFAULT_CHARACTER_ID;
    }

    await database
      .insert(conversationTable)
      .values({
        id: conversationId,
        userId,
        characterId: resolvedCharacterId,
        title: title ?? "新しい会話",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    const character = await database
      .select({
        name: characterTable.name,
        greeting: characterTable.greeting,
        systemPrompt: characterTable.systemPrompt,
        avatar: characterTable.avatar,
      })
      .from(characterTable)
      .where(eq(characterTable.id, resolvedCharacterId))
      .limit(1);

    const ch = character[0];

    return c.json(
      {
        conversation: {
          id: conversationId,
          title: title ?? "新しい会話",
          createdAt: now,
          updatedAt: now,
          characterId: resolvedCharacterId,
          characterName: ch?.name ?? "AI",
          characterGreeting: ch?.greeting ?? "",
          characterSystemPrompt: ch?.systemPrompt ?? "",
          characterAvatar: ch?.avatar ?? null,
        },
      },
      201,
    );
  })

  // ── 会話削除（メッセージも一緒に削除） ─────────────────────────────────
  .delete("/conversations/:conversationId", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) return c.json({ error: "unauthorized" }, 401);

    const conversationId = c.req.param("conversationId");
    if (!idSchema.safeParse(conversationId).success) {
      return c.json({ error: "invalid conversation id" }, 400);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    await database
      .delete(messageTable)
      .where(
        and(eq(messageTable.conversationId, conversationId), eq(messageTable.userId, userId)),
      );

    await database
      .delete(conversationTable)
      .where(
        and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)),
      );

    return c.json({ ok: true });
  })

  // ── 会話タイトル更新 ────────────────────────────────────────────────────
  .patch(
    "/conversations/:conversationId/title",
    zValidator("json", conversationUpdateTitleSchema),
    async (c) => {
      const userEmail = getUserEmail(c);
      if (!userEmail) return c.json({ error: "unauthorized" }, 401);

      const conversationId = c.req.param("conversationId");
      if (!idSchema.safeParse(conversationId).success) {
        return c.json({ error: "invalid conversation id" }, 400);
      }

      const { title } = c.req.valid("json");
      const database = drizzle(c.env.DB);
      const userId = await ensureUser(database, userEmail);

      await database
        .update(conversationTable)
        .set({ title, updatedAt: Date.now() })
        .where(
          and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)),
        );

      return c.json({ ok: true });
    },
  )

  // ── 会話キャラクター変更 ────────────────────────────────────────────────
  .patch(
    "/conversations/:conversationId/character",
    zValidator("json", conversationUpdateCharacterSchema),
    async (c) => {
      const userEmail = getUserEmail(c);
      if (!userEmail) return c.json({ error: "unauthorized" }, 401);

      const conversationId = c.req.param("conversationId");
      if (!idSchema.safeParse(conversationId).success) {
        return c.json({ error: "invalid conversation id" }, 400);
      }

      const { characterId } = c.req.valid("json");
      const database = drizzle(c.env.DB);
      const userId = await ensureUser(database, userEmail);

      const charExists = await database
        .select({ id: characterTable.id })
        .from(characterTable)
        .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, userId)))
        .limit(1);

      if (charExists.length === 0 && characterId !== DEFAULT_CHARACTER_ID) {
        return c.json({ error: "character not found" }, 404);
      }

      await database
        .update(conversationTable)
        .set({ characterId, updatedAt: Date.now() })
        .where(
          and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)),
        );

      return c.json({ ok: true });
    },
  )

  // ── 会話タイトル自動生成 ────────────────────────────────────────────────
  .post(
    "/conversations/:conversationId/generate-title",
    zValidator("json", generateTitleSchema),
    async (c) => {
      const userEmail = getUserEmail(c);
      if (!userEmail) return c.json({ error: "unauthorized" }, 401);

      const conversationId = c.req.param("conversationId");
      if (!idSchema.safeParse(conversationId).success) {
        return c.json({ error: "invalid conversation id" }, 400);
      }

      const { messages, model } = c.req.valid("json");

      // ユーザーとAI最初の応答からタイトルを生成
      const titleMessages = [
        {
          role: "system" as const,
          content:
            "会話内容から日本語の短いタイトルを生成してください。タイトルは20文字以内で、会話の主題を表すものにしてください。タイトルのテキストのみを出力してください（説明や引用符は不要）。",
        },
        ...messages.slice(0, 4),
        {
          role: "user" as const,
          content: "上記の会話のタイトルを20文字以内の日本語で生成してください。",
        },
      ];

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": c.env.APP_ORIGIN ?? "https://ai-chat.app",
        },
        body: JSON.stringify({
          model,
          messages: titleMessages,
          stream: false,
          max_tokens: 50,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        console.error("title generation error:", response.status);
        return c.json({ title: null });
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const title = data.choices?.[0]?.message?.content?.trim().slice(0, 30) ?? null;

      if (title) {
        const database = drizzle(c.env.DB);
        const userId = await ensureUser(database, userEmail);
        await database
          .update(conversationTable)
          .set({ title, updatedAt: Date.now() })
          .where(
            and(eq(conversationTable.id, conversationId), eq(conversationTable.userId, userId)),
          );
      }

      return c.json({ title });
    },
  )

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

  // ── メッセージ以降を全削除（再生成・編集に使う） ───────────────────────
  .delete("/conversations/:conversationId/messages-after/:messageId", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) return c.json({ error: "unauthorized" }, 401);

    const conversationId = c.req.param("conversationId");
    const messageId = c.req.param("messageId");
    if (
      !idSchema.safeParse(conversationId).success ||
      !idSchema.safeParse(messageId).success
    ) {
      return c.json({ error: "invalid id" }, 400);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    const pivot = await database
      .select({ createdAt: messageTable.createdAt })
      .from(messageTable)
      .where(and(eq(messageTable.id, messageId), eq(messageTable.userId, userId)))
      .limit(1);

    if (pivot.length === 0) return c.json({ error: "message not found" }, 404);

    await database
      .delete(messageTable)
      .where(
        and(
          eq(messageTable.conversationId, conversationId),
          eq(messageTable.userId, userId),
          gt(messageTable.createdAt, pivot[0].createdAt),
        ),
      );

    return c.json({ ok: true });
  })

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

  // ── メッセージ本文更新（再生成用） ─────────────────────────────────────
  .patch(
    "/messages/:messageId/content",
    zValidator("json", messageUpdateContentSchema),
    async (c) => {
      const userEmail = getUserEmail(c);
      if (!userEmail) return c.json({ error: "unauthorized" }, 401);

      const messageId = c.req.param("messageId");
      if (!idSchema.safeParse(messageId).success) {
        return c.json({ error: "invalid message id" }, 400);
      }

      const { content } = c.req.valid("json");
      const database = drizzle(c.env.DB);
      const userId = await ensureUser(database, userEmail);

      await database
        .update(messageTable)
        .set({ content })
        .where(and(eq(messageTable.id, messageId), eq(messageTable.userId, userId)));

      return c.json({ ok: true });
    },
  )

  // ── キャラクター一覧 ────────────────────────────────────────────────────
  .get("/characters", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) return c.json({ error: "unauthorized" }, 401);

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    const characters = await database
      .select()
      .from(characterTable)
      .where(
        and(
          eq(characterTable.userId, userId),
          ne(characterTable.id, DEFAULT_CHARACTER_ID),
        ),
      )
      .orderBy(desc(characterTable.createdAt));

    return c.json({ characters });
  })

  // ── キャラクター作成 ────────────────────────────────────────────────────
  .post("/characters", zValidator("json", characterCreateSchema), async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) return c.json({ error: "unauthorized" }, 401);

    const payload = c.req.valid("json");
    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);
    const now = Date.now();
    const characterId = crypto.randomUUID();

    await database.insert(characterTable).values({
      id: characterId,
      userId,
      name: payload.name,
      avatar: payload.avatar,
      systemPrompt: payload.systemPrompt,
      greeting: payload.greeting,
      tags: payload.tags,
      createdAt: now,
    });

    return c.json(
      {
        character: {
          id: characterId,
          userId,
          name: payload.name,
          avatar: payload.avatar ?? null,
          systemPrompt: payload.systemPrompt,
          greeting: payload.greeting,
          tags: payload.tags,
          createdAt: now,
        },
      },
      201,
    );
  })

  // ── キャラクター更新 ────────────────────────────────────────────────────
  .put("/characters/:characterId", zValidator("json", characterUpdateSchema), async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) return c.json({ error: "unauthorized" }, 401);

    const characterId = c.req.param("characterId");
    if (!idSchema.safeParse(characterId).success) {
      return c.json({ error: "invalid character id" }, 400);
    }

    const payload = c.req.valid("json");
    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    const existing = await database
      .select({ id: characterTable.id })
      .from(characterTable)
      .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, userId)))
      .limit(1);

    if (existing.length === 0) return c.json({ error: "character not found" }, 404);

    await database
      .update(characterTable)
      .set({
        name: payload.name,
        avatar: payload.avatar,
        systemPrompt: payload.systemPrompt,
        greeting: payload.greeting,
        tags: payload.tags,
      })
      .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, userId)));

    return c.json({ ok: true });
  })

  // ── キャラクター削除 ────────────────────────────────────────────────────
  .delete("/characters/:characterId", async (c) => {
    const userEmail = getUserEmail(c);
    if (!userEmail) return c.json({ error: "unauthorized" }, 401);

    const characterId = c.req.param("characterId");
    if (!idSchema.safeParse(characterId).success) {
      return c.json({ error: "invalid character id" }, 400);
    }

    const database = drizzle(c.env.DB);
    const userId = await ensureUser(database, userEmail);

    await database
      .delete(characterTable)
      .where(and(eq(characterTable.id, characterId), eq(characterTable.userId, userId)));

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
