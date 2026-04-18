import type { Page, Route } from "playwright";

const LOCAL_AUTH_HEADER = "CF-Access-Authenticated-User-Email";

export const buildLocalAuthHeaders = (userEmail: string): Record<string, string> => ({
  [LOCAL_AUTH_HEADER]: userEmail,
});

const isApiRequestForOrigin = (requestUrl: string, origin: string): boolean => {
  try {
    const url = new URL(requestUrl);
    return url.origin === origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
};

export const installLocalApiAuth = async (
  page: Page,
  devOrigin: string,
  userEmail: string,
): Promise<void> => {
  const origin = new URL(devOrigin).origin;
  const authHeaders = buildLocalAuthHeaders(userEmail);

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    if (!isApiRequestForOrigin(request.url(), origin)) {
      await route.continue();
      return;
    }

    await route.continue({
      headers: {
        ...request.headers(),
        ...authHeaders,
      },
    });
  });
};
