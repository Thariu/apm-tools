import { collection, doc } from "firebase/firestore";
import { getFirestoreDb } from "./client";
import type { BoardId } from "../types";

const db = () => getFirestoreDb();

export function appMetaDoc() {
  return doc(db(), "planning_meta", "app");
}

export function burndownSprintDoc() {
  return doc(db(), "planning_meta", "burndown_sprint");
}

/** ボード表示名（カテゴリ / カテゴリ2 / カテゴリ3 など）※レガシー。新規は boards_registry を優先 */
export function boardLabelsDoc() {
  return doc(db(), "planning_meta", "board_labels");
}

/** ボード（カテゴリ）レジストリ：追加・アーカイブ・復元・完全削除の正本 */
export function boardsRegistryDoc() {
  return doc(db(), "planning_meta", "boards_registry");
}

export function boardScheduleDoc(boardId: BoardId) {
  return doc(db(), "boards", boardId, "schedule", "default");
}

export function boardReleaseBurnupDoc(boardId: BoardId) {
  return doc(db(), "boards", boardId, "release_burnup", "config");
}

export function productBacklogCollection(boardId: BoardId) {
  return collection(db(), "boards", boardId, "product_backlog");
}

export function tasksCollection(boardId: BoardId) {
  return collection(db(), "boards", boardId, "tasks");
}

/** @deprecated ボード別保存（移行元）。新規は retroSessionsCollection を使用 */
export function retrosCollection(boardId: BoardId) {
  return collection(db(), "boards", boardId, "retros");
}

/** @deprecated 移行元パス */
export function retroDoc(boardId: BoardId, sprintKey: string) {
  return doc(retrosCollection(boardId), sprintKey);
}

/** 3ボード共通の振り返りセッション（スプリント単位） */
export function retroSessionsCollection() {
  return collection(db(), "planning_meta", "app", "retro_sessions");
}

export function retroSessionDoc(sprintKey: string) {
  return doc(retroSessionsCollection(), sprintKey);
}

/** FDL 付箋（1付箋1ドキュメント） */
export function retroFdlNotesCollection(sprintKey: string) {
  return collection(retroSessionDoc(sprintKey), "fdl_notes");
}

export function retroFdlNoteDoc(sprintKey: string, noteId: string) {
  return doc(retroFdlNotesCollection(sprintKey), noteId);
}

/** FDL 感謝（Thank you）付箋 */
export function retroFdlThankYouNotesCollection(sprintKey: string) {
  return collection(retroSessionDoc(sprintKey), "fdl_thank_you_notes");
}

export function retroFdlThankYouNoteDoc(sprintKey: string, noteId: string) {
  return doc(retroFdlThankYouNotesCollection(sprintKey), noteId);
}

/** 幸福指標：理由付箋 */
export function retroHappinessReasonNotesCollection(sprintKey: string) {
  return collection(retroSessionDoc(sprintKey), "happiness_reason_notes");
}

export function retroHappinessReasonNoteDoc(sprintKey: string, noteId: string) {
  return doc(retroHappinessReasonNotesCollection(sprintKey), noteId);
}

/** 幸福指標：改善案付箋 */
export function retroHappinessImprovementNotesCollection(sprintKey: string) {
  return collection(retroSessionDoc(sprintKey), "happiness_improvement_notes");
}

export function retroHappinessImprovementNoteDoc(
  sprintKey: string,
  noteId: string,
) {
  return doc(retroHappinessImprovementNotesCollection(sprintKey), noteId);
}

export function retroDraftsCollection(boardId: BoardId) {
  return collection(db(), "boards", boardId, "retro_drafts");
}

export function retroDraftDoc(boardId: BoardId, sprintKey: string) {
  return doc(retroDraftsCollection(boardId), sprintKey);
}

export function burndownSnapshotsCollection(boardId: BoardId) {
  return collection(db(), "boards", boardId, "burndown_snapshots");
}

export function finalizedSprintsCollection(boardId: BoardId) {
  return collection(db(), "boards", boardId, "finalized_sprints");
}

export function productBacklogDoc(boardId: BoardId, itemId: string) {
  return doc(productBacklogCollection(boardId), itemId);
}

export function taskDoc(boardId: BoardId, taskId: string) {
  return doc(tasksCollection(boardId), taskId);
}

export function assigneesColorsCollection() {
  // Subcollection under planning_meta/app
  // collection path must be: collection/doc/collection (odd segments)
  return collection(db(), "planning_meta", "app", "assignees_colors");
}

export function assigneeColorDoc(assigneeName: string) {
  // 名前が Firestore の doc id で使える前提だが、安全のため encodeURIComponent する
  return doc(assigneesColorsCollection(), encodeURIComponent(assigneeName));
}

export function retroFacilitationCollection() {
  return collection(db(), "planning_meta", "app", "retro_facilitation");
}

export function retroFacilitationDoc(sprintKey: string) {
  return doc(retroFacilitationCollection(), sprintKey);
}

export function assigneesDirectoryCollection() {
  return collection(db(), "planning_meta", "app", "assignees_directory");
}

export function assigneeDirectoryDoc(assigneeName: string) {
  return doc(assigneesDirectoryCollection(), encodeURIComponent(assigneeName));
}

/** 今日の進捗：枠ごとの申告完了（日付単位で query） */
export function dailyCheckinsCollection() {
  return collection(db(), "planning_meta", "app", "daily_checkins");
}

export function dailyCheckinDocId(dateIso: string, assigneeName: string): string {
  return `${dateIso}_${encodeURIComponent(assigneeName.trim())}`;
}

export function dailyCheckinDoc(dateIso: string, assigneeName: string) {
  return doc(dailyCheckinsCollection(), dailyCheckinDocId(dateIso, assigneeName));
}

/** Backlog「ゴール」候補（全ボード共通） */
export function goalTextDirectoryCollection() {
  return collection(db(), "planning_meta", "app", "goal_text_directory");
}

export function goalTextDirectoryDoc(goalText: string) {
  return doc(goalTextDirectoryCollection(), encodeURIComponent(goalText));
}

/** チーム共有: タスクテンプレ一覧 */
export function taskTemplatesCollection() {
  return collection(db(), "planning_meta", "app", "task_templates");
}

export function taskTemplateDoc(templateId: string) {
  return doc(taskTemplatesCollection(), encodeURIComponent(templateId));
}

/** チーム共有: タスクテンプレセット一覧 */
export function taskTemplateSetsCollection() {
  return collection(db(), "planning_meta", "app", "task_template_sets");
}

export function taskTemplateSetDoc(setId: string) {
  return doc(taskTemplateSetsCollection(), encodeURIComponent(setId));
}

export function burndownSnapshotDoc(boardId: BoardId, dayIso: string) {
  return doc(burndownSnapshotsCollection(boardId), dayIso);
}

export function finalizedSprintDoc(boardId: BoardId, sprintTuesdayIso: string) {
  return doc(finalizedSprintsCollection(boardId), sprintTuesdayIso);
}
