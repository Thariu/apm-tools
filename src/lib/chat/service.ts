import { getJstIsoDate } from "@/lib/jstDate";
import type { BoardId } from "@/lib/types";
import {
  addNewBacklogWithTask,
  addTaskToExistingBacklog,
  applyTaskProgress,
  parseBacklogOptionValue,
} from "./boardOps";
import { buildProgressCard, asUpdateMessage, textOnlyMessage } from "./cards";
import type { ChatSlot } from "./config";
import { resolveAssigneeName } from "./config";
import {
  collectDailyTasks,
  incompleteDailyTasks,
} from "./dailyTasks";
import type { ChatEvent } from "./events";
import {
  detectSlotFromText,
  getActionName,
  getActionParams,
  getEventUser,
  getFormText,
  isDailyTaskTrigger,
} from "./events";
import { flattenBacklogOptions, loadBoardSnapshot } from "./snapshot";

async function buildCardForAssignee(params: {
  assigneeName: string;
  slot: ChatSlot;
  dateIso?: string;
  notice?: string;
  incompleteOnly?: boolean;
}) {
  const dateIso = params.dateIso ?? getJstIsoDate();
  const { tasksByBoard, backlogByBoard, boardLabels } = await loadBoardSnapshot();
  let tasks = collectDailyTasks({
    tasksByBoard,
    backlogByBoard,
    assigneeName: params.assigneeName,
    dateIso,
  });
  if (params.incompleteOnly || params.slot === "midday") {
    tasks = incompleteDailyTasks(tasks);
  }
  return buildProgressCard({
    slot: params.slot,
    assigneeName: params.assigneeName,
    dateIso,
    tasks,
    backlogOptions: flattenBacklogOptions(backlogByBoard),
    boardLabels,
    notice: params.notice,
  });
}

export async function handleChatEvent(
  event: ChatEvent,
): Promise<Record<string, unknown>> {
  const type = event.type ?? "MESSAGE";

  if (type === "ADDED_TO_SPACE") {
    return textOnlyMessage(
      "プランニング進捗ボットです。DM で「今日のタスク」と送ると当日カードを表示します。",
    );
  }

  if (type === "REMOVED_FROM_SPACE") {
    return {};
  }

  if (type === "CARD_CLICKED") {
    return handleCardClicked(event);
  }

  // MESSAGE / コマンド / その他 → カード表示
  const user = getEventUser(event);
  const email = user?.email;
  const assigneeName = resolveAssigneeName(email);
  if (!assigneeName) {
    return textOnlyMessage(
      email
        ? `CHAT_MEMBER_MAP に ${email} の担当者名が未登録です。`
        : "ユーザーのメールアドレスを取得できませんでした。",
    );
  }

  const text =
    event.message?.argumentText?.trim() ||
    event.message?.text?.trim() ||
    "";

  if (text && !isDailyTaskTrigger(text) && !event.appCommandMetadata) {
    return textOnlyMessage(
      "「今日のタスク」と送ると当日の進捗カードを表示します。",
    );
  }

  const slot = detectSlotFromText(text || "朝");
  return buildCardForAssignee({ assigneeName, slot });
}

async function handleCardClicked(
  event: ChatEvent,
): Promise<Record<string, unknown>> {
  const user = getEventUser(event);
  const email = user?.email;
  const assigneeName = resolveAssigneeName(email);
  if (!assigneeName) {
    return asUpdateMessage(
      textOnlyMessage(
        email
          ? `CHAT_MEMBER_MAP に ${email} の担当者名が未登録です。`
          : "ユーザーを解決できませんでした。",
      ),
    );
  }

  const action = getActionName(event);
  const params = getActionParams(event);
  const slot = (params.slot as ChatSlot | undefined) ?? "evening";

  try {
    if (action === "setProgress") {
      const boardId = params.boardId as BoardId;
      const result = await applyTaskProgress({
        boardId,
        taskId: params.taskId,
        progressRaw: params.progress,
      });
      if (!result.ok) return asUpdateMessage(textOnlyMessage(result.error));
      return asUpdateMessage(
        await buildCardForAssignee({
          assigneeName,
          slot,
          notice: `更新しました: ${params.progress}% → ${result.lane}`,
          incompleteOnly: slot === "midday",
        }),
      );
    }

    if (action === "submitMtg") {
      return asUpdateMessage(
        textOnlyMessage(
          "MTG は追加タスク（既存 / 新規 Backlog）から申告してください。",
        ),
      );
    }

    if (action === "submitAddExisting") {
      const option = getFormText(event, "existing_backlog");
      const title = getFormText(event, "existing_task_title");
      const parsed = parseBacklogOptionValue(option);
      if (!parsed) {
        return asUpdateMessage(
          textOnlyMessage("Backlog を選択してください。"),
        );
      }
      const result = await addTaskToExistingBacklog({
        boardId: parsed.boardId,
        parentIssueId: parsed.parentIssueId,
        title,
        assigneeName,
      });
      if ("error" in result) {
        return asUpdateMessage(textOnlyMessage(result.error));
      }
      return asUpdateMessage(
        await buildCardForAssignee({
          assigneeName,
          slot: "evening",
          notice: `タスクを追加しました: ${result.task.title}`,
        }),
      );
    }

    if (action === "submitAddNew") {
      const backlogTitle = getFormText(event, "new_backlog_title");
      const taskTitle = getFormText(event, "new_task_title");
      const result = await addNewBacklogWithTask({
        boardId: "ad_hoc",
        backlogTitle,
        taskTitle,
        assigneeName,
      });
      if ("error" in result) {
        return asUpdateMessage(textOnlyMessage(result.error));
      }
      return asUpdateMessage(
        await buildCardForAssignee({
          assigneeName,
          slot: "evening",
          notice: `新規 Backlog とタスクを追加しました: ${result.task.title}`,
        }),
      );
    }

    if (action === "refreshCard") {
      return asUpdateMessage(
        await buildCardForAssignee({
          assigneeName,
          slot,
          incompleteOnly: slot === "midday",
        }),
      );
    }

    return asUpdateMessage(
      textOnlyMessage(`未対応のアクションです: ${action || "(なし)"}`),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return asUpdateMessage(textOnlyMessage(`処理に失敗しました: ${message}`));
  }
}

export async function buildDispatchCard(params: {
  assigneeName: string;
  slot: ChatSlot;
}): Promise<{
  message: Record<string, unknown>;
  taskCount: number;
  skipped: boolean;
}> {
  const dateIso = getJstIsoDate();
  const { tasksByBoard, backlogByBoard, boardLabels } = await loadBoardSnapshot();
  let tasks = collectDailyTasks({
    tasksByBoard,
    backlogByBoard,
    assigneeName: params.assigneeName,
    dateIso,
  });

  if (params.slot === "midday") {
    tasks = incompleteDailyTasks(tasks);
    if (tasks.length === 0) {
      return { message: {}, taskCount: 0, skipped: true };
    }
  }

  const message = buildProgressCard({
    slot: params.slot,
    assigneeName: params.assigneeName,
    dateIso,
    tasks,
    backlogOptions: flattenBacklogOptions(backlogByBoard),
    boardLabels,
  });

  return { message, taskCount: tasks.length, skipped: false };
}
