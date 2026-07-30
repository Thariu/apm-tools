import type { AxeResults, ImpactValue } from "axe-core";

export type A11yImpactCounts = Record<ImpactValue, number>;

export type A11yScoreReport = {
  context: string;
  /** 適用ルールに対する合格率（0〜100）。axe の passes / (passes + violations) */
  score: number;
  passedRules: number;
  violatedRules: number;
  incompleteRules: number;
  impacts: A11yImpactCounts;
  generatedAt: string;
};

const IMPACTS: ImpactValue[] = ["critical", "serious", "moderate", "minor"];

function emptyImpacts(): A11yImpactCounts {
  return { critical: 0, serious: 0, moderate: 0, minor: 0 };
}

export function computeA11yScore(
  results: AxeResults,
  context: string,
): A11yScoreReport {
  const passedRules = results.passes.length;
  const violatedRules = results.violations.length;
  const applicable = passedRules + violatedRules;
  const score =
    applicable === 0
      ? 100
      : Math.round((passedRules / applicable) * 1000) / 10;

  const impacts = emptyImpacts();
  for (const violation of results.violations) {
    const impact = violation.impact ?? "minor";
    if (IMPACTS.includes(impact)) {
      impacts[impact] += 1;
    }
  }

  return {
    context,
    score,
    passedRules,
    violatedRules,
    incompleteRules: results.incomplete.length,
    impacts,
    generatedAt: new Date().toISOString(),
  };
}

export function formatScoreTable(reports: A11yScoreReport[]): string {
  if (reports.length === 0) {
    return "（スコア記録なし）";
  }

  const header = [
    "画面/シナリオ".padEnd(28),
    "スコア".padStart(6),
    "Crit".padStart(5),
    "Ser".padStart(5),
    "Mod".padStart(5),
    "Min".padStart(5),
  ].join(" ");

  const rows = reports.map((r) =>
    [
      r.context.padEnd(28),
      `${r.score.toFixed(1)}`.padStart(6),
      `${r.impacts.critical}`.padStart(5),
      `${r.impacts.serious}`.padStart(5),
      `${r.impacts.moderate}`.padStart(5),
      `${r.impacts.minor}`.padStart(5),
    ].join(" "),
  );

  const avg =
    reports.reduce((sum, r) => sum + r.score, 0) / reports.length;

  const separator = "-".repeat(header.length);
  return [
    header,
    separator,
    ...rows,
    separator,
    `平均スコア: ${avg.toFixed(1)} / 100（${reports.length} 件）`,
  ].join("\n");
}
