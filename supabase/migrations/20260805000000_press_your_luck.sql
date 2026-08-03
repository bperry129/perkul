-- ===========================================================================
-- PRESS YOUR LUCK — a small "more games" arcade minigame, unrelated to daily
-- ranking. One button. Score rises 1 per successful press; the chance the
-- *next* press busts the run rises with it (see src/lib/press-your-luck-math.ts),
-- capped so it is never a certainty. A run ends by busting or by the player
-- choosing to bank their score.
--
-- Security model matches `games`/`rounds`/`round_options`: RLS is enabled
-- with NO policies for anon/authenticated, so every read and write goes
-- through a server route using the service-role client. There is no secret
-- to protect in a high-score table — this is just consistency with the rest
-- of the schema, and it means a client can never forge a run directly.
-- ===========================================================================

create table if not exists public.press_your_luck_runs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users (id) on delete set null,
  anonymous_session_id text,
  score                integer not null check (score >= 0),
  ended_reason         text not null default 'bust' check (ended_reason in ('bust', 'banked')),
  is_simulated         boolean not null default false,
  created_at           timestamptz not null default now()
);

create index if not exists pyl_runs_score_idx
  on public.press_your_luck_runs (score desc, created_at asc);
create index if not exists pyl_runs_user_idx
  on public.press_your_luck_runs (user_id) where user_id is not null;
create index if not exists pyl_runs_anon_idx
  on public.press_your_luck_runs (anonymous_session_id) where anonymous_session_id is not null;
create index if not exists pyl_runs_simulated_idx
  on public.press_your_luck_runs (is_simulated);

alter table public.press_your_luck_runs enable row level security;
-- No select/insert policies: identical posture to games/rounds/round_options —
-- denied for anon + authenticated, service role bypasses RLS.
