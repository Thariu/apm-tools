"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RetrospectiveCanvas } from "@/components/retro/RetrospectiveCanvas";
import { usePlanningData } from "@/hooks/usePlanningData";
import type { BurndownSprintState } from "@/lib/burndownSprintStorage";
import { isRetroSessionArchived } from "@/lib/retroArchive";
import {
  buildRetroSprintKeyOptions,
  detectRetroSprintKeyMigration,
  getPlanningSprintKey,
  resolveAutoRetroSprintKey,
  resolveCurrentRetroSprintKey,
  retroPeriodLabelFromSprintKey,
} from "@/lib/retroPeriod";
import type { BoardId, RetroSession } from "@/lib/types";

type Tab = "current" | "past";

type Props = {
  boardId: BoardId;
};

function retroPeriodLabel(session: RetroSession, fallbackSprintKey: string): string {
  return retroPeriodLabelFromSprintKey(fallbackSprintKey, session);
}

export function RetrospectivePanel({ boardId }: Props) {
  const {
    burndownSprint,
    releaseBurnupByBoard,
    retroBySprint,
    getRetroSession,
    getArchivedRetroSessionsForBoard,
    isRetroSessionLoaded,
    saveBurndownSprintState,
    migrateRetroSprintPeriod,
  } = usePlanningData();

  const planningSprintKey = useMemo(
    () => getPlanningSprintKey(burndownSprint),
    [burndownSprint],
  );

  const autoRetroSprintKey = useMemo(
    () =>
      resolveAutoRetroSprintKey({
        burndownSprint,
        releaseBurnupByBoard,
        retroBySprint,
      }),
    [burndownSprint, releaseBurnupByBoard, retroBySprint],
  );

  const currentPeriodSprintKey = useMemo(
    () =>
      resolveCurrentRetroSprintKey({
        burndownSprint,
        releaseBurnupByBoard,
        retroBySprint,
      }),
    [burndownSprint, releaseBurnupByBoard, retroBySprint],
  );

  const isManualRetroPeriod = Boolean(
    burndownSprint.retroActiveSprintKey?.trim(),
  );

  const retroPeriodOptions = useMemo(
    () => buildRetroSprintKeyOptions(planningSprintKey),
    [planningSprintKey],
  );

  const archived = getArchivedRetroSessionsForBoard(boardId);

  const currentPeriodSession = getRetroSession(boardId, currentPeriodSprintKey);
  const currentPeriodIsArchived = isRetroSessionArchived(currentPeriodSession);

  const [tab, setTab] = useState<Tab>("current");
  const [pastSprintKey, setPastSprintKey] = useState<string | null>(null);
  const [didAutoSwitchToPast, setDidAutoSwitchToPast] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const sprintKeyMigration = useMemo(
    () =>
      detectRetroSprintKeyMigration({
        planningSprintKey,
        autoRetroSprintKey,
        retroBySprint,
      }),
    [autoRetroSprintKey, planningSprintKey, retroBySprint],
  );

  const migrationFromLabel = useMemo(() => {
    if (!sprintKeyMigration) return "";
    return retroPeriodLabelFromSprintKey(
      sprintKeyMigration.fromSprintKey,
      getRetroSession(boardId, sprintKeyMigration.fromSprintKey),
    );
  }, [boardId, getRetroSession, sprintKeyMigration]);

  const migrationToLabel = useMemo(() => {
    if (!sprintKeyMigration) return "";
    return retroPeriodLabelFromSprintKey(sprintKeyMigration.toSprintKey);
  }, [sprintKeyMigration]);

  const handleMigrateRetroPeriod = useCallback(async () => {
    if (!sprintKeyMigration) return;
    const message =
      `振り返りの期間を移行しますか？\n\n` +
      `移行元: ${migrationFromLabel}\n` +
      `移行先: ${migrationToLabel}\n\n` +
      `付箋・スコアなどの内容はそのまま移されます。`;
    if (!window.confirm(message)) return;

    setIsMigrating(true);
    try {
      await migrateRetroSprintPeriod(
        sprintKeyMigration.fromSprintKey,
        sprintKeyMigration.toSprintKey,
      );
    } catch (err) {
      console.error(err);
      window.alert(
        err instanceof Error ? err.message : "振り返りの移行に失敗しました",
      );
    } finally {
      setIsMigrating(false);
    }
  }, [
    migrateRetroSprintPeriod,
    migrationFromLabel,
    migrationToLabel,
    sprintKeyMigration,
  ]);

  const setRetroActiveSprintKey = useCallback(
    (sprintKey: string | null) => {
      const trimmed = sprintKey?.trim();
      const next: BurndownSprintState = {
        ...burndownSprint,
        retroActiveSprintKey: trimmed || undefined,
      };
      if (!trimmed) {
        delete next.retroActiveSprintKey;
      }
      saveBurndownSprintState(next);
    },
    [burndownSprint, saveBurndownSprintState],
  );

  useEffect(() => {
    setDidAutoSwitchToPast(false);
  }, [currentPeriodSprintKey]);

  useEffect(() => {
    if (archived.length === 0) {
      setPastSprintKey(null);
      return;
    }
    setPastSprintKey((prev) => {
      if (prev && archived.some((s) => s.sprintKey === prev)) return prev;
      return archived[0].sprintKey;
    });
  }, [archived]);

  useEffect(() => {
    if (didAutoSwitchToPast) return;
    if (!currentPeriodIsArchived || archived.length === 0) return;
    setTab("past");
    setDidAutoSwitchToPast(true);
  }, [archived.length, currentPeriodIsArchived, didAutoSwitchToPast]);

  const viewingSprintKey =
    tab === "current"
      ? currentPeriodSprintKey
      : (pastSprintKey ?? archived[0]?.sprintKey ?? currentPeriodSprintKey);

  const viewingSession = getRetroSession(boardId, viewingSprintKey);
  const readOnly = tab === "past" || isRetroSessionArchived(viewingSession);

  const activePeriodLabel = useMemo(
    () =>
      retroPeriodLabelFromSprintKey(
        currentPeriodSprintKey,
        currentPeriodSession,
      ),
    [currentPeriodSession, currentPeriodSprintKey],
  );

  const autoPeriodLabel = useMemo(
    () =>
      retroPeriodLabelFromSprintKey(
        autoRetroSprintKey,
        getRetroSession(boardId, autoRetroSprintKey),
      ),
    [autoRetroSprintKey, boardId, getRetroSession],
  );

  const collectionLoaded = isRetroSessionLoaded(boardId, currentPeriodSprintKey);

  const showCanvas =
    (tab === "past" && archived.length > 0) ||
    (tab === "current" && !currentPeriodIsArchived);

  const retroPeriodSelectValue = isManualRetroPeriod
    ? currentPeriodSprintKey
    : "";

  return (
    <div className="flex w-full min-w-[900px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setTab("current")}
          className={`rounded px-3 py-1 text-xs font-semibold ${
            tab === "current"
              ? "bg-blue-600 text-white"
              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          今スプリントの振り返り
        </button>
        <button
          type="button"
          onClick={() => setTab("past")}
          className={`rounded px-3 py-1 text-xs font-semibold ${
            tab === "past"
              ? "bg-blue-600 text-white"
              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          過去の振り返り
          {archived.length > 0 ? (
            <span className="ml-1 opacity-90">({archived.length})</span>
          ) : null}
        </button>
        <span className="text-[11px] text-gray-500">
          振り返りは3ボード共通・過去分は最新10件（読み取り専用）
        </span>
      </div>

      {tab === "current" && sprintKeyMigration ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
          <p>
            {migrationFromLabel} の振り返りが誤った期間に保存されています。
            内容をそのまま {migrationToLabel} に移行できます。
          </p>
          <button
            type="button"
            onClick={handleMigrateRetroPeriod}
            disabled={isMigrating}
            className="shrink-0 rounded bg-violet-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMigrating ? "移行中…" : "期間を移行する"}
          </button>
        </div>
      ) : null}

      {tab === "current" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm">
          <span className="text-xs font-semibold text-gray-700">振り返り期間</span>
          <select
            value={retroPeriodSelectValue}
            onChange={(e) => {
              const v = e.target.value;
              setRetroActiveSprintKey(v || null);
            }}
            aria-label="振り返り期間"
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
          >
            <option value="">
              自動（{autoPeriodLabel}）
            </option>
            {retroPeriodOptions.map((key) => (
              <option key={key} value={key}>
                {retroPeriodLabelFromSprintKey(
                  key,
                  getRetroSession(boardId, key),
                )}
              </option>
            ))}
          </select>
          {isManualRetroPeriod ? (
            <button
              type="button"
              onClick={() => setRetroActiveSprintKey(null)}
              className="rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50"
            >
              自動に戻す
            </button>
          ) : null}
          {!isManualRetroPeriod && autoRetroSprintKey !== planningSprintKey ? (
            <span className="text-[10px] text-blue-700">
              バーンダウンとは別期間（{activePeriodLabel}）を表示中
            </span>
          ) : null}
        </div>
      ) : null}

      {tab === "current" && currentPeriodIsArchived ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          このスプリント（{activePeriodLabel}）の振り返りは過去の振り返りに移されました（全ボード共通）。
          「過去の振り返り」タブから閲覧できます（編集不可）。
        </div>
      ) : null}

      {tab === "past" ? (
        archived.length === 0 ? (
          <div className="rounded-lg border border-gray-300/80 bg-white/90 px-4 py-8 text-center text-sm text-gray-600 shadow-sm">
            {collectionLoaded
              ? "過去の振り返りはまだありません。"
              : "読み込み中…"}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 py-2 shadow-sm">
            <span className="text-xs font-semibold text-gray-700">表示する期間</span>
            <select
              value={pastSprintKey ?? archived[0].sprintKey}
              onChange={(e) => setPastSprintKey(e.target.value)}
              aria-label="表示する期間"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
            >
              {archived.map((s) => (
                <option key={s.sprintKey} value={s.sprintKey}>
                  {retroPeriodLabel(s, s.sprintKey)}
                </option>
              ))}
            </select>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
              読み取り専用
            </span>
          </div>
        )
      ) : null}

      {showCanvas ? (
        <RetrospectiveCanvas
          key={viewingSprintKey}
          boardId={boardId}
          sprintKey={viewingSprintKey}
          readOnly={readOnly}
          showFacilitationRow={tab === "current"}
        />
      ) : null}
    </div>
  );
}
