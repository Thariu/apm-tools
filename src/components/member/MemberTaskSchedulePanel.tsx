"use client";

import { Fragment, useMemo, useState } from "react";
import {
  buildMemberScheduleModel,
  formatScheduleColumnLabel,
  type MemberTaskBar,
} from "@/lib/memberTaskSchedule";
import { formatEstimatedHours } from "@/lib/estimatedHours";
import { EstimatedHoursInput } from "@/components/ui/EstimatedHoursInput";
import { TASK_LANE_LABELS } from "@/lib/types";
import type { BoardId, ProductBacklogItem, Task } from "@/lib/types";

type MemberTaskSchedulePanelProps = {
  tasks: Task[];
  productBacklogByBoard: Record<BoardId, ProductBacklogItem[]>;
  assigneeCandidates: string[];
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
};

const ROW_HEIGHT = "2.75rem";
const DAILY_HOURS_WARNING_THRESHOLD = 8;

const TABLE_HEAD_MEMBER_CELL =
  "sticky left-0 top-0 z-40 min-w-[5rem] border border-blue-500 bg-blue-600 px-3 py-2 text-left font-bold text-white shadow-[0_1px_0_0_rgb(59,130,246)]";

function dateHeaderCellClass(isToday: boolean): string {
  const base =
    "sticky top-0 z-30 min-w-[4.5rem] border px-2 py-2 text-center text-xs font-bold tabular-nums shadow-[0_1px_0_0]";
  if (isToday) {
    return `${base} border-orange-500 bg-orange-400 text-orange-950 shadow-orange-500`;
  }
  return `${base} border-blue-500 bg-blue-600 text-white shadow-blue-500`;
}

function taskBarClassName(lane: MemberTaskBar["lane"]): string {
  if (lane === "done") {
    return "border-b-[3px] border-b-gray-400 bg-gray-200 text-gray-700 opacity-90";
  }
  if (lane === "doing") {
    return "border-b-[3px] border-b-green-500 bg-[#E6FFFA] text-gray-900";
  }
  return "border-b-[3px] border-b-[var(--color-yellow-500)] bg-[var(--color-amber-100)] text-gray-900";
}

function laneLabelBadgeClass(lane: MemberTaskBar["lane"]): string {
  const base =
    "absolute right-0.5 top-0.5 rounded-full px-1 py-px text-[7px] font-bold leading-none tracking-tight";
  if (lane === "done") {
    return `${base} bg-gray-600 text-white`;
  }
  if (lane === "doing") {
    return `${base} bg-white text-gray-800 shadow-sm ring-1 ring-green-300`;
  }
  return `${base} bg-white text-gray-800 shadow-sm ring-1 ring-[var(--color-yellow-500)]`;
}

function TaskBar({
  bar,
  categoryTitle,
  onUpdateHours,
}: {
  bar: MemberTaskBar;
  categoryTitle: string;
  onUpdateHours: (hours: number | undefined) => void;
}) {
  const laneLabel = TASK_LANE_LABELS[bar.lane];
  const hoursLabel = formatEstimatedHours(bar.estimatedHours);
  const progressLabel =
    bar.lane === "doing" && bar.progressPercent != null
      ? `${bar.progressPercent}%`
      : null;
  const tooltip = [
    categoryTitle,
    bar.title,
    progressLabel ? `進捗: ${progressLabel}` : null,
    hoursLabel ? `予定工数: ${hoursLabel}` : null,
    laneLabel,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className={[
        "relative flex min-w-0 items-center overflow-hidden rounded px-1.5 py-0.5 pr-9 shadow-sm",
        taskBarClassName(bar.lane),
      ].join(" ")}
      style={{
        gridColumn: `${bar.gridColumnStart} / ${bar.gridColumnEnd}`,
        minHeight: ROW_HEIGHT,
      }}
      title={tooltip}
    >
      <span
        className={laneLabelBadgeClass(bar.lane)}
        aria-label={`ステータス: ${laneLabel}`}
      >
        {laneLabel}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[9px] font-medium text-gray-600">{categoryTitle}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0">
          <p className="min-w-0 truncate text-[10px] font-semibold">{bar.title}</p>
          {progressLabel ? (
            <span className="shrink-0 rounded bg-sky-100 px-1 py-px text-[9px] font-bold text-sky-800">
              {progressLabel}
            </span>
          ) : null}
          <EstimatedHoursInput
            compact
            value={bar.estimatedHours}
            onChange={onUpdateHours}
          />
        </div>
      </div>
    </div>
  );
}

function DateColumnBackgrounds({
  dateColumns,
  gridTemplateColumns,
}: {
  dateColumns: string[];
  gridTemplateColumns: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-1 grid"
      style={{ gridTemplateColumns }}
      aria-hidden
    >
      {dateColumns.map((columnIso) => (
        <div
          key={columnIso}
          className="border-r border-blue-200/70 last:border-r-0"
        />
      ))}
    </div>
  );
}

function MemberDailyTotalsRow({
  dateColumns,
  dailyHourTotals,
  todayIso,
  gridTemplateColumns,
  scheduleBg,
  memberTopBorder,
}: {
  dateColumns: string[];
  dailyHourTotals: Record<string, number>;
  todayIso: string;
  gridTemplateColumns: string;
  scheduleBg: string;
  memberTopBorder: string;
}) {
  return (
    <tr>
      <td
        colSpan={dateColumns.length}
        className={[
          "relative border-x border-blue-200 p-1",
          scheduleBg,
          memberTopBorder,
          "border-b-2 border-blue-400",
        ].join(" ")}
      >
        <DateColumnBackgrounds
          dateColumns={dateColumns}
          gridTemplateColumns={gridTemplateColumns}
        />
        <div
          className="relative grid items-center"
          style={{ gridTemplateColumns, minHeight: "1.5rem" }}
          aria-label="日別工数合計"
        >
          {dateColumns.map((iso) => {
            const hours = dailyHourTotals[iso];
            const hasHours = hours != null && hours > 0;
            const display = hasHours ? formatEstimatedHours(hours) : null;
            const isOverCapacity =
              hasHours && hours > DAILY_HOURS_WARNING_THRESHOLD;
            const isToday = iso === todayIso;

            return (
              <div
                key={iso}
                className={[
                  "flex items-center justify-center px-0.5 py-0.5 text-center text-[9px] font-bold tabular-nums",
                  isToday ? "text-orange-900" : "text-gray-700",
                  isOverCapacity
                    ? "rounded bg-red-100 text-red-800 ring-1 ring-red-300"
                    : hasHours
                      ? "rounded bg-white/80 text-gray-800 ring-1 ring-blue-200/80"
                      : "text-gray-400",
                ].join(" ")}
                title={
                  hasHours
                    ? `日別合計: ${display}${isOverCapacity ? "（8h超）" : ""}`
                    : undefined
                }
              >
                {display ?? "—"}
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

function DoneVisibilityToolbar({
  showDone,
  onChange,
}: {
  showDone: boolean;
  onChange: (showDone: boolean) => void;
}) {
  return (
    <div className="shrink-0 border-b border-gray-300/60 bg-[#f0f0f0] px-1 py-2">
      <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm">
        <input
          type="checkbox"
          checked={showDone}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>Done を表示</span>
      </label>
    </div>
  );
}

export function MemberTaskSchedulePanel({
  tasks,
  productBacklogByBoard,
  assigneeCandidates,
  onUpdateTask,
}: MemberTaskSchedulePanelProps) {
  const [showDone, setShowDone] = useState(true);

  const model = useMemo(
    () =>
      buildMemberScheduleModel({
        tasks,
        productBacklogByBoard,
        assigneeCandidates,
        includeDone: showDone,
      }),
    [tasks, productBacklogByBoard, assigneeCandidates, showDone],
  );

  const { dateColumns, todayIso, members } = model;
  const gridTemplateColumns = `repeat(${dateColumns.length}, minmax(4.5rem, 1fr))`;

  if (members.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DoneVisibilityToolbar showDone={showDone} onChange={setShowDone} />
        <section className="rounded-lg border border-gray-300/80 bg-white/90 px-4 py-8 text-center shadow-sm backdrop-blur-sm">
          <p className="text-sm font-medium text-gray-700">
            表示できるタスクがありません
          </p>
          <p className="mt-1 text-xs text-gray-500">
            ToDo / Doing / Done のタスクに担当者と期間（着手日または完了期限）を設定してください。
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DoneVisibilityToolbar showDone={showDone} onChange={setShowDone} />
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-300/80 bg-white/90 shadow-sm backdrop-blur-sm">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className={TABLE_HEAD_MEMBER_CELL}>
                メンバー
              </th>
              {dateColumns.map((iso) => (
                <th
                  key={iso}
                  scope="col"
                  className={dateHeaderCellClass(iso === todayIso)}
                >
                  {formatScheduleColumnLabel(iso)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member, memberIndex) => {
              let memberRowRendered = false;
              const isEvenMember = memberIndex % 2 === 0;
              const memberNameBg = isEvenMember ? "bg-blue-100" : "bg-sky-100";
              const scheduleBg = isEvenMember ? "bg-blue-50/90" : "bg-sky-50/90";
              const memberTopBorder =
                memberIndex > 0 ? "border-t-2 border-blue-400" : "";

              const taskRows = member.categories.flatMap((category) =>
                category.subRows.map((bars, subRowIndex) => {
                  const isFirstMemberRow = !memberRowRendered;
                  if (isFirstMemberRow) memberRowRendered = true;

                  return (
                    <tr
                      key={`${member.memberName}-${category.parentIssueId}-${subRowIndex}`}
                    >
                      {isFirstMemberRow ? (
                        <th
                          scope="row"
                          rowSpan={member.rowCount}
                          className={[
                            "sticky left-0 z-20 border-x border-blue-200 px-3 py-2 text-left align-middle font-bold text-gray-900",
                            memberNameBg,
                            memberTopBorder,
                            "border-b-2 border-blue-400",
                          ].join(" ")}
                        >
                          {member.memberName}
                        </th>
                      ) : null}
                      <td
                        colSpan={dateColumns.length}
                        className={[
                          "relative border-x border-blue-200 p-1",
                          scheduleBg,
                          isFirstMemberRow ? memberTopBorder : "",
                          "border-b border-blue-200",
                        ].join(" ")}
                      >
                        <DateColumnBackgrounds
                          dateColumns={dateColumns}
                          gridTemplateColumns={gridTemplateColumns}
                        />
                        <div
                          className="relative grid items-center"
                          style={{
                            gridTemplateColumns,
                            minHeight: ROW_HEIGHT,
                          }}
                        >
                          {bars.map((bar) => (
                            <TaskBar
                              key={bar.taskId}
                              bar={bar}
                              categoryTitle={category.categoryTitle}
                              onUpdateHours={(estimatedHours) =>
                                onUpdateTask(bar.taskId, { estimatedHours })
                              }
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                }),
              );

              return (
                <Fragment key={member.memberName}>
                  {taskRows}
                  <MemberDailyTotalsRow
                    dateColumns={dateColumns}
                    dailyHourTotals={member.dailyHourTotals}
                    todayIso={todayIso}
                    gridTemplateColumns={gridTemplateColumns}
                    scheduleBg={scheduleBg}
                    memberTopBorder=""
                  />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
