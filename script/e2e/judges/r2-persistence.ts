import { waitForDomReady } from "../browser-wait";

import type { E2eEnv } from "../env";
import type { ImageProbeResult, JudgeVerdict } from "../types";
import type { Page } from "playwright";

type ProbeR2StagesOptions = {
  conversationId: string;
  env: E2eEnv;
  imgSelector: string;
  domReadySelector: string;
  screenshotBeforeReloadPath: string;
  screenshotAfterReloadPath: string;
};

const isImageContentType = (contentType: string): boolean => contentType.startsWith("image/");

const toAbsoluteImageUrl = (src: string, env: E2eEnv): string =>
  src.startsWith("/") ? new URL(src, env.devOrigin).toString() : src;

const readLastImageState = async (
  page: Page,
  imgSelector: string,
): Promise<{ src: string; naturalWidth: number }> =>
  page
    .locator(imgSelector)
    .last()
    .evaluate((img) => {
      const srcValue = Reflect.get(img, "currentSrc") || Reflect.get(img, "src");
      const naturalWidthValue = Reflect.get(img, "naturalWidth");
      return {
        src: typeof srcValue === "string" ? srcValue : "",
        naturalWidth: typeof naturalWidthValue === "number" ? naturalWidthValue : 0,
      };
    });

const waitForImageUrl = async (
  page: Page,
  imgSelector: string,
  predicate: (src: string) => boolean,
): Promise<string | null> =>
  page
    .waitForFunction(
      ({ selector, serializedPredicate }) => {
        const querySelectorAll = document.querySelectorAll.bind(document);
        const images = querySelectorAll(selector);
        if (images.length < 1) return null;

        const last = images.item(images.length - 1);
        if (!(last instanceof HTMLImageElement)) return null;

        const src = last.currentSrc || last.src || "";
        if (!src) return null;

        const predicateFn = new Function(
          "src",
          `"use strict"; return (${serializedPredicate})(src);`,
        ) as (src: string) => boolean;
        return predicateFn(src) ? src : null;
      },
      {
        selector: imgSelector,
        serializedPredicate: predicate.toString(),
      },
      { timeout: 60_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<string | null>)
    .catch(() => null);

const waitForCondition = async (
  condition: () => boolean,
  timeoutMs: number,
  pollMs = 200,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return condition();
};

const readReloadDisplayed = async (page: Page, imgSelector: string): Promise<boolean> =>
  page.locator(imgSelector).evaluateAll((images) =>
    images.every((img) => {
      const naturalWidthValue = Reflect.get(img, "naturalWidth");
      return typeof naturalWidthValue === "number" && naturalWidthValue > 0;
    }),
  );

export async function probeR2Stages(
  page: Page,
  options: ProbeR2StagesOptions,
): Promise<ImageProbeResult> {
  const contentTypeByUrl = new Map<string, string>();
  let imagePatchCount = 0;

  const responseListener = (response: {
    url: () => string;
    headers: () => Record<string, string>;
  }): void => {
    const url = response.url();
    const contentType = response.headers()["content-type"] ?? "unknown";
    if (!isImageContentType(contentType) && !url.includes("/api/image/r2/")) return;
    contentTypeByUrl.set(url, contentType);
  };
  const patchListener = (response: {
    url: () => string;
    request: () => { method: () => string };
    status: () => number;
  }): void => {
    if (response.request().method() !== "PATCH") return;
    try {
      const pathname = new URL(response.url()).pathname;
      if (!/\/api\/messages\/[^/]+\/image$/.test(pathname)) return;
      if (response.status() < 200 || response.status() >= 300) return;
      imagePatchCount += 1;
    } catch {
      // URL解析失敗は無視する
    }
  };

  page.on("response", responseListener);
  page.on("response", patchListener);

  try {
    await page.locator(options.imgSelector).last().waitFor({ state: "visible", timeout: 60_000 });

    const novitaUrl = await waitForImageUrl(
      page,
      options.imgSelector,
      (src) => src.startsWith("https://") && !src.includes("/api/image/r2/"),
    );

    const r2Url = await waitForImageUrl(page, options.imgSelector, (src) =>
      src.includes("/api/image/r2/"),
    );
    const patchBaseline = imagePatchCount;

    const beforeReloadLocator = page.locator(options.imgSelector).last();
    await beforeReloadLocator.screenshot({ path: options.screenshotBeforeReloadPath });
    await waitForCondition(() => imagePatchCount > patchBaseline, 15_000);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDomReady(page, options.domReadySelector);
    // 会話選択は Zustand の currentConversationId が永続化されていないためリロード後に失われる。
    // サイドバーのボタンを直接クリックして対象 conversation に遷移させる。
    const conversationButton = page.locator(
      `button[data-conversation-id="${options.conversationId}"]`,
    );
    const buttonExists = await conversationButton
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (buttonExists) {
      await conversationButton.first().click({ timeout: 5_000 }).catch(() => undefined);
    } else {
      // data-conversation-id がまだない場合はサイドバーの先頭 conversation を選択する。
      // setupFreshConversation 直後は対象 conversation が最新更新で先頭に来るはずなので
      // 暫定フォールバックとして機能する。
      await page
        .locator(".overflow-y-auto button[type='button']")
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
    }
    try {
      await page.locator(options.imgSelector).last().waitFor({ state: "visible", timeout: 60_000 });
    } catch (error) {
      const debugScreenshotPath = options.screenshotAfterReloadPath.replace(
        /\.png$/,
        "-debug-fullpage.png",
      );
      await page.screenshot({ path: debugScreenshotPath, fullPage: true }).catch(() => undefined);
      const imgCount = await page.locator("img").count().catch(() => -1);
      const groupCount = await page.locator(".group\\/message").count().catch(() => -1);
      const html = await page
        .locator("main")
        .first()
        .innerHTML()
        .catch(() => "")
        .then((value) => value.slice(0, 5000));
      console.error(
        `[probeR2Stages] post-reload image missing. imgCount=${imgCount} groupCount=${groupCount} debugScreenshot=${debugScreenshotPath}`,
      );
      console.error(`[probeR2Stages] main innerHTML (first 5000 chars):\n${html}`);
      throw new Error(
        `[probeR2Stages] post-reload image wait failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const reloadDisplayed = await readReloadDisplayed(page, options.imgSelector);
    const reloadState = await readLastImageState(page, options.imgSelector);
    await page.locator(options.imgSelector).last().screenshot({
      path: options.screenshotAfterReloadPath,
    });

    const contentType =
      (r2Url ? contentTypeByUrl.get(toAbsoluteImageUrl(r2Url, options.env)) : null) ?? "unknown";

    return {
      novitaUrlReceived: novitaUrl !== null,
      r2KeyPersisted: r2Url !== null,
      reloadDisplayed,
      contentType,
      naturalWidth: reloadState.naturalWidth,
      novitaUrl,
      r2Url,
      screenshotBeforeReload: options.screenshotBeforeReloadPath,
      screenshotAfterReload: options.screenshotAfterReloadPath,
    };
  } finally {
    page.off("response", responseListener);
    page.off("response", patchListener);
  }
}

export async function runR2PersistenceJudge(
  page: Page,
  probeResult: ImageProbeResult,
): Promise<{ r2: JudgeVerdict; reload: JudgeVerdict }> {
  if (!probeResult.novitaUrlReceived) {
    return {
      r2: {
        pass: false,
        reason: "initial Novita image URL was not observed",
      },
      reload: {
        pass: false,
        reason: "reload stage skipped because Novita URL was not observed",
      },
    };
  }

  if (!probeResult.r2Url) {
    return {
      r2: {
        pass: false,
        reason: "R2 URL swap was not observed",
      },
      reload: {
        pass: false,
        reason: "reload stage skipped because R2 URL swap was not observed",
      },
    };
  }

  const headResponse = await page.context().request.head(probeResult.r2Url, {
    failOnStatusCode: false,
    timeout: 15_000,
  });
  const contentType = headResponse.headers()["content-type"] ?? probeResult.contentType;
  const r2Pass = headResponse.ok() && isImageContentType(contentType);

  return {
    r2: {
      pass: r2Pass,
      reason: r2Pass
        ? `R2 HEAD ${headResponse.status()} with ${contentType}`
        : `R2 HEAD ${headResponse.status()} with ${contentType}`,
    },
    reload: {
      pass: probeResult.reloadDisplayed,
      reason: probeResult.reloadDisplayed
        ? `image rendered after reload with naturalWidth ${probeResult.naturalWidth}`
        : `image failed to render after reload; naturalWidth ${probeResult.naturalWidth}`,
    },
  };
}
