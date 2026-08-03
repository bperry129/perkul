-- ===========================================================================
-- PRESS YOUR LUCK — per-player, per-day activity counters.
--
-- One row per (identity, day). Written once per real button press, via a
-- read-then-upsert in src/lib/press-your-luck.ts (recordPressActivity) — not
-- one row per press, which would be needless write volume for an arcade
-- minigame. This is purely an admin/analytics aid: how many times has each
-- player actually pressed the button, across how many distinct hours of the
-- day, and does that pattern look like a person or a script left running.
--
-- `hours_bitmask` packs which UTC hours (0-23) saw at least one press that
-- day into a single integer — bit N set means "pressed something during
-- hour N". A human playing an arcade game for a few minutes sets a handful of
-- bits; a script running around the clock sets nearly all 24. Counting set
-- bits (popcount) happens in the admin query, not in SQL, to keep this
-- migration simple.
--
-- Same posture as press_your_luck_runs: RLS on, no policies, service-role
-- only.
-- ===========================================================================

create table if not exists public.press_your_luck_activity (
  identity_key         text not null,
  user_id              uuid references auth.users (id) on delete set null,
  anonymous_session_id text,
  activity_date        date not null,
  presses              integer not null default 0,
  busts                integer not null default 0,
  hours_bitmask        integer not null default 0,
  last_press_at        timestamptz,
  created_at           timestamptz not null default now(),
  primary key (identity_key, activity_date)
);

create index if not exists pyl_activity_user_idx
  on public.press_your_luck_activity (user_id) where user_id is not null;
create index if not exists pyl_activity_anon_idx
  on public.press_your_luck_activity (anonymous_session_id) where anonymous_session_id is not null;
create index if not exists pyl_activity_last_press_idx
  on public.press_your_luck_activity (last_press_at desc);

alter table public.press_your_luck_activity enable row level security;
-- No select/insert policies: denied for anon + authenticated, service role
-- bypasses RLS — identical posture to press_your_luck_runs.
