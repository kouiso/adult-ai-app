import { waitForDomReady } from "../browser-wait";

import type { E2eEnv } from "../env";
import type { ImageProbeResult, JudgeVerdict } from "../types";
import type { Page } from "playwright";

type ProbeR2StagesOptions = {
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
      { timeout: 15_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<string | null>)
    .catch(() => null);

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

  const responseListener = (response: {
    url: () => string;
    headers: () => Record<string, string>;
  }): void => {
    const url = response.url();
    const contentType = response.headers()["content-type"] ?? "unknown";
    if (!isImageContentType(contentType) && !url.includes("/api/image/r2/")) return;
    contentTypeByUrl.set(url, contentType);
  };

  page.on("response", responseListener);

  try {
    await page.locator(options.imgSelector).last().waitFor({ state: "visible", timeout: 15_000 });

    const novitaUrl = await waitForImageUrl(
      page,
      options.imgSelector,
      (src) => src.startsWith("https://") && !src.includes("/api/image/r2/"),
    );

    const r2Url = await waitForImageUrl(page, options.imgSelector, (src) =>
      src.includes("/api/image/r2/"),
    );

    const beforeReloadLocator = page.locator(options.imgSelector).last();
    await beforeReloadLocator.screenshot({ path: options.screenshotBeforeReloadPath });

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDomReady(page, options.domReadySelector);
    await page.locator(options.imgSelector).last().waitFor({ state: "visible", timeout: 15_000 });

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
