ALTER TABLE analysis_tasks ADD COLUMN IF NOT EXISTS workbook_data BYTEA;
ALTER TABLE analysis_tasks ADD COLUMN IF NOT EXISTS workbook_size INTEGER;
