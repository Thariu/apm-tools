"use client";

import { onSnapshot, orderBy, query } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOARD_ORDER } from "@/lib/boardConfig";
import { buildDefaultBusinessDayIsos } from "@/lib/burndown";
import type { BurndownSprintState } from "@/lib/burndownSprintStorage";
import { migrateRetroSprintKey } from "@/lib/firebase/retroSprintKeyMigration";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import {
  docToProductBacklog,
  docToTask,
  finalizedSprintFromFirestore,
  parseBoardScheduleDoc,
  parseBurndownSnapshots,
  type ProductBacklogDoc,
} from "@/lib/firebase/mappers";
import {
  boardReleaseBurnupDoc,
  boardScheduleDoc,
  assigneesColorsCollection,
  assigneesDirectoryCollection,
  goalTextDirectoryCollection,
  taskTemplateSetsCollection,
  burndownSprintDoc,
  burndownSnapshotsCollection,
  finalizedSprintsCollection,
  productBacklogCollection,
  tasksCollection,
  retroDraftDoc,
  retroFacilitationDoc,
  retroFdlNotesCollection,
  retroFdlThankYouNotesCollection,
  retroHappinessImprovementNotesCollection,
  retroHappinessReasonNotesCollection,
  retroSessionsCollection,
} from "@/lib/firebase/paths";
import { migrateLegacyBoardRetrosToSharedOnce } from "@/lib/firebase/retroMigration";
import {
  migrateRetroSessionNotesToSubcollections,
  patchContainsEmbeddedNotes,
  replaceRetroNotesFromSessionData,
  stripEmbeddedNotesFromSessionPatch,
} from "@/lib/firebase/retroNotesRepository";
import {
  deleteProductBacklogItem,
  deleteRetroSession as deleteRetroSessionDoc,
  pruneArchivedRetroSessions,
  deleteTaskRecord,
  patchProductBacklogItem,
  patchScheduleDay,
  patchSprintGoal,
  patchTask,
  patchRetroSession,
  patchRetroFdlNotesMerged,
  patchRetroFdlThankYouNotesMerged,
  patchRetroHappinessNotesMerged,
  patchRetroHappinessNoteDoc,
  patchRetroDraft,
  patchRetroFacilitation,
  reorderProductBacklogFirestore,
  saveReleaseBurnupBoardState,
  seedDatabaseIfEmpty,
  setBurndownSnapshot,
  setAssigneeColor,
  upsertAssigneeDirectoryEntry,
  deleteAssigneeDirectoryEntry,
  upsertGoalTextDirectoryEntry,
  deleteGoalTextDirectoryEntry,
  setTaskTemplateSet,
  deleteTaskTemplateSet as deleteTaskTemplateSetDoc,
  setBurndownSprint as persistBurndownSprintDoc,
  setProductBacklogItem,
  setRetroSession,
  setTask,
} from "@/lib/firebase/planningRepository";
import {
  defaultBurndownSprintState,
  EMPTY_BURNDOWN_SNAPSHOTS,
} from "@/lib/planningDefaults";
import {
  cloneProductBacklogItem,
  cloneTask,
  createProductBacklogItem,
  createTask,
  deleteProductBacklogInBoard,
  deleteTaskInList,
  deleteTasksByParentIssueId,
  reorderProductBacklog,
  repositionTaskInList,
  repositionTasksInList,
  updateProductBacklogInBoard,
  updateScheduleDay,
  updateTaskInList,
} from "@/lib/planningActions";
import {
  type FinalizedSprintBurnup,
  trimFinalizedSprints,
} from "@/lib/releaseBurnup";
import type { BurndownSnapshotsByBoard } from "@/lib/burndownStorage";
import type { ReleaseBurnupByBoard } from "@/lib/releaseBurnupStorage";
import { defaultReleaseBurnupBoardState } from "@/lib/planningDefaults";
import { getSeedSchedulesByBoard } from "@/lib/firebase/seedData";
import { defaultRetroFdlData, defaultRetroHappinessData } from "@/lib/retroDefaults";
import { writeCachedFacilitationParticipants } from "@/lib/retroFacilitationStorage";
import { patchNoteInList } from "@/lib/retroNotesMerge";
import {
  getPlanningSprintKey,
  resolveCurrentRetroSprintKey,
} from "@/lib/retroPeriod";
import type {
  BoardId,
  ProductBacklogItem,
  RetroDraft,
  RetroFacilitation,
  RetroFdlNote,
  RetroFramework,
  RetroHappinessNote,
  RetroSession,
  RetroThankYouNote,
  SprintSchedule,
  Task,
  TaskLane,
  TaskPatch,
  TaskTemplateSet,
  WeekdayKey,
} from "@/lib/types";
import {
  LEGACY_DEFAULT_SET_NAME,
  normalizeTaskTemplateSet,
  sortTemplateItems,
} from "@/lib/taskTemplateSetUtils";
import type { AssigneeColorId } from "@/lib/assigneeColors";
import { getFallbackAssigneeColorId, isAssigneeColorId } from "@/lib/assigneeColors";
import { mergeBoardTasks } from "@/lib/taskUtils";
import { createId } from "@/lib/id";
import {
  MAX_ARCHIVED_RETRO_SESSIONS,
  resolveRetroBusinessDayIsos,
  shouldArchiveRetroSession,
  sortArchivedRetroSessions,
} from "@/lib/retroArchive";

export type PlanningDataStatus = "loading" | "ready" | "error" | "no_config";

function sortRetroNotes<T extends { id: string; createdAt?: number }>(
  notes: T[],
): T[] {
  return [...notes].sort((a, b) => {
    const ca = a.createdAt ?? 0;
    const cb = b.createdAt ?? 0;
    if (ca !== cb) return ca - cb;
    return a.id.localeCompare(b.id);
  });
}

function notesFromSnapshot<T extends { id: string; createdAt?: number }>(
  docs: { id: string; data: () => Record<string, unknown> }[],
): T[] {
  return sortRetroNotes(
    docs.map((d) => ({ id: d.id, ...d.data() }) as T),
  );
}

function notesArraysEqual<T>(a: T[], b: T[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function retroSprintKeyListEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mergeSessionPreservingSubcollectionNotes(
  incoming: RetroSession,
  existing: RetroSession | null | undefined,
): RetroSession {
  if (!incoming.notesInSubcollections || !existing) return incoming;
  return {
    ...incoming,
    fdl: incoming.fdl
      ? {
          ...incoming.fdl,
          notes: existing.fdl?.notes ?? [],
          thankYouNotes: existing.fdl?.thankYouNotes ?? [],
        }
      : incoming.fdl,
    happiness: incoming.happiness
      ? {
          ...incoming.happiness,
          reasons: existing.happiness?.reasons ?? [],
          improvements: existing.happiness?.improvements ?? [],
        }
      : incoming.happiness,
  };
}

const BURNDOWN_SNAPSHOT_DEBOUNCE_MS = 3000;

function mergeRetroSessionInState(
  prev: Record<string, RetroSession | null>,
  sprintKey: string,
  patch: Partial<RetroSession>,
): Record<string, RetroSession | null> {
  const current = prev[sprintKey];
  if (!current && Object.keys(patch).length === 0) return prev;
  const now = new Date().toISOString();
  const next: RetroSession = {
    ...(current ?? {
      sprintKey,
      framework: "fdl",
      participants: [],
      facilitatorIndex: 0,
      createdAt: now,
      updatedAt: now,
    }),
    ...patch,
    sprintKey,
    updatedAt: patch.updatedAt ?? now,
  };
  return { ...prev, [sprintKey]: next };
}

function initialReleaseBurnupByBoard(): ReleaseBurnupByBoard {
  return {
    baseball_board: defaultReleaseBurnupBoardState(),
    proposal_improvement: defaultReleaseBurnupBoardState(),
    ad_hoc: defaultReleaseBurnupBoardState(),
  };
}

function initialSchedules(): Record<BoardId, SprintSchedule> {
  return getSeedSchedulesByBoard();
}

function initialSprintGoals(): Record<BoardId, string> {
  return Object.fromEntries(BOARD_ORDER.map((id) => [id, ""])) as Record<
    BoardId,
    string
  >;
}

export function usePlanningData() {
  const [status, setStatus] = useState<PlanningDataStatus>(() =>
    isFirebaseConfigured() ? "loading" : "no_config",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [productBacklogByBoard, setProductBacklogByBoard] = useState<
    Record<BoardId, ProductBacklogItem[]>
  >({
    baseball_board: [],
    proposal_improvement: [],
    ad_hoc: [],
  });
  const productBacklogByBoardRef = useRef(productBacklogByBoard);
  const [schedulesByBoard, setSchedulesByBoard] =
    useState<Record<BoardId, SprintSchedule>>(initialSchedules);
  const [sprintGoalsByBoard, setSprintGoalsByBoard] =
    useState<Record<BoardId, string>>(initialSprintGoals);
  const [burndownSnapshotsByBoard, setBurndownSnapshotsByBoard] =
    useState<BurndownSnapshotsByBoard>(EMPTY_BURNDOWN_SNAPSHOTS);
  const [releaseBurnupByBoard, setReleaseBurnupByBoard] =
    useState<ReleaseBurnupByBoard>(initialReleaseBurnupByBoard);
  const [burndownSprint, setBurndownSprint] = useState<BurndownSprintState>(() =>
    defaultBurndownSprintState(),
  );

  const [retroBySprint, setRetroBySprint] = useState<
    Record<string, RetroSession | null>
  >({});
  const [retroSessionsLoaded, setRetroSessionsLoaded] = useState(false);
  /** 付箋サブコレクション購読用（セッション一覧の変更時のみ更新） */
  const [retroSprintKeyList, setRetroSprintKeyList] = useState<string[]>([]);

  const [retroDraftByBoard, setRetroDraftByBoard] = useState<
    Record<BoardId, Record<string, RetroDraft | null>>
  >({
    baseball_board: {},
    proposal_improvement: {},
    ad_hoc: {},
  });

  const [retroDraftLoadedByBoard, setRetroDraftLoadedByBoard] = useState<
    Record<BoardId, Record<string, boolean>>
  >({
    baseball_board: {},
    proposal_improvement: {},
    ad_hoc: {},
  });

  const [retroFacilitationBySprint, setRetroFacilitationBySprint] = useState<
    Record<string, RetroFacilitation | null>
  >({});

  const [retroFacilitationLoadedBySprint, setRetroFacilitationLoadedBySprint] =
    useState<Record<string, boolean>>({});

  const [assigneeColorByName, setAssigneeColorByName] =
    useState<Record<string, AssigneeColorId>>({});

  const [assigneeDirectory, setAssigneeDirectory] = useState<
    { name: string; colorId: AssigneeColorId }[]
  >([]);

  const [goalTextDirectory, setGoalTextDirectory] = useState<
    { text: string }[]
  >([]);

  const [taskTemplateSets, setTaskTemplateSets] = useState<TaskTemplateSet[]>([]);

  const wipDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWipRef = useRef<{
    boardId: BoardId;
    dayIso: string;
    wip: number;
  } | null>(null);
  const snapshotUnsubsRef = useRef<(() => void)[]>([]);
  const tasksRef = useRef(tasks);
  const taskDragSnapshotRef = useRef<Task[] | null>(null);
  const lastAddTaskAtRef = useRef<Record<string, number>>({});
  const pendingAddTaskIdRef = useRef<Record<string, string>>({});
  const lastDuplicateTaskAtRef = useRef<Record<string, number>>({});
  const lastDuplicateSwimlaneAtRef = useRef<Record<string, number>>({});
  const lastAddBacklogAtRef = useRef<Record<string, number>>({});
  const pendingAddBacklogIdRef = useRef<Record<string, string>>({});
  const retroArchivingRef = useRef<Set<string>>(new Set());
  const retroNotesMigratingRef = useRef<Set<string>>(new Set());
  const retroBySprintRef = useRef(retroBySprint);

  useEffect(() => {
    productBacklogByBoardRef.current = productBacklogByBoard;
  }, [productBacklogByBoard]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    retroBySprintRef.current = retroBySprint;
  }, [retroBySprint]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    snapshotUnsubsRef.current = [];
    let cancelled = false;

    const subscribe = (unsub: () => void) => {
      if (cancelled) unsub();
      else snapshotUnsubsRef.current.push(unsub);
    };

    void (async () => {
      try {
        await seedDatabaseIfEmpty();
        if (cancelled) return;

        subscribe(
          onSnapshot(assigneesColorsCollection(), (snap) => {
            const map: Record<string, AssigneeColorId> = {};
            for (const d of snap.docs) {
              const data = d.data() as {
                name?: unknown;
                colorId?: unknown;
              };
              if (
                typeof data.name === "string" &&
                isAssigneeColorId(data.colorId)
              ) {
                map[data.name] = data.colorId;
              }
            }
            setAssigneeColorByName(map);
          }),
        );

        subscribe(
          onSnapshot(assigneesDirectoryCollection(), (snap) => {
            const items: { name: string; colorId: AssigneeColorId }[] = [];
            for (const d of snap.docs) {
              const data = d.data() as { name?: unknown; colorId?: unknown };
              if (typeof data.name !== "string") continue;
              const name = data.name.trim();
              if (!name) continue;
              const colorId = isAssigneeColorId(data.colorId)
                ? data.colorId
                : getFallbackAssigneeColorId(name);
              items.push({ name, colorId });
            }
            items.sort((a, b) => a.name.localeCompare(b.name, "ja-JP"));
            setAssigneeDirectory(items);
          }),
        );

        subscribe(
          onSnapshot(goalTextDirectoryCollection(), (snap) => {
            const items: { text: string }[] = [];
            for (const d of snap.docs) {
              const data = d.data() as { text?: unknown };
              if (typeof data.text !== "string") continue;
              const text = data.text.trim();
              if (!text) continue;
              items.push({ text });
            }
            items.sort((a, b) => a.text.localeCompare(b.text, "ja-JP"));
            setGoalTextDirectory(items);
          }),
        );

        subscribe(
          onSnapshot(query(taskTemplateSetsCollection(), orderBy("sortOrder")), (snap) => {
            const items: TaskTemplateSet[] = [];
            for (const d of snap.docs) {
              const normalized = normalizeTaskTemplateSet(
                d.data() as Partial<TaskTemplateSet>,
                d.id,
              );
              if (normalized) items.push(normalized);
            }
            for (const set of items) {
              if (set.name === LEGACY_DEFAULT_SET_NAME) {
                void deleteTaskTemplateSetDoc(set.id).catch(console.error);
              }
            }
            const visible = items.filter((s) => s.name !== LEGACY_DEFAULT_SET_NAME);
            visible.sort((a, b) => {
              if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
              return a.name.localeCompare(b.name, "ja-JP");
            });
            setTaskTemplateSets(visible);
          }),
        );

        subscribe(
          onSnapshot(burndownSprintDoc(), (snap) => {
            if (snap.exists()) {
              setBurndownSprint(snap.data() as BurndownSprintState);
            } else {
              setBurndownSprint(defaultBurndownSprintState());
            }
          }),
        );

        for (const boardId of BOARD_ORDER) {
          subscribe(
            onSnapshot(
              query(
                productBacklogCollection(boardId),
                orderBy("sortOrder"),
              ),
              (snap) => {
                const items = snap.docs.map((d) =>
                  docToProductBacklog(d.data() as ProductBacklogDoc),
                );
                setProductBacklogByBoard((prev) => ({
                  ...prev,
                  [boardId]: items,
                }));
              },
            ),
          );

          subscribe(
            onSnapshot(tasksCollection(boardId), (snap) => {
              const boardTasks = snap.docs.map((d) =>
                docToTask(d.data() as Task),
              );
              setTasks((prev) => mergeBoardTasks(prev, boardId, boardTasks));
            }),
          );

          subscribe(
            onSnapshot(boardScheduleDoc(boardId), (snap) => {
              const fallback = initialSchedules()[boardId];
              const { schedule, sprintGoal } = snap.exists()
                ? parseBoardScheduleDoc(
                    snap.data() as Record<string, unknown>,
                    fallback,
                  )
                : { schedule: fallback, sprintGoal: "" };
              setSchedulesByBoard((prev) => ({
                ...prev,
                [boardId]: schedule,
              }));
              setSprintGoalsByBoard((prev) => ({
                ...prev,
                [boardId]: sprintGoal,
              }));
            }),
          );

          subscribe(
            onSnapshot(burndownSnapshotsCollection(boardId), (snap) => {
              const byDay = parseBurndownSnapshots(
                snap.docs.map((d) => ({
                  id: d.id,
                  wip: (d.data().wip as number) ?? 0,
                })),
              );
              setBurndownSnapshotsByBoard((prev) => ({
                ...prev,
                [boardId]: byDay,
              }));
            }),
          );

          subscribe(
            onSnapshot(boardReleaseBurnupDoc(boardId), (snap) => {
              const releaseStartTuesdayIso = snap.exists()
                ? (snap.data().releaseStartTuesdayIso as string)
                : defaultReleaseBurnupBoardState().releaseStartTuesdayIso;
              setReleaseBurnupByBoard((prev) => ({
                ...prev,
                [boardId]: {
                  ...prev[boardId],
                  releaseStartTuesdayIso,
                },
              }));
            }),
          );

          subscribe(
            onSnapshot(finalizedSprintsCollection(boardId), (snap) => {
              const raw = snap.docs.map((d) =>
                finalizedSprintFromFirestore(d.data() as FinalizedSprintBurnup),
              );
              const finalizedSprints = trimFinalizedSprints(raw);
              setReleaseBurnupByBoard((prev) => {
                const board =
                  prev[boardId] ?? defaultReleaseBurnupBoardState();
                const nextBoard = { ...board, finalizedSprints };
                if (raw.length > finalizedSprints.length) {
                  void saveReleaseBurnupBoardState(boardId, nextBoard).catch(
                    console.error,
                  );
                }
                return { ...prev, [boardId]: nextBoard };
              });
            }),
          );
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : "データの読み込みに失敗しました",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      snapshotUnsubsRef.current.forEach((u) => u());
      snapshotUnsubsRef.current = [];
      if (wipDebounceRef.current) clearTimeout(wipDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (status !== "ready") return;
    void migrateLegacyBoardRetrosToSharedOnce().catch(console.error);
  }, [status]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (status !== "ready") return;

    let cancelled = false;

    const unsub = onSnapshot(retroSessionsCollection(), (snap) => {
      if (cancelled) return;
      const nextKeyList = snap.docs.map((d) => d.id).sort();
      setRetroSprintKeyList((prev) =>
        retroSprintKeyListEqual(prev, nextKeyList) ? prev : nextKeyList,
      );
      setRetroBySprint((prev) => {
        const map: Record<string, RetroSession | null> = {};
        snap.docs.forEach((d) => {
          const incoming = {
            ...(d.data() as RetroSession),
            sprintKey: d.id,
          };
          map[d.id] = mergeSessionPreservingSubcollectionNotes(
            incoming,
            prev[d.id],
          );
        });
        return map;
      });
      setRetroSessionsLoaded(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [status]);

  const retroSprintKeysKey = retroSprintKeyList.join("\0");

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (status !== "ready") return;

    let cancelled = false;
    const unsubs: (() => void)[] = [];

    const applyNotesPatch = (
      sprintKey: string,
      patch: {
        fdlNotes?: RetroFdlNote[];
        thankYouNotes?: RetroThankYouNote[];
        happinessReasons?: RetroHappinessNote[];
        happinessImprovements?: RetroHappinessNote[];
      },
    ) => {
      if (cancelled) return;
      setRetroBySprint((prev) => {
        const session = prev[sprintKey];
        if (!session) return prev;

        let nextFdl = session.fdl;
        let nextHappiness = session.happiness;
        let changed = false;

        if (patch.fdlNotes !== undefined) {
          const current = session.fdl?.notes ?? [];
          if (!notesArraysEqual(patch.fdlNotes, current)) {
            nextFdl = {
              ...(session.fdl ?? defaultRetroFdlData()),
              notes: patch.fdlNotes,
            };
            changed = true;
          }
        }
        if (patch.thankYouNotes !== undefined) {
          const current = session.fdl?.thankYouNotes ?? [];
          if (!notesArraysEqual(patch.thankYouNotes, current)) {
            nextFdl = {
              ...(nextFdl ?? session.fdl ?? defaultRetroFdlData()),
              thankYouNotes: patch.thankYouNotes,
            };
            changed = true;
          }
        }
        if (patch.happinessReasons !== undefined) {
          const current = session.happiness?.reasons ?? [];
          if (!notesArraysEqual(patch.happinessReasons, current)) {
            nextHappiness = {
              ...(session.happiness ?? defaultRetroHappinessData()),
              reasons: patch.happinessReasons,
            };
            changed = true;
          }
        }
        if (patch.happinessImprovements !== undefined) {
          const current = session.happiness?.improvements ?? [];
          if (!notesArraysEqual(patch.happinessImprovements, current)) {
            nextHappiness = {
              ...(nextHappiness ?? session.happiness ?? defaultRetroHappinessData()),
              improvements: patch.happinessImprovements,
            };
            changed = true;
          }
        }

        if (!changed) return prev;

        return {
          ...prev,
          [sprintKey]: {
            ...session,
            ...(nextFdl !== session.fdl ? { fdl: nextFdl } : {}),
            ...(nextHappiness !== session.happiness
              ? { happiness: nextHappiness }
              : {}),
          },
        };
      });
    };

    for (const sprintKey of retroSprintKeyList) {
      unsubs.push(
        onSnapshot(retroFdlNotesCollection(sprintKey), (snap) => {
          const session = retroBySprintRef.current[sprintKey];
          if (!session) return;
          if (!session.notesInSubcollections && snap.empty) return;
          applyNotesPatch(sprintKey, {
            fdlNotes: notesFromSnapshot<RetroFdlNote>(snap.docs),
          });
        }),
      );
      unsubs.push(
        onSnapshot(retroFdlThankYouNotesCollection(sprintKey), (snap) => {
          const session = retroBySprintRef.current[sprintKey];
          if (!session) return;
          if (!session.notesInSubcollections && snap.empty) return;
          applyNotesPatch(sprintKey, {
            thankYouNotes: notesFromSnapshot<RetroThankYouNote>(snap.docs),
          });
        }),
      );
      unsubs.push(
        onSnapshot(retroHappinessReasonNotesCollection(sprintKey), (snap) => {
          const session = retroBySprintRef.current[sprintKey];
          if (!session) return;
          if (!session.notesInSubcollections && snap.empty) return;
          applyNotesPatch(sprintKey, {
            happinessReasons: notesFromSnapshot<RetroHappinessNote>(snap.docs),
          });
        }),
      );
      unsubs.push(
        onSnapshot(retroHappinessImprovementNotesCollection(sprintKey), (snap) => {
          const session = retroBySprintRef.current[sprintKey];
          if (!session) return;
          if (!session.notesInSubcollections && snap.empty) return;
          applyNotesPatch(sprintKey, {
            happinessImprovements: notesFromSnapshot<RetroHappinessNote>(
              snap.docs,
            ),
          });
        }),
      );
    }

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [retroSprintKeysKey, status]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (status !== "ready") return;

    for (const [sprintKey, session] of Object.entries(retroBySprint)) {
      if (!session || session.notesInSubcollections) continue;
      if (retroNotesMigratingRef.current.has(sprintKey)) continue;
      retroNotesMigratingRef.current.add(sprintKey);
      void migrateRetroSessionNotesToSubcollections(sprintKey, session)
        .catch(console.error)
        .finally(() => {
          retroNotesMigratingRef.current.delete(sprintKey);
        });
    }
  }, [retroBySprint, status]);

  const retroFacilitationSprintKeys = useMemo(() => {
    const planningKey = getPlanningSprintKey(burndownSprint);
    const retroKey = resolveCurrentRetroSprintKey({
      burndownSprint,
      releaseBurnupByBoard,
      retroBySprint,
    });
    return [
      ...new Set([
        burndownSprint.activeSprintTuesdayIso,
        planningKey,
        retroKey,
      ]),
    ];
  }, [burndownSprint, releaseBurnupByBoard, retroBySprint]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (status !== "ready") return;

    let cancelled = false;
    const unsubs: (() => void)[] = [];

    for (const sprintKey of retroFacilitationSprintKeys) {
      setRetroDraftLoadedByBoard((prev) => {
        const next = { ...prev };
        for (const boardId of BOARD_ORDER) {
          next[boardId] = { ...next[boardId], [sprintKey]: false };
        }
        return next;
      });
      setRetroFacilitationLoadedBySprint((prev) => ({
        ...prev,
        [sprintKey]: false,
      }));

      const unsubFacilitation = onSnapshot(
        retroFacilitationDoc(sprintKey),
        (snap) => {
          if (cancelled) return;
          const data = snap.exists()
            ? (snap.data() as RetroFacilitation)
            : null;
          if (data?.participants?.length) {
            writeCachedFacilitationParticipants(sprintKey, data.participants);
          }
          setRetroFacilitationBySprint((prev) => ({
            ...prev,
            [sprintKey]: data,
          }));
          setRetroFacilitationLoadedBySprint((prev) => ({
            ...prev,
            [sprintKey]: true,
          }));
        },
      );
      unsubs.push(unsubFacilitation);

      for (const boardId of BOARD_ORDER) {
        const unsubDraft = onSnapshot(
          retroDraftDoc(boardId, sprintKey),
          (snap) => {
            if (cancelled) return;
            setRetroDraftByBoard((prev) => ({
              ...prev,
              [boardId]: {
                ...prev[boardId],
                [sprintKey]: snap.exists()
                  ? (snap.data() as RetroDraft)
                  : null,
              },
            }));
            setRetroDraftLoadedByBoard((prev) => ({
              ...prev,
              [boardId]: { ...prev[boardId], [sprintKey]: true },
            }));
          },
        );
        unsubs.push(unsubDraft);
      }
    }

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [retroFacilitationSprintKeys, status]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (status !== "ready") return;

    const activeSprintKey = burndownSprint.activeSprintTuesdayIso;
    const activeBusinessDays = burndownSprint.businessDayIsos;

    const sessions = Object.values(retroBySprint).filter(
      (s): s is RetroSession => s != null,
    );

    for (const session of sessions) {
      if (session.archivedAt) continue;

      const businessDays = resolveRetroBusinessDayIsos(session, {
        activeSprintKey,
        activeSprintBusinessDayIsos: activeBusinessDays,
      });
      if (!shouldArchiveRetroSession(session, businessDays)) continue;

      const archiveKey = session.sprintKey;
      if (retroArchivingRef.current.has(archiveKey)) continue;
      retroArchivingRef.current.add(archiveKey);

      const facilitation = retroFacilitationBySprint[session.sprintKey];
      const now = new Date().toISOString();

      void patchRetroSession(null, session.sprintKey, {
        archivedAt: now,
        businessDayIsos: businessDays,
        archivedParticipants:
          facilitation?.participants?.length
            ? facilitation.participants
            : session.participants,
        updatedAt: now,
      })
        .then(() => pruneArchivedRetroSessions(null, MAX_ARCHIVED_RETRO_SESSIONS))
        .catch(console.error)
        .finally(() => {
          retroArchivingRef.current.delete(archiveKey);
        });
    }
  }, [
    burndownSprint.activeSprintTuesdayIso,
    burndownSprint.businessDayIsos,
    retroBySprint,
    retroFacilitationBySprint,
    status,
  ]);

  const getRetroSession = useCallback(
    (_boardId: BoardId, sprintKey: string) => {
      return retroBySprint[sprintKey] ?? null;
    },
    [retroBySprint],
  );

  const getRetroDraft = useCallback(
    (boardId: BoardId, sprintKey: string) => {
      return retroDraftByBoard[boardId]?.[sprintKey] ?? null;
    },
    [retroDraftByBoard],
  );

  const isRetroSessionLoaded = useCallback(
    (_boardId: BoardId, _sprintKey: string) => {
      return retroSessionsLoaded;
    },
    [retroSessionsLoaded],
  );

  const getArchivedRetroSessionsForBoard = useCallback(
    (_boardId: BoardId) => {
      const sessions = Object.values(retroBySprint).filter(
        (s): s is RetroSession => s != null && Boolean(s.archivedAt),
      );
      return sortArchivedRetroSessions(sessions);
    },
    [retroBySprint],
  );

  const isRetroDraftLoaded = useCallback(
    (boardId: BoardId, sprintKey: string) => {
      return retroDraftLoadedByBoard[boardId]?.[sprintKey] === true;
    },
    [retroDraftLoadedByBoard],
  );

  const getRetroFacilitation = useCallback(
    (sprintKey: string) => {
      return retroFacilitationBySprint[sprintKey] ?? null;
    },
    [retroFacilitationBySprint],
  );

  const isRetroFacilitationLoaded = useCallback(
    (sprintKey: string) => {
      return retroFacilitationLoadedBySprint[sprintKey] === true;
    },
    [retroFacilitationLoadedBySprint],
  );

  const updateRetroFacilitation = useCallback(
    async (sprintKey: string, patch: Partial<RetroFacilitation>) => {
      if (patch.participants) {
        writeCachedFacilitationParticipants(sprintKey, patch.participants);
      }

      setRetroFacilitationBySprint((prev) => {
        const current = prev[sprintKey];
        const now = patch.updatedAt ?? new Date().toISOString();
        const merged: RetroFacilitation = {
          sprintKey,
          participants: patch.participants ?? current?.participants ?? [],
          updatedAt: now,
          ...current,
          ...patch,
        };
        if (patch.happinessLocks) {
          merged.happinessLocks = {
            ...current?.happinessLocks,
            ...patch.happinessLocks,
          };
        }
        return { ...prev, [sprintKey]: merged };
      });

      await patchRetroFacilitation(sprintKey, patch);
    },
    [],
  );

  /** 直近更新の共通 facilitation 参加者（新スプリント初期表示の引き継ぎ用） */
  const getLatestRetroFacilitationParticipants = useCallback((): string[] => {
    let best: RetroFacilitation | null = null;
    for (const f of Object.values(retroFacilitationBySprint)) {
      if (!f?.participants?.length) continue;
      if (!best || (f.updatedAt ?? "").localeCompare(best.updatedAt ?? "") > 0) {
        best = f;
      }
    }
    return best?.participants ?? [];
  }, [retroFacilitationBySprint]);

  const createOrReplaceRetroSession = useCallback(
    async (session: RetroSession) => {
      const withFlag: RetroSession = {
        ...session,
        notesInSubcollections: true,
      };
      setRetroBySprint((prev) => ({ ...prev, [session.sprintKey]: withFlag }));
      setRetroSprintKeyList((prev) => {
        if (prev.includes(session.sprintKey)) return prev;
        return [...prev, session.sprintKey].sort();
      });
      await setRetroSession(stripEmbeddedNotesFromSessionPatch(withFlag) as RetroSession);
    },
    [],
  );

  const updateRetroSession = useCallback(
    async (
      _boardId: BoardId,
      sprintKey: string,
      patch: Partial<RetroSession>,
    ) => {
      const current = retroBySprintRef.current[sprintKey];
      const mergedForNotes: Partial<RetroSession> = {
        ...(current ?? { sprintKey }),
        ...patch,
        sprintKey,
      };

      setRetroBySprint((prev) =>
        mergeRetroSessionInState(prev, sprintKey, patch),
      );

      if (patchContainsEmbeddedNotes(patch)) {
        await replaceRetroNotesFromSessionData(sprintKey, mergedForNotes);
      }

      await patchRetroSession(
        null,
        sprintKey,
        stripEmbeddedNotesFromSessionPatch(patch),
      );
    },
    [],
  );

  /** FDL 付箋: サーバー最新とマージして保存（同時編集対応） */
  const mergeRetroFdlNotes = useCallback(
    async (
      sprintKey: string,
      merge: (serverNotes: RetroFdlNote[]) => RetroFdlNote[],
    ) => {
      const nextNotes = await patchRetroFdlNotesMerged(sprintKey, merge);
      const now = new Date().toISOString();
      setRetroBySprint((prev) => {
        const current = prev[sprintKey];
        const fdl = current?.fdl ?? defaultRetroFdlData();
        return mergeRetroSessionInState(prev, sprintKey, {
          fdl: { ...fdl, notes: nextNotes },
          updatedAt: now,
        });
      });
      return nextNotes;
    },
    [],
  );

  /** FDL 感謝付箋: サーバー最新とマージして保存（同時編集対応） */
  const mergeRetroFdlThankYouNotes = useCallback(
    async (
      sprintKey: string,
      merge: (serverNotes: RetroThankYouNote[]) => RetroThankYouNote[],
    ) => {
      const nextNotes = await patchRetroFdlThankYouNotesMerged(sprintKey, merge);
      const now = new Date().toISOString();
      setRetroBySprint((prev) => {
        const current = prev[sprintKey];
        const fdl = current?.fdl ?? defaultRetroFdlData();
        return mergeRetroSessionInState(prev, sprintKey, {
          fdl: { ...fdl, thankYouNotes: nextNotes },
          updatedAt: now,
        });
      });
      return nextNotes;
    },
    [],
  );

  /** 幸福指標付箋: サーバー最新とマージして保存（同時編集対応） */
  const mergeRetroHappinessNotes = useCallback(
    async (
      sprintKey: string,
      field: "reasons" | "improvements",
      merge: (serverNotes: RetroHappinessNote[]) => RetroHappinessNote[],
    ) => {
      const nextNotes = await patchRetroHappinessNotesMerged(
        sprintKey,
        field,
        merge,
      );
      const now = new Date().toISOString();
      setRetroBySprint((prev) => {
        const current = prev[sprintKey];
        const happiness = current?.happiness ?? {
          scoresByParticipant: {},
          reasons: [],
          improvements: [],
        };
        return mergeRetroSessionInState(prev, sprintKey, {
          happiness: { ...happiness, [field]: nextNotes },
          updatedAt: now,
        });
      });
      return nextNotes;
    },
    [],
  );

  /** 幸福指標付箋: 1件だけ部分更新（テキスト・サイズ向け） */
  const patchRetroHappinessNote = useCallback(
    async (
      sprintKey: string,
      field: "reasons" | "improvements",
      noteId: string,
      patch: Partial<Omit<RetroHappinessNote, "id">>,
    ) => {
      await patchRetroHappinessNoteDoc(sprintKey, field, noteId, patch);
      const now = new Date().toISOString();
      setRetroBySprint((prev) => {
        const current = prev[sprintKey];
        if (!current) return prev;
        const happiness = current.happiness ?? defaultRetroHappinessData();
        const list = happiness[field] ?? [];
        const nextList = patchNoteInList(list, noteId, patch);
        if (nextList === list) return prev;
        return mergeRetroSessionInState(prev, sprintKey, {
          happiness: { ...happiness, [field]: nextList },
          updatedAt: now,
        });
      });
    },
    [],
  );

  const updateRetroDraft = useCallback(
    async (boardId: BoardId, sprintKey: string, patch: Partial<RetroDraft>) => {
      await patchRetroDraft(boardId, sprintKey, patch);
    },
    [],
  );

  const deleteRetroSession = useCallback(
    async (_boardId: BoardId, sprintKey: string) => {
      setRetroBySprint((prev) => {
        const next = { ...prev };
        delete next[sprintKey];
        return next;
      });
      setRetroSprintKeyList((prev) => prev.filter((key) => key !== sprintKey));
      await deleteRetroSessionDoc(null, sprintKey);
    },
    [],
  );

  const safeSwitchRetroFramework = useCallback(
    async (args: {
      boardId: BoardId;
      sprintKey: string;
      nextFramework: RetroFramework;
      nextData: Pick<RetroSession, "fdl" | "happiness">;
      nextParticipants?: string[];
    }) => {
      const current = retroBySprint[args.sprintKey];
      if (!current) return;
      const nowIso = new Date().toISOString();
      const previous: RetroSession["previous"] = {
        framework: current.framework,
        participants: current.participants,
        facilitatorIndex: current.facilitatorIndex,
        fdl: current.fdl,
        happiness: current.happiness,
        savedAt: nowIso,
      };
      const patch = {
        framework: args.nextFramework,
        participants: args.nextParticipants ?? current.participants,
        facilitatorIndex: 0,
        fdl: args.nextData.fdl,
        happiness: args.nextData.happiness,
        previous,
        updatedAt: nowIso,
      };
      setRetroBySprint((prev) =>
        mergeRetroSessionInState(prev, args.sprintKey, patch),
      );
      await patchRetroSession(null, args.sprintKey, stripEmbeddedNotesFromSessionPatch(patch));
    },
    [retroBySprint],
  );

  const setAssigneeColorForName = useCallback(
    (assigneeName: string, colorId: AssigneeColorId) => {
      setAssigneeColorByName((prev) => ({
        ...prev,
        [assigneeName]: colorId,
      }));
      void setAssigneeColor(assigneeName, colorId).catch(console.error);
    },
    [],
  );

  const assigneeCandidates = useMemo(() => {
    return assigneeDirectory.map((x) => x.name);
  }, [assigneeDirectory]);

  const goalTextCandidates = useMemo(() => {
    return goalTextDirectory
      .map((x) => x.text.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ja-JP"));
  }, [goalTextDirectory]);

  const getTodoDoingAssignees = useCallback(
    (boardId: BoardId): string[] => {
      const names = new Set<string>();
      for (const t of tasks) {
        if (t.boardId !== boardId) continue;
        if (t.lane !== "todo" && t.lane !== "doing") continue;
        for (const a of t.assignees ?? []) {
          const name = a.trim();
          if (name) names.add(name);
        }
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b, "ja-JP"));
    },
    [tasks],
  );

  const directoryColorByName = useMemo(() => {
    const map: Record<string, AssigneeColorId> = {};
    for (const m of assigneeDirectory) {
      map[m.name] = m.colorId;
    }
    return map;
  }, [assigneeDirectory]);

  const addAssigneeCandidate = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      const colorId = directoryColorByName[n] ?? getFallbackAssigneeColorId(n);
      void upsertAssigneeDirectoryEntry(n, colorId).catch(console.error);
    },
    [directoryColorByName],
  );

  const addGoalTextCandidate = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    void upsertGoalTextDirectoryEntry(t).catch(console.error);
  }, []);

  const deleteGoalTextCandidate = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    void deleteGoalTextDirectoryEntry(t).catch(console.error);
  }, []);

  const persistTaskTemplateSet = useCallback((set: TaskTemplateSet) => {
    void setTaskTemplateSet({
      ...set,
      items: sortTemplateItems(set.items),
      updatedAt: new Date().toISOString(),
    }).catch(console.error);
  }, []);

  const addTaskTemplateSetEntry = useCallback(
    (name: string): string | undefined => {
      const n = name.trim();
      if (!n) return undefined;
      const now = new Date().toISOString();
      const nextSortOrder =
        taskTemplateSets.length > 0
          ? Math.max(...taskTemplateSets.map((x) => x.sortOrder ?? 0)) + 1
          : 0;
      const set: TaskTemplateSet = {
        id: createId("set"),
        name: n,
        sortOrder: nextSortOrder,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
      setTaskTemplateSets((prev) => {
        const next = [...prev, set];
        next.sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.name.localeCompare(b.name, "ja-JP");
        });
        return next;
      });
      void setTaskTemplateSet(set).catch(console.error);
      return set.id;
    },
    [taskTemplateSets],
  );

  const removeTaskTemplateSetEntry = useCallback((setId: string) => {
    const id = setId.trim();
    if (!id) return;
    void deleteTaskTemplateSetDoc(id).catch(console.error);
  }, []);

  const addItemToTaskTemplateSet = useCallback(
    (setId: string, title: string) => {
      const t = title.trim();
      if (!t) return;
      setTaskTemplateSets((prev) => {
        const set = prev.find((s) => s.id === setId);
        if (!set) return prev;
        const nextItemOrder =
          set.items.length > 0
            ? Math.max(...set.items.map((x) => x.sortOrder ?? 0)) + 1
            : 0;
        const now = new Date().toISOString();
        const next: TaskTemplateSet = {
          ...set,
          items: sortTemplateItems([
            ...set.items,
            { id: createId("titem"), title: t, sortOrder: nextItemOrder },
          ]),
          updatedAt: now,
        };
        void setTaskTemplateSet(next).catch(console.error);
        return prev.map((s) => (s.id === setId ? next : s));
      });
    },
    [],
  );

  const removeItemFromTaskTemplateSet = useCallback(
    (setId: string, itemId: string) => {
      const set = taskTemplateSets.find((s) => s.id === setId);
      if (!set) return;
      const nextItems = set.items.filter((i) => i.id !== itemId);
      if (nextItems.length === set.items.length) return;
      const now = new Date().toISOString();
      void setTaskTemplateSet({
        ...set,
        items: sortTemplateItems(
          nextItems.map((item, index) => ({ ...item, sortOrder: index })),
        ),
        updatedAt: now,
      }).catch(console.error);
    },
    [taskTemplateSets],
  );

  const renameTaskTemplateSet = useCallback(
    (setId: string, name: string) => {
      const n = name.trim();
      if (!n) return;
      const set = taskTemplateSets.find((s) => s.id === setId);
      if (!set || set.name === n) return;
      persistTaskTemplateSet({ ...set, name: n });
    },
    [taskTemplateSets, persistTaskTemplateSet],
  );

  const reorderItemsInTaskTemplateSet = useCallback(
    (setId: string, orderedItemIds: string[]) => {
      const set = taskTemplateSets.find((s) => s.id === setId);
      if (!set) return;
      const idList = orderedItemIds.map((x) => x.trim()).filter(Boolean);
      if (idList.length <= 1) return;
      const map = new Map(set.items.map((i) => [i.id, i]));
      const reordered = idList
        .map((id) => map.get(id))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (reordered.length <= 1) return;
      const rest = set.items.filter((i) => !new Set(idList).has(i.id));
      const merged = [...reordered, ...rest];
      persistTaskTemplateSet({
        ...set,
        items: merged.map((item, index) => ({ ...item, sortOrder: index })),
      });
    },
    [taskTemplateSets, persistTaskTemplateSet],
  );

  const deleteAssigneeCandidate = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      // ディレクトリから削除
      void deleteAssigneeDirectoryEntry(n).catch(console.error);
      // 既存データからも担当を外す
      setTasks((prev) => {
        prev.forEach((t) => {
          if ((t.assignees ?? []).includes(n)) {
            void patchTask(t.boardId, t.id, {
              assignees: (t.assignees ?? []).filter((a) => a !== n),
            }).catch(console.error);
          }
        });
        return prev.map((t) =>
          (t.assignees ?? []).includes(n)
            ? { ...t, assignees: (t.assignees ?? []).filter((a) => a !== n) }
            : t,
        );
      });
      setProductBacklogByBoard((prev) => {
        const next = { ...prev };
        for (const boardId of Object.keys(next) as BoardId[]) {
          next[boardId] = next[boardId].map((item) => {
            if (!(item.assignees ?? []).includes(n)) return item;
            const assignees = (item.assignees ?? []).filter((a) => a !== n);
            void patchProductBacklogItem(boardId, item.id, { assignees }).catch(
              console.error,
            );
            return { ...item, assignees };
          });
        }
        return next;
      });
    },
    [],
  );

  const renameAssigneeCandidate = useCallback(
    (fromName: string, toName: string) => {
      const from = fromName.trim();
      const to = toName.trim();
      if (!from || !to || from === to) return;

      const colorId = directoryColorByName[from] ?? getFallbackAssigneeColorId(to);
      void upsertAssigneeDirectoryEntry(to, colorId).catch(console.error);
      void deleteAssigneeDirectoryEntry(from).catch(console.error);

      // 既存データ内の担当名も置換
      setTasks((prev) => {
        prev.forEach((t) => {
          if ((t.assignees ?? []).includes(from)) {
            const assignees = (t.assignees ?? []).map((a) => (a === from ? to : a));
            void patchTask(t.boardId, t.id, { assignees }).catch(console.error);
          }
        });
        return prev.map((t) =>
          (t.assignees ?? []).includes(from)
            ? {
                ...t,
                assignees: (t.assignees ?? []).map((a) => (a === from ? to : a)),
              }
            : t,
        );
      });

      setProductBacklogByBoard((prev) => {
        const next = { ...prev };
        for (const boardId of Object.keys(next) as BoardId[]) {
          next[boardId] = next[boardId].map((item) => {
            if (!(item.assignees ?? []).includes(from)) return item;
            const assignees = (item.assignees ?? []).map((a) => (a === from ? to : a));
            void patchProductBacklogItem(boardId, item.id, { assignees }).catch(
              console.error,
            );
            return { ...item, assignees };
          });
        }
        return next;
      });
    },
    [directoryColorByName],
  );

  const setAssigneeDirectoryColor = useCallback(
    (name: string, colorId: AssigneeColorId) => {
      const n = name.trim();
      if (!n) return;
      void upsertAssigneeDirectoryEntry(n, colorId).catch(console.error);
      // 既存の assignees_colors 互換も更新（古いクライアントが参照しても崩れないように）
      void setAssigneeColor(n, colorId).catch(console.error);
    },
    [],
  );

  const persistBurndownSnapshot = useCallback(
    (boardId: BoardId, dayIso: string, wip: number) => {
      pendingWipRef.current = { boardId, dayIso, wip };
      if (wipDebounceRef.current) clearTimeout(wipDebounceRef.current);
      wipDebounceRef.current = setTimeout(() => {
        const pending = pendingWipRef.current;
        if (!pending) return;
        void setBurndownSnapshot(
          pending.boardId,
          pending.dayIso,
          pending.wip,
        ).catch(console.error);
      }, BURNDOWN_SNAPSHOT_DEBOUNCE_MS);
    },
    [],
  );

  const updateTask = useCallback((taskId: string, patch: TaskPatch) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (!task) return prev;
      const nextPatch: TaskPatch = { ...patch };
      if (
        patch.lane === "done" ||
        patch.lane === "todo" ||
        patch.lane === "cant"
      ) {
        nextPatch.progressPercent = null;
      }
      void patchTask(task.boardId, taskId, nextPatch).catch(console.error);
      return updateTaskInList(prev, taskId, nextPatch);
    });
  }, []);

  const addTask = useCallback(
    (boardId: BoardId, parentIssueId: string, lane: TaskLane) => {
      // 同一操作の二重発火（ダブルクリック/イベント重複/購読競合）で
      // Firestore に2件作成されるのを防ぐためのガード
      const key = `${boardId}:${parentIssueId}:${lane}`;
      const now = Date.now();
      const last = lastAddTaskAtRef.current[key] ?? 0;
      // 直近の呼び出しから短時間なら「同じIDで上書き」して二重作成を防ぐ
      if (now - last < 1200) {
        const existingId = pendingAddTaskIdRef.current[key];
        if (existingId) {
          const task = {
            ...createTask(boardId, parentIssueId, lane, tasksRef.current),
            id: existingId,
          };
          void setTask(task).catch(console.error);
          return;
        }
      }
      lastAddTaskAtRef.current[key] = now;

      const forcedId = createId("task");
      pendingAddTaskIdRef.current[key] = forcedId;
      const task = {
        ...createTask(boardId, parentIssueId, lane, tasksRef.current),
        id: forcedId,
      };
      void setTask(task).catch(console.error);
    },
    [],
  );

  const addTasksFromTemplateSet = useCallback(
    (
      boardId: BoardId,
      parentIssueId: string,
      lane: TaskLane,
      setId: string,
    ) => {
      const id = setId.trim();
      if (!id) return;

      const set = taskTemplateSets.find((s) => s.id === id);
      if (!set || set.items.length === 0) return;

      const items = sortTemplateItems(set.items);
      let tasksForOrder = tasksRef.current;
      for (const item of items) {
        const task: Task = {
          ...createTask(boardId, parentIssueId, lane, tasksForOrder),
          id: createId("task"),
          title: item.title,
        };
        tasksForOrder = [...tasksForOrder, task];
        void setTask(task).catch(console.error);
      }
    },
    [taskTemplateSets],
  );

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (task) void deleteTaskRecord(task.boardId, taskId).catch(console.error);
      return deleteTaskInList(prev, taskId);
    });
  }, []);

  const duplicateTask = useCallback((sourceTaskId: string) => {
    const source = tasksRef.current.find((t) => t.id === sourceTaskId);
    if (!source) return;

    const now = Date.now();
    const last = lastDuplicateTaskAtRef.current[sourceTaskId] ?? 0;
    if (now - last < 1200) return;
    lastDuplicateTaskAtRef.current[sourceTaskId] = now;

    const task = cloneTask(source, tasksRef.current);
    void setTask(task).catch(console.error);
  }, []);

  const beginTaskDrag = useCallback(() => {
    taskDragSnapshotRef.current = tasksRef.current.map((t) => ({ ...t }));
  }, []);

  const repositionTaskDuringDrag = useCallback(
    (activeTaskId: string, overId: string) => {
      setTasks((prev) => repositionTaskInList(prev, activeTaskId, overId));
    },
    [],
  );

  const repositionTasksDuringDrag = useCallback(
    (activeTaskIds: string[], overId: string) => {
      setTasks((prev) => repositionTasksInList(prev, activeTaskIds, overId));
    },
    [],
  );

  const finalizeTaskReposition = useCallback(
    (activeTaskId: string, overId: string) => {
      const snapshot = taskDragSnapshotRef.current;
      taskDragSnapshotRef.current = null;

      setTasks((prev) => {
        const next = repositionTaskInList(prev, activeTaskId, overId);
        if (snapshot) {
          for (const t of next) {
            const before = snapshot.find((s) => s.id === t.id);
            if (
              !before ||
              before.lane !== t.lane ||
              before.parentIssueId !== t.parentIssueId ||
              before.sortOrder !== t.sortOrder
            ) {
              void setTask(t).catch(console.error);
            }
          }
        }
        return next;
      });
    },
    [],
  );

  const finalizeTasksReposition = useCallback(
    (activeTaskIds: string[], overId: string) => {
      const snapshot = taskDragSnapshotRef.current;
      taskDragSnapshotRef.current = null;

      setTasks((prev) => {
        const next = repositionTasksInList(prev, activeTaskIds, overId);
        if (snapshot) {
          for (const t of next) {
            const before = snapshot.find((s) => s.id === t.id);
            if (
              !before ||
              before.lane !== t.lane ||
              before.parentIssueId !== t.parentIssueId ||
              before.sortOrder !== t.sortOrder
            ) {
              void setTask(t).catch(console.error);
            }
          }
        }
        return next;
      });
    },
    [],
  );

  const cancelTaskDrag = useCallback(() => {
    const snapshot = taskDragSnapshotRef.current;
    taskDragSnapshotRef.current = null;
    if (snapshot) setTasks(snapshot);
  }, []);

  const addProductBacklog = useCallback((boardId: BoardId) => {
    const key = `${boardId}`;
    const now = Date.now();
    const last = lastAddBacklogAtRef.current[key] ?? 0;

    // React StrictMode(dev) では state updater が複数回評価され得るため、
    // 副作用（Firestore書き込み）を updater 内で実行しない。
    // 追加は Firestore のみ行い、表示は onSnapshot に任せる。
    const items = productBacklogByBoardRef.current[boardId] ?? [];
    const sortOrder = items.length;

    // 二重発火でも2件作らないよう、短時間は同じIDで上書きする
    if (now - last < 1200) {
      const existingId = pendingAddBacklogIdRef.current[key];
      if (existingId) {
        const item = { ...createProductBacklogItem(boardId), id: existingId };
        void setProductBacklogItem(boardId, item, sortOrder).catch(console.error);
        return;
      }
    }

    lastAddBacklogAtRef.current[key] = now;
    const forcedId = createId("pb");
    pendingAddBacklogIdRef.current[key] = forcedId;
    const item = { ...createProductBacklogItem(boardId), id: forcedId };
    void setProductBacklogItem(boardId, item, sortOrder).catch(console.error);
  }, []);

  const updateProductBacklog = useCallback(
    (boardId: BoardId, itemId: string, patch: Partial<ProductBacklogItem>) => {
      setProductBacklogByBoard((prev) => ({
        ...prev,
        [boardId]: updateProductBacklogInBoard(prev[boardId], itemId, patch),
      }));
      void patchProductBacklogItem(boardId, itemId, patch).catch(console.error);
    },
    [],
  );

  const duplicateSwimlane = useCallback((boardId: BoardId, itemId: string) => {
    const now = Date.now();
    const last = lastDuplicateSwimlaneAtRef.current[itemId] ?? 0;
    if (now - last < 1200) return;
    lastDuplicateSwimlaneAtRef.current[itemId] = now;

    const items = productBacklogByBoardRef.current[boardId] ?? [];
    const sourceIndex = items.findIndex((i) => i.id === itemId);
    if (sourceIndex === -1) return;

    const source = items[sourceIndex];
    const newItem = cloneProductBacklogItem(source);
    const childTasks = tasksRef.current.filter(
      (t) => t.parentIssueId === itemId && t.boardId === boardId,
    );
    let tasksForSort = tasksRef.current;
    const clonedTasks = childTasks.map((t) => {
      const cloned = cloneTask(t, tasksForSort, { parentIssueId: newItem.id });
      tasksForSort = [...tasksForSort, cloned];
      return cloned;
    });

    const newItems = [
      ...items.slice(0, sourceIndex + 1),
      newItem,
      ...items.slice(sourceIndex + 1),
    ];

    void (async () => {
      await setProductBacklogItem(boardId, newItem, sourceIndex + 1);
      for (const task of clonedTasks) {
        await setTask(task);
      }
      await reorderProductBacklogFirestore(boardId, newItems);
    })().catch(console.error);
  }, []);

  const removeSwimlane = useCallback((boardId: BoardId, itemId: string) => {
    setProductBacklogByBoard((prev) => ({
      ...prev,
      [boardId]: deleteProductBacklogInBoard(prev[boardId], itemId),
    }));
    setTasks((prev) => deleteTasksByParentIssueId(prev, itemId));
    void deleteProductBacklogItem(boardId, itemId).catch(console.error);
  }, []);

  const reorderBacklog = useCallback(
    (boardId: BoardId, activeItemId: string, overItemId: string) => {
      setProductBacklogByBoard((prev) => {
        const reordered = reorderProductBacklog(
          prev[boardId],
          activeItemId,
          overItemId,
        );
        void reorderProductBacklogFirestore(boardId, reordered).catch(
          console.error,
        );
        return { ...prev, [boardId]: reordered };
      });
    },
    [],
  );

  const updateSchedule = useCallback(
    (boardId: BoardId, day: WeekdayKey, name: string) => {
      setSchedulesByBoard((prev) => {
        const nextSchedule = updateScheduleDay(prev[boardId], day, name);
        void patchScheduleDay(boardId, day, name).catch(console.error);
        return { ...prev, [boardId]: nextSchedule };
      });
    },
    [],
  );

  const updateSprintGoal = useCallback((boardId: BoardId, goal: string) => {
    setSprintGoalsByBoard((prev) => {
      const trimmed = goal.trim();
      void patchSprintGoal(boardId, trimmed).catch(console.error);
      return { ...prev, [boardId]: trimmed };
    });
  }, []);

  const saveBurndownSprintState = useCallback((state: BurndownSprintState) => {
    setBurndownSprint(state);
    void persistBurndownSprintDoc(state).catch(console.error);
  }, []);

  const migrateRetroSprintPeriod = useCallback(
    async (fromSprintKey: string, toSprintKey: string) => {
      await migrateRetroSprintKey(fromSprintKey, toSprintKey);
      const businessDayIsos = buildDefaultBusinessDayIsos(toSprintKey);
      const now = new Date().toISOString();
      setRetroBySprint((prev) => {
        const next = { ...prev };
        const session = prev[fromSprintKey];
        if (session) {
          next[toSprintKey] = {
            ...session,
            sprintKey: toSprintKey,
            businessDayIsos,
            updatedAt: now,
          };
        }
        delete next[fromSprintKey];
        return next;
      });
      setRetroFacilitationBySprint((prev) => {
        const next = { ...prev };
        const fac = prev[fromSprintKey];
        if (fac) {
          next[toSprintKey] = {
            ...fac,
            sprintKey: toSprintKey,
            updatedAt: now,
          };
        }
        delete next[fromSprintKey];
        return next;
      });
      setBurndownSprint((prev) => {
        const next = {
          ...prev,
          retroActiveSprintKey: toSprintKey,
        };
        void persistBurndownSprintDoc(next).catch(console.error);
        return next;
      });
    },
    [],
  );

  const saveReleaseBurnup = useCallback(
    (boardId: BoardId, state: ReleaseBurnupByBoard[BoardId]) => {
      setReleaseBurnupByBoard((prev) => ({
        ...prev,
        [boardId]: state,
      }));
      void saveReleaseBurnupBoardState(boardId, state).catch(console.error);
    },
    [],
  );

  return {
    status,
    errorMessage,
    tasks,
    productBacklogByBoard,
    schedulesByBoard,
    sprintGoalsByBoard,
    burndownSnapshotsByBoard,
    releaseBurnupByBoard,
    burndownSprint,
    retroBySprint,
    getRetroSession,
    getArchivedRetroSessionsForBoard,
    getRetroDraft,
    getRetroFacilitation,
    getLatestRetroFacilitationParticipants,
    isRetroSessionLoaded,
    isRetroDraftLoaded,
    isRetroFacilitationLoaded,
    createOrReplaceRetroSession,
    updateRetroSession,
    mergeRetroFdlNotes,
    mergeRetroFdlThankYouNotes,
    mergeRetroHappinessNotes,
    patchRetroHappinessNote,
    updateRetroDraft,
    updateRetroFacilitation,
    deleteRetroSession,
    safeSwitchRetroFramework,
    assigneeCandidates,
    goalTextCandidates,
    taskTemplateSets,
    getTodoDoingAssignees,
    assigneeColorByName: directoryColorByName,
    setAssigneeColorForName: setAssigneeDirectoryColor,
    addAssigneeCandidate,
    deleteAssigneeCandidate,
    renameAssigneeCandidate,
    addGoalTextCandidate,
    deleteGoalTextCandidate,
    addTaskTemplateSetEntry,
    removeTaskTemplateSetEntry,
    addItemToTaskTemplateSet,
    removeItemFromTaskTemplateSet,
    reorderItemsInTaskTemplateSet,
    renameTaskTemplateSet,
    persistBurndownSnapshot,
    updateTask,
    addTask,
    addTasksFromTemplateSet,
    duplicateTask,
    removeTask,
    beginTaskDrag,
    repositionTaskDuringDrag,
    repositionTasksDuringDrag,
    finalizeTaskReposition,
    finalizeTasksReposition,
    cancelTaskDrag,
    addProductBacklog,
    updateProductBacklog,
    duplicateSwimlane,
    removeSwimlane,
    reorderBacklog,
    updateSchedule,
    updateSprintGoal,
    saveBurndownSprintState,
    saveReleaseBurnup,
    migrateRetroSprintPeriod,
  };
}
