import {
  chatSecretMissingResponse,
  unauthorizedChatResponse,
  verifyChatSyncSecret,
} from "@/lib/chat/auth";
import { getChatSyncSecret, resolveAssigneeName } from "@/lib/chat/config";
import {
  collectDailyTasks,
  incompleteDailyTasks,
} from "@/lib/chat/dailyTasks";
import { getJstIsoDate } from "@/lib/jstDate";
import { loadBoardSnapshot } from "@/lib/chat/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!getChatSyncSecret()) {
    return chatSecretMissingResponse();
  }
  if (!verifyChatSyncSecret(request)) {
    return unauthorizedChatResponse();
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim() ?? "";
  const assigneeParam = url.searchParams.get("assignee")?.trim() ?? "";
  const dateIso = url.searchParams.get("date")?.trim() || getJstIsoDate();
  const incompleteOnly = url.searchParams.get("incomplete") === "1";

  const assigneeName =
    assigneeParam || resolveAssigneeName(email) || "";
  if (!assigneeName) {
    return Response.json(
      { error: "assignee or mapped email is required" },
      { status: 400 },
    );
  }

  const { tasksByBoard, backlogByBoard } = await loadBoardSnapshot();
  let tasks = collectDailyTasks({
    tasksByBoard,
    backlogByBoard,
    assigneeName,
    dateIso,
  });
  if (incompleteOnly) tasks = incompleteDailyTasks(tasks);

  return Response.json({
    ok: true,
    assigneeName,
    dateIso,
    count: tasks.length,
    tasks: tasks.map((v) => ({
      boardId: v.boardId,
      taskId: v.task.id,
      title: v.task.title,
      lane: v.task.lane,
      backlogTitle: v.backlogTitle,
      startDate: v.task.startDate,
      dueDate: v.task.dueDate,
      assignees: v.task.assignees,
    })),
  });
}
