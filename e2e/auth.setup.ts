import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const AUTH_STATE_PATH = path.join(__dirname, ".auth", "user.json");

function isAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_USERNAME?.trim() &&
      process.env.AUTH_PASSWORD?.trim() &&
      process.env.AUTH_SESSION_SECRET?.trim(),
  );
}

setup("認証状態を保存", async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  if (!isAuthConfigured()) {
    await page.goto("/");
    await page.context().storageState({ path: AUTH_STATE_PATH });
    return;
  }

  await page.goto("/login");
  await page.getByLabel("ID").fill(process.env.AUTH_USERNAME!);
  await page.getByLabel("パスワード").fill(process.env.AUTH_PASSWORD!);
  const loginResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/login") &&
      res.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ログイン" }).click();
  const response = await loginResponse;
  expect(response.ok(), `ログイン API が失敗: ${response.status()}`).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "アジャイルプランニングボード" }),
  ).toBeVisible({ timeout: 60_000 });

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
