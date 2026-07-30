"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DISPLAY_SPRINT_COUNT,
  RELEASE_TARGET_POINTS,
  buildReleaseBurnupYAxis,
  type ReleaseBurnupChartPoint,
} from "@/lib/releaseBurnup";
import type { ProductBacklogItem } from "@/lib/types";

type ReleaseBurnupPanelProps = {
  data: ReleaseBurnupChartPoint[];
  draftPoints: number;
  resolvedItems: ProductBacklogItem[];
  isAlreadyFinalized: boolean;
  isFinalizeDisabled: boolean;
  finalizeDisabledReason?: string;
  onFinalize: () => void;
};

export function ReleaseBurnupPanel({
  data,
  draftPoints,
  resolvedItems,
  isAlreadyFinalized,
  isFinalizeDisabled,
  finalizeDisabledReason,
  onFinalize,
}: ReleaseBurnupPanelProps) {
  const chartData = data.map((d) => ({
    ...d,
    avgVelocity: d.avgVelocity ?? undefined,
  }));

  const peakCumulative = Math.max(
    ...data.map((d) => d.idealCumulative),
    1,
  );
  const leftYAxis = buildReleaseBurnupYAxis(peakCumulative);

  const avgVelocityValue =
    data.find((d) => d.avgVelocity != null)?.avgVelocity ?? null;

  const sprintRangeLabel =
    data.length > 0
      ? `Sprint${data[0].sprintIndex}〜Sprint${data[data.length - 1].sprintIndex}（${data.length}件）`
      : `Sprint1〜${DISPLAY_SPRINT_COUNT}`;

  return (
    <aside className="flex w-full flex-col overflow-visible rounded-lg border border-gray-300/80 bg-white/95 px-3 pb-4 pt-3 shadow-sm backdrop-blur-sm">
      <h3 className="mb-1 text-center text-sm font-bold text-gray-800">
        リリースバーンアップチャート
      </h3>
      <p className="mb-2 text-center text-[10px] text-gray-500">
        実績: 親Backlogのポイント（Done/Can&apos;t完了）／ 目標 {RELEASE_TARGET_POINTS}P
        ／ {sprintRangeLabel}
      </p>

      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
        {resolvedItems.length > 0 && (
          <ul className="mt-1 max-h-16 list-inside list-disc overflow-y-auto text-[10px] text-amber-900/90">
            {resolvedItems.map((item) => (
              <li key={item.id}>
                {item.title.slice(0, 28)}
                {item.title.length > 28 ? "…" : ""}（{item.points ?? 0}P）
              </li>
            ))}
          </ul>
        )}
        {isFinalizeDisabled && finalizeDisabledReason && (
          <p className="mt-1 text-[9px] text-amber-700/90">{finalizeDisabledReason}</p>
        )}
        <button
          type="button"
          onClick={onFinalize}
          disabled={isFinalizeDisabled}
          title={
            isFinalizeDisabled ? finalizeDisabledReason : undefined
          }
          className="mt-2 w-full rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-gray-100 disabled:hover:bg-gray-400"
        >
          {isAlreadyFinalized
            ? "スプリント実績を再確定する"
            : "スプリント実績を確定する"}
        </button>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ top: 12, right: 12, left: 20, bottom: 36 }}
          >
            <CartesianGrid
              yAxisId="left"
              stroke="#e5e7eb"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="sprintLabel"
              tick={{ fontSize: 9 }}
              interval={1}
              angle={-35}
              textAnchor="end"
              height={48}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              domain={leftYAxis.domain}
              ticks={leftYAxis.ticks}
              allowDecimals={false}
              label={{
                value: "週次P",
                angle: -90,
                position: "insideLeft",
                offset: 0,
                style: { fontSize: 9, fill: "#374151" },
              }}
            />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(value, name) => {
                if (value == null || value === "") return ["—", name];
                const unit =
                  name === "理想線" ? "（累積）" : "（週次）";
                return [`${value}P${unit}`, name];
              }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
            />
            <Bar
              yAxisId="left"
              dataKey="increment"
              name="実績（週次増分）"
              fill="#ef4444"
              radius={[2, 2, 0, 0]}
              maxBarSize={28}
            >
              <LabelList
                dataKey="increment"
                position="insideTop"
                fontSize={9}
                fill="#fff"
                formatter={(v) =>
                  typeof v === "number" && v > 0 ? String(v) : ""
                }
              />
            </Bar>
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="idealCumulative"
              name="理想線"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgVelocity"
              name="平均ベロシティ"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3 }}
              connectNulls
              legendType="line"
            />
            {avgVelocityValue != null && (
              <ReferenceLine
                yAxisId="left"
                y={avgVelocityValue}
                stroke="#22c55e"
                strokeDasharray="6 4"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[9px] text-gray-400">
        平均ベロシティ: 直近3スプリント確定実績の週次増分平均
      </p>
    </aside>
  );
}
