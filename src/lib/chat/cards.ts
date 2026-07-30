import { resolveBoardLabel } from "@/lib/boardConfig";
import type { BoardId, ProductBacklogItem } from "@/lib/types";
import type { ChatSlot } from "./config";
import type { DailyTaskView } from "./dailyTasks";
import { backlogOptionValue } from "./boardOps";
import { laneToProgressHint, PROGRESS_OPTIONS } from "./progress";

type ChatWidget = Record<string, unknown>;
type ChatSection = { header?: string; widgets: ChatWidget[] };
type BoardLabels = Partial<Record<BoardId, string>>;

function actionButton(
  text: string,
  functionName: string,
  parameters: Record<string, string>,
): ChatWidget {
  return {
    buttonList: {
      buttons: [
        {
          text,
          onClick: {
            action: {
              function: functionName,
              parameters: Object.entries(parameters).map(([key, value]) => ({
                key,
                value,
              })),
            },
          },
        },
      ],
    },
  };
}

function progressButtons(view: DailyTaskView, slot: ChatSlot): ChatWidget {
  return {
    buttonList: {
      buttons: PROGRESS_OPTIONS.map((opt) => ({
        text: opt.label,
        onClick: {
          action: {
            function: "setProgress",
            parameters: [
              { key: "boardId", value: view.boardId },
              { key: "taskId", value: view.task.id },
              { key: "progress", value: String(opt.value) },
              { key: "slot", value: slot },
            ],
          },
        },
      })),
    },
  };
}

function taskSection(
  view: DailyTaskView,
  withProgress: boolean,
  slot: ChatSlot,
  boardLabels?: BoardLabels,
): ChatSection {
  const boardLabel = resolveBoardLabel(view.boardId, boardLabels);
  const status = laneToProgressHint(view.task.lane);
  const widgets: ChatWidget[] = [
    {
      textParagraph: {
        text: `<b>${escapeHtml(view.task.title || "(無題)")}</b><br>${escapeHtml(view.backlogTitle)} · ${escapeHtml(boardLabel)} · ${status}`,
      },
    },
  ];
  if (withProgress && view.task.lane !== "done") {
    widgets.push(progressButtons(view, slot));
  }
  return { widgets };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function declarationSections(
  slot: ChatSlot,
  backlogOptions: { boardId: BoardId; item: ProductBacklogItem }[],
  boardLabels?: BoardLabels,
): ChatSection[] {
  const sections: ChatSection[] = [];

  if (slot === "evening") {
    const selectionItems = backlogOptions.slice(0, 40).map(({ boardId, item }) => ({
      text: `${resolveBoardLabel(boardId, boardLabels)}: ${item.title || "(無題)"}`.slice(
        0,
        80,
      ),
      value: backlogOptionValue(boardId, item.id),
    }));

    sections.push({
      header: "追加タスク（既存 Backlog）",
      widgets: [
        {
          selectionInput: {
            name: "existing_backlog",
            label: "Backlog",
            type: "DROPDOWN",
            items:
              selectionItems.length > 0
                ? selectionItems
                : [{ text: "(Backlog なし)", value: "" }],
          },
        },
        {
          textInput: {
            name: "existing_task_title",
            label: "タスク名",
            type: "SINGLE_LINE",
          },
        },
        actionButton("既存に追加", "submitAddExisting", {}),
      ],
    });

    sections.push({
      header: "追加タスク（新規 Backlog・都度案件）",
      widgets: [
        {
          textInput: {
            name: "new_backlog_title",
            label: "Backlog 名",
            type: "SINGLE_LINE",
          },
        },
        {
          textInput: {
            name: "new_task_title",
            label: "タスク名",
            type: "SINGLE_LINE",
          },
        },
        actionButton("新規追加", "submitAddNew", {}),
      ],
    });
  }

  return sections;
}

export function buildProgressCard(params: {
  slot: ChatSlot;
  assigneeName: string;
  dateIso: string;
  tasks: DailyTaskView[];
  backlogOptions: { boardId: BoardId; item: ProductBacklogItem }[];
  boardLabels?: BoardLabels;
  notice?: string;
}): { text?: string; cardsV2: unknown[] } {
  const {
    slot,
    assigneeName,
    dateIso,
    tasks,
    backlogOptions,
    boardLabels,
    notice,
  } = params;
  const slotLabel = slot === "midday" ? "途中経過" : "夕";
  const withProgress = true;

  const sections: ChatSection[] = [];

  if (notice) {
    sections.push({
      widgets: [{ textParagraph: { text: `<i>${escapeHtml(notice)}</i>` } }],
    });
  }

  if (tasks.length === 0) {
    sections.push({
      widgets: [
        {
          textParagraph: {
            text: "当日タスクはありません（担当・日付条件に一致するタスクなし）。",
          },
        },
      ],
    });
  } else {
    for (const view of tasks) {
      sections.push(taskSection(view, withProgress, slot, boardLabels));
    }
  }

  sections.push(...declarationSections(slot, backlogOptions, boardLabels));

  sections.push({
    widgets: [
      actionButton("カードを再読込", "refreshCard", { slot }),
    ],
  });

  return {
    text: `${slotLabel}カード · ${assigneeName} · ${dateIso}`,
    cardsV2: [
      {
        cardId: `progress-${slot}-${dateIso}`,
        card: {
          header: {
            title: `当日タスク（${slotLabel}）`,
            subtitle: `${assigneeName} / ${dateIso}`,
          },
          sections,
        },
      },
    ],
  };
}

/** CARD_CLICKED 用: 元メッセージを差し替え */
export function asUpdateMessage(
  message: Record<string, unknown>,
): Record<string, unknown> {
  return {
    actionResponse: { type: "UPDATE_MESSAGE" },
    ...message,
  };
}

export function textOnlyMessage(text: string): { text: string } {
  return { text };
}
