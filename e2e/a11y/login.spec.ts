import { test } from "@playwright/test";
import { expectNoSeriousViolations } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("ログイン画面", () => {
  test("重大な a11y 違反がない", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("heading", { name: "ログイン" }).waitFor();
    await expectNoSeriousViolations(page, "/login");
  });
});
