-- Run this in your Supabase SQL Editor to persist Ticket states --

CREATE TABLE IF NOT EXISTS active_tickets (
  user_id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_actions (
  action_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
