import { test } from "@playwright/test";
import { ensureAuthenticated } from "../fixtures/auth";
import { expectNoSeriousViolations, waitForMainBoardReady } from "./helpers";

test.describe("メインボード", () => {
  test("重大な a11y 違反がない", async ({ page }) => {
    await ensureAuthenticated(page);
    await waitForMainBoardReady(page);
    await expectNoSeriousViolations(page, "/");
  });
});
