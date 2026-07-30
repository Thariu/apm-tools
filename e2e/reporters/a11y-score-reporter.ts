import fs from "fs";
import path from "path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import type { A11yScoreReport } from "../a11y/score";
import { formatScoreTable } from "../a11y/score";

const REPORT_DIR = path.join(process.cwd(), "a11y-report");
const SUMMARY_JSON = path.join(REPORT_DIR, "summary.json");
const SUMMARY_MD = path.join(REPORT_DIR, "summary.md");

export default class A11yScoreReporter implements Reporter {
  private reports: A11yScoreReport[] = [];

  onBegin(_config: FullConfig): void {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== "passed" && result.status !== "failed") {
      return;
    }

    const attachment = result.attachments.find((a) => a.name === "a11y-score");
    if (!attachment?.body) {
      return;
    }

    try {
      const report = JSON.parse(
        attachment.body.toString("utf-8"),
      ) as A11yScoreReport;
      this.reports.push({
        ...report,
        context: report.context || test.title,
      });
    } catch {
      // ignore malformed attachments
    }
  }

  onEnd(result: FullResult): void {
    if (this.reports.length === 0) {
      return;
    }

    const average =
      Math.round(
        (this.reports.reduce((sum, r) => sum + r.score, 0) /
          this.reports.length) *
          10,
      ) / 10;

    const summary = {
      generatedAt: new Date().toISOString(),
      averageScore: average,
      testRunStatus: result.status,
      entries: this.reports,
    };

    fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2), "utf-8");

    const md = [
      "# Accessibility Score Summary",
      "",
      `- 平均スコア: **${average.toFixed(1)} / 100**`,
      `- 計測件数: ${this.reports.length}`,
      `- テスト結果: ${result.status}`,
      "",
      "スコアは axe の適用ルールに対する合格率（passes / (passes + violations) × 100）です。",
      "",
      "## 内訳",
      "",
      "| 画面/シナリオ | スコア | Critical | Serious | Moderate | Minor |",
      "|---|---:|---:|---:|---:|---:|",
      ...this.reports.map(
        (r) =>
          `| ${r.context} | ${r.score.toFixed(1)} | ${r.impacts.critical} | ${r.impacts.serious} | ${r.impacts.moderate} | ${r.impacts.minor} |`,
      ),
      "",
    ].join("\n");

    fs.writeFileSync(SUMMARY_MD, md, "utf-8");

    console.log("\n=== Accessibility Scores ===");
    console.log(formatScoreTable(this.reports));
    console.log(`\n詳細: ${SUMMARY_JSON}`);
    console.log(`       ${SUMMARY_MD}\n`);
  }
}
