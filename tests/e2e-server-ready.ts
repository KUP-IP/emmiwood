import { expect, test as base, type APIRequestContext } from '@playwright/test';

export async function waitForE2eHealth(
  request: APIRequestContext,
  baseURL: string | undefined,
  timeoutMs = 30_000,
) {
  if (!baseURL) throw new Error('Playwright baseURL is required for isolated e2e');
  const deadline = Date.now() + timeoutMs;
  let lastMessage = `${baseURL}/api/health is not reachable`;
  while (Date.now() < deadline) {
    try {
      const response = await request.get(`${baseURL}/api/health`, { timeout: 2_000 });
      if (response.ok()) return;
      lastMessage = `${baseURL}/api/health returned ${response.status()}`;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`e2e pages dev did not become healthy: ${lastMessage}`);
}

export const test = base.extend({
  page: [
    async ({ page, request, baseURL }, use) => {
      await waitForE2eHealth(request, baseURL);
      await use(page);
    },
    { timeout: 45_000, scope: 'test' },
  ],
});

export { expect };
