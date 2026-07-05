CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timezone TEXT NOT NULL,
  planning_enabled INTEGER NOT NULL DEFAULT 1,
  progress_enabled INTEGER NOT NULL DEFAULT 1,
  review_enabled INTEGER NOT NULL DEFAULT 1,
  planning_time TEXT NOT NULL DEFAULT '20:30',
  progress_time TEXT NOT NULL DEFAULT '09:00',
  review_time TEXT NOT NULL DEFAULT '20:45',
  app_url TEXT NOT NULL,
  today_goals_count INTEGER NOT NULL DEFAULT 0,
  last_planning_sent_key TEXT,
  last_progress_sent_key TEXT,
  last_review_sent_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_timezone
  ON push_subscriptions (timezone);
