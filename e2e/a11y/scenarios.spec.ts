import { test } from "@playwright/test";
import { ensureAuthenticated } from "../fixtures/auth";
import {
  switchToPlanningBoard,
  switchToRetroView,
  waitForRetroViewReady,
} from "../fixtures/navigation";
import {
  expectNoSeriousViolations,
  isPlanningDataReady,
  waitForMainBoardReady,
} from "./helpers";

test.describe("Phase 3: ボードタブ切り替え", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await waitForMainBoardReady(page);
    test.skip(
      !(await isPlanningDataReady(page)),
      "Firebase 未設定またはデータ読み込み不可のためスキップ",
    );
  });

  for (const boardName of ["野球", "提案業務改善"] as const) {
    test(`${boardName}タブに重大な a11y 違反がない`, async ({ page }) => {
      await switchToPlanningBoard(page, boardName);
      await page
        .getByRole("navigation", { name: "ボード切り替え" })
        .getByRole("button", { name: boardName, exact: true })
        .waitFor();
      await expectNoSeriousViolations(page, `planning/${boardName}`);
    });
  }
});

test.describe("Phase 3: 振り返りビュー", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await waitForMainBoardReady(page);
    test.skip(
      !(await isPlanningDataReady(page)),
      "Firebase 未設定またはデータ読み込み不可のためスキップ",
    );
    await switchToRetroView(page);
    await waitForRetroViewReady(page);
  });

  test("今スプリントの振り返りに重大な a11y 違反がない", async ({ page }) => {
    await page.getByText("振り返りを開始してください。").waitFor({
      timeout: 15_000,
    }).catch(() => {});
    await expectNoSeriousViolations(page, "retro/current", {
      exclude: ['nav[aria-label="ボード切り替え"]'],
    });
  });

  test("過去の振り返りタブに重大な a11y 違反がない", async ({ page }) => {
    await page.getByRole("button", { name: /過去の振り返り/ }).click();
    await expectNoSeriousViolations(page, "retro/past");
  });

  test("フレームワーク選択モーダルに重大な a11y 違反がない", async ({
    page,
  }) => {
    const retroHeader = page
      .locator("section")
      .filter({ hasText: "振り返り" })
      .first();
    await retroHeader.getByRole("button", { name: "＋" }).click();
    await page.getByRole("dialog", { name: "フレームワーク選択" }).waitFor();
    await expectNoSeriousViolations(page, "retro/framework-modal");
  });
});

test.describe("Phase 3: モーダル・ダイアログ", () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await waitForMainBoardReady(page);
    test.skip(
      !(await isPlanningDataReady(page)),
      "Firebase 未設定またはデータ読み込み不可のためスキップ",
    );
  });

  test("タスクテンプレートモーダル（追加タブ）に重大な a11y 違反がない", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "テンプレから追加" }).first().click();
    await page
      .getByRole("dialog", { name: "テンプレから追加" })
      .waitFor();
    await expectNoSeriousViolations(page, "modal/task-template/add");
  });

  test("タスクテンプレートモーダル（管理タブ）に重大な a11y 違反がない", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "テンプレから追加" }).first().click();
    const dialog = page.getByRole("dialog", { name: "テンプレから追加" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "テンプレ管理" }).click();
    await expectNoSeriousViolations(page, "modal/task-template/manage");
  });

  test("担当者選択ダイアログに重大な a11y 違反がない", async ({ page }) => {
    await page.getByRole("button", { name: "+ 担当" }).first().click();
    await page.getByRole("dialog", { name: "担当者を選択" }).waitFor();
    await expectNoSeriousViolations(page, "modal/assignee-picker");
  });

  test("ゴール候補ピッカーに重大な a11y 違反がない", async ({ page }) => {
    const goalSection = page.locator("div.border-pink-300").first();
    await goalSection.locator('span[role="button"]').click();
    await goalSection.getByText("ゴール（候補）").waitFor();
    await goalSection.locator('button[aria-haspopup="listbox"]').click();
    await goalSection.getByRole("listbox").waitFor();
    await expectNoSeriousViolations(page, "modal/goal-picker");
  });
});
