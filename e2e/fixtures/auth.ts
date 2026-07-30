import { type Page } from "@playwright/test";

/** auth.setup.ts で保存した storageState を前提にホームへ遷移 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  await page.goto("/");
}
