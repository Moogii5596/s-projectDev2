ALTER TABLE workflow_instances
  ADD COLUMN IF NOT EXISTS resolved_steps JSONB;