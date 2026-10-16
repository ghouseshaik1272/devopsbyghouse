CREATE TABLE IF NOT EXISTS reminder_users (
  uid TEXT PRIMARY KEY,
  prayer_times TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'gentle',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prayer_checkins (
  uid TEXT NOT NULL,
  local_day TEXT NOT NULL,
  prayer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (uid, local_day, prayer)
);

CREATE TABLE IF NOT EXISTS sent_events (
  event_key TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  local_day TEXT NOT NULL,
  prayer TEXT NOT NULL,
  minutes_before INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sent_events_pending ON sent_events(state, next_attempt_at);
