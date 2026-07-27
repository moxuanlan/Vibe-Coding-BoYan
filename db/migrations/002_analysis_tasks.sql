CREATE TABLE IF NOT EXISTS analysis_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  infini_task_id UUID NOT NULL UNIQUE,
  conn_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  workbook_name TEXT NOT NULL,
  context_name TEXT,
  latest_message TEXT,
  error_message TEXT,
  workspace JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analysis_tasks_user_created_idx ON analysis_tasks(user_id, created_at DESC);
