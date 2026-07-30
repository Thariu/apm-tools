"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBurndownDayLabel } from "@/lib/burndown";
import type { BurndownPoint } from "@/lib/types";

type BurndownPanelProps = {
  data: BurndownPoint[];
  totalTasks: number;
  currentWip: number;
  businessDayIsos: string[];
  onBusinessDayIsosChange: (isos: string[]) => void;
  onResetBusinessDays: () => void;
};

export function BurndownPanel({
  data,
  totalTasks,
  currentWip,
  businessDayIsos,
  onBusinessDayIsosChange,
  onResetBusinessDays,
}: BurndownPanelProps) {
  const [newDayIso, setNewDayIso] = useState("");

  const numericActuals = data
    .map((d) => d.actual)
    .filter((v): v is number => v !== null);
  const maxY = Math.max(
    totalTasks,
    ...data.map((d) => d.ideal),
    ...numericActuals,
    1,
  );

  const chartData = data.map((d) => ({
    ...d,
    actual: d.actual ?? undefined,
  }));

  const handleAddDay = () => {
    if (!newDayIso || businessDayIsos.includes(newDayIso)) return;
    onBusinessDayIsosChange([...businessDayIsos, newDayIso].sort());
    setNewDayIso("");
  };

  const handleRemoveDay = (iso: string) => {
    if (businessDayIsos.length <= 1) return;
    onBusinessDayIsosChange(businessDayIsos.filter((d) => d !== iso));
  };

  return (
    <aside className="flex w-full flex-col overflow-visible rounded-lg border border-gray-300/80 bg-white/95 px-3 pb-4 pt-3 shadow-sm backdrop-blur-sm">
      <h3 className="mb-1 text-center text-sm font-bold text-gray-800">
        スプリントバーンダウンチャート
      </h3>

      <div className="mb-3 rounded-md border border-slate-200 bg-slate-50/90 px-2 py-2">
        <p className="text-[10px] font-semibold text-slate-700">
          営業日の調整（{businessDayIsos.length}日）
        </p>
        <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
          {businessDayIsos.map((iso) => (
            <li
              key={iso}
              className="flex items-center justify-between gap-1 text-[10px] text-slate-800"
            >
              <span>{formatBurndownDayLabel(iso)}</span>
              <button
                type="button"
                onClick={() => handleRemoveDay(iso)}
                disabled={businessDayIsos.length <= 1}
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                title="この営業日を削除"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <input
            type="date"
            value={newDayIso}
            onChange={(e) => setNewDayIso(e.target.value)}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[10px]"
            aria-label="営業日を追加"
          />
          <button
            type="button"
            onClick={handleAddDay}
            disabled={!newDayIso}
            className="rounded bg-slate-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            追加
          </button>
          <button
            type="button"
            onClick={onResetBusinessDays}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100"
          >
            標準5日に戻す
          </button>
          <p className="mt-1 w-full text-[9px] text-slate-500">
            JSTの今日を含む先の営業日5日分（土日祝除く）
          </p>
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 16, left: 8, bottom: 36 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-25}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={[0, maxY + 2]}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(value, name) => {
                if (value == null || value === "") return ["—", name];
                return [`${value}件`, name];
              }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            />
            <Line
              type="linear"
              dataKey="ideal"
              name="理想線"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="実績"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </aside>
  );
}
