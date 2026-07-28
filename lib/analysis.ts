import "server-only";

import { db } from "@/lib/db";

export type AnalysisTask = {
  id: string;
  user_id: string;
  infini_task_id: string;
  conn_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  workbook_name: string;
  context_name: string | null;
  latest_message: string | null;
  error_message: string | null;
  workspace: unknown;
  created_at: Date;
  updated_at: Date;
};

export async function findOwnedTask(id: string, userId: string) {
  const result = await db.query<AnalysisTask>(
    `SELECT id, user_id, infini_task_id, conn_id, status, workbook_name, context_name,
            latest_message, error_message, workspace, created_at, updated_at
       FROM analysis_tasks
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [id, userId],
  );
  return result.rows[0] ?? null;
}

export async function updateTask(id: string, fields: { status?: string; latestMessage?: string; errorMessage?: string | null; workspace?: unknown }) {
  await db.query(
    `UPDATE analysis_tasks SET
       status = COALESCE($2, status),
       latest_message = COALESCE($3, latest_message),
       error_message = CASE WHEN $4::boolean THEN $5 ELSE error_message END,
       workspace = COALESCE($6::jsonb, workspace),
       updated_at = NOW()
     WHERE id = $1`,
    [id, fields.status ?? null, fields.latestMessage ?? null, "errorMessage" in fields, fields.errorMessage ?? null, fields.workspace === undefined ? null : JSON.stringify(fields.workspace)],
  );
}
