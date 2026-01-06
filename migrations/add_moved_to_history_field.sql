-- Migration: Add moved_to_history field to saved_alerts table
-- Description: Track which alerts have been moved to the history/follow-up table
-- Date: 2026-01-06

-- Add the moved_to_history column (default FALSE)
ALTER TABLE saved_alerts
ADD COLUMN IF NOT EXISTS moved_to_history BOOLEAN DEFAULT FALSE;

-- Add moved_at timestamp to track when it was moved
ALTER TABLE saved_alerts
ADD COLUMN IF NOT EXISTS moved_at TIMESTAMPTZ;

-- Add moved_by to track who moved it
ALTER TABLE saved_alerts
ADD COLUMN IF NOT EXISTS moved_by TEXT;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_saved_alerts_moved_to_history
ON saved_alerts(moved_to_history);

-- Add comment to document the field
COMMENT ON COLUMN saved_alerts.moved_to_history IS 'Indicates if this alert has been moved to the history table for follow-up';
COMMENT ON COLUMN saved_alerts.moved_at IS 'Timestamp when the alert was moved to history';
COMMENT ON COLUMN saved_alerts.moved_by IS 'Email of user who moved the alert to history';
