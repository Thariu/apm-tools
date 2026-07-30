import { type Page } from "@playwright/test";

export async function switchToPlanningBoard(
  page: Page,
  boardName: string,
): Promise<void> {
  await page
    .getByRole("navigation", { name: "ボード切り替え" })
    .getByRole("button", { name: boardName, exact: true })
    .click();
}

export async function switchToRetroView(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "ボード切り替え" })
    .getByRole("button", { name: "振り返り" })
    .click();
}

export async function waitForRetroViewReady(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "今スプリントの振り返り" })
    .waitFor({ timeout: 15_000 });
}
