import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";
import { computeA11yScore } from "./score";

export async function expectNoSeriousViolations(
  page: Page,
  context?: string,
  options?: { exclude?: string[] },
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21aa",
  ]);
  for (const selector of options?.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  const results = await builder.analyze();
  const label = context ?? "page";
  const scoreReport = computeA11yScore(results, label);

  await test.info().attach("a11y-score", {
    body: JSON.stringify(scoreReport, null, 2),
    contentType: "application/json",
  });

  console.log(
    `[a11y] ${label}: score ${scoreReport.score.toFixed(1)}/100` +
      ` (critical=${scoreReport.impacts.critical}, serious=${scoreReport.impacts.serious})`,
  );

  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );

  if (serious.length > 0) {
    const summary = serious
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`,
      )
      .join("\n\n");
    throw new Error(
      `a11y violations (${label}, score ${scoreReport.score.toFixed(1)}):\n\n${summary}`,
    );
  }

  expect(serious).toEqual([]);
}

export async function waitForMainBoardReady(page: Page): Promise<void> {
  await page.getByRole("main").waitFor();
  await expect(
    page.getByRole("heading", { name: "アジャイルプランニングボード" }),
  ).toBeVisible();

  const loading = page.getByText("データを読み込んでいます…");
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: "hidden", timeout: 30_000 });
  }
}

/** Firebase 接続済みでプランニング画面の操作が可能か */
export async function isPlanningDataReady(page: Page): Promise<boolean> {
  if (await page.getByText("Firebase が未設定です").isVisible().catch(() => false)) {
    return false;
  }
  if (
    await page
      .getByText("データの読み込みに失敗しました")
      .isVisible()
      .catch(() => false)
  ) {
    return false;
  }

  const loading = page.getByText("データを読み込んでいます…");
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  }

  return page
    .getByRole("button", { name: "テンプレから追加" })
    .first()
    .isVisible()
    .catch(() => false);
}
