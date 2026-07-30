import {
  chatSecretMissingResponse,
  unauthorizedChatResponse,
  verifyChatSyncSecret,
} from "@/lib/chat/auth";
import { getChatSyncSecret } from "@/lib/chat/config";
import {
  addMtgTask,
  addNewBacklogWithTask,
  addTaskToExistingBacklog,
  applyTaskProgress,
} from "@/lib/chat/boardOps";
import type { BoardId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody =
  | {
      action: "setProgress";
      boardId: BoardId;
      taskId: string;
      progress: string;
    }
  | {
      action: "addExisting";
      boardId: BoardId;
      parentIssueId: string;
      title: string;
      assigneeName: string;
    }
  | {
      action: "addNew";
      backlogTitle: string;
      taskTitle: string;
      assigneeName: string;
      boardId?: BoardId;
    }
  | {
      action: "addMtg";
      title: string;
      assigneeName: string;
    };

export async function POST(request: Request) {
  if (!getChatSyncSecret()) {
    return chatSecretMissingResponse();
  }
  if (!verifyChatSyncSecret(request)) {
    return unauthorizedChatResponse();
  }

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "setProgress": {
        const result = await applyTaskProgress({
          boardId: body.boardId,
          taskId: body.taskId,
          progressRaw: body.progress,
        });
        if (!result.ok) {
          return Response.json({ error: result.error }, { status: 400 });
        }
        return Response.json({
          ok: true,
          lane: result.lane,
          progress: result.progress,
        });
      }
      case "addExisting": {
        const result = await addTaskToExistingBacklog({
          boardId: body.boardId,
          parentIssueId: body.parentIssueId,
          title: body.title,
          assigneeName: body.assigneeName,
        });
        if ("error" in result) {
          return Response.json({ error: result.error }, { status: 400 });
        }
        return Response.json({ ok: true, task: result.task });
      }
      case "addNew": {
        const result = await addNewBacklogWithTask({
          boardId: body.boardId ?? "ad_hoc",
          backlogTitle: body.backlogTitle,
          taskTitle: body.taskTitle,
          assigneeName: body.assigneeName,
        });
        if ("error" in result) {
          return Response.json({ error: result.error }, { status: 400 });
        }
        return Response.json({
          ok: true,
          backlog: result.backlog,
          task: result.task,
        });
      }
      case "addMtg": {
        const result = await addMtgTask({
          title: body.title,
          assigneeName: body.assigneeName,
        });
        if ("error" in result) {
          return Response.json({ error: result.error }, { status: 400 });
        }
        return Response.json({
          ok: true,
          backlog: result.backlog,
          task: result.task,
        });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: detail }, { status: 500 });
  }
}
