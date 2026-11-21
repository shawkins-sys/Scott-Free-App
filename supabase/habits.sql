-- Habit questions in the check-in (21/11/2026). Run once in the Supabase SQL editor.
-- Safe to re-run. Answers are stored as { habit_key: answer index }, 0 = did not.
alter table public.checkins add column if not exists habits jsonb not null default '{}'::jsonb;
