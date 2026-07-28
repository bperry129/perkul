-- ===========================================================================
-- PERKUL - initial schema
-- Daily timed vocabulary game. Five words, one is fabricated.
--
-- Security model
--   * Answer data (rounds.fake_option_id, round_options.is_real, rationales,
--     definitions) is NEVER readable by anon/authenticated roles. There are no
--     SELECT policies on those tables, so RLS denies everything.
--   * Gameplay + admin run through server routes using the service role.
--   * Public read paths that must exist for the browser are exposed as
--     SECURITY DEFINER functions that return only non-revealing columns.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_word(p_word text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(p_word, ''), '[^a-zA-Z]', '', 'g'));
$$;

-- New York calendar date for a given instant (DST safe, IANA aware).
create or replace function public.ny_date(p_at timestamptz default now())
returns date language sql stable as $$
  select (p_at at time zone 'America/New_York')::date;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users (id) on delete cascade,
  display_name       text,
  display_name_key   text generated always as (lower(display_name)) stored,
  leaderboard_opt_in boolean not null default true,
  is_admin           boolean not null default false,
  is_banned_name     boolean not null default false,
  preferences        jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists profiles_display_name_key_uidx
  on public.profiles (display_name_key) where display_name is not null;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, null)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block privilege escalation from the client.
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
    new.is_banned_name := old.is_banned_name;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where user_id = p_user), false);
$$;

-- ---------------------------------------------------------------------------
-- curated lexicon
-- ---------------------------------------------------------------------------
create table if not exists public.lexicon_entries (
  id                  uuid primary key default gen_random_uuid(),
  word                text not null,
  normalized_word     text not null,
  part_of_speech      text,
  short_definition    text,
  expanded_definition text,
  example_usage       text,
  difficulty          smallint not null default 3 check (difficulty between 1 and 5),
  frequency_band      smallint not null default 3 check (frequency_band between 1 and 5),
  accepted_for_game   boolean not null default true,
  editorial_notes     text,
  source_notes        text,
  tags                text[] not null default '{}',
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists lexicon_normalized_uidx on public.lexicon_entries (normalized_word);
create index if not exists lexicon_accepted_idx on public.lexicon_entries (accepted_for_game);
create index if not exists lexicon_difficulty_idx on public.lexicon_entries (difficulty);
create index if not exists lexicon_word_trgm_idx on public.lexicon_entries (word);

create trigger lexicon_updated_at before update on public.lexicon_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- games / rounds / options
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id               uuid primary key default gen_random_uuid(),
  game_number      integer not null,
  active_date      date not null,
  status           text not null default 'draft'
                     check (status in ('draft','needs_review','ready','published','expired')),
  difficulty_label text,
  editor_notes     text,
  source_batch_id  uuid,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists games_active_date_uidx on public.games (active_date);
create unique index if not exists games_number_uidx on public.games (game_number);
create index if not exists games_status_date_idx on public.games (status, active_date);

create trigger games_updated_at before update on public.games
  for each row execute function public.set_updated_at();

create table if not exists public.rounds (
  id                       uuid primary key default gen_random_uuid(),
  game_id                  uuid not null references public.games (id) on delete cascade,
  position                 smallint not null check (position between 1 and 10),
  difficulty               smallint not null default 3 check (difficulty between 1 and 5),
  round_type               text not null default 'mixed',
  fake_option_id           uuid,
  intended_decoy_option_id uuid,
  fake_rationale           text,
  decoy_rationale          text,
  editor_notes             text,
  approved                 boolean not null default false,
  quality_checklist        jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index if not exists rounds_game_position_uidx on public.rounds (game_id, position);
create index if not exists rounds_game_idx on public.rounds (game_id, position);
create index if not exists rounds_type_idx on public.rounds (round_type);

create trigger rounds_updated_at before update on public.rounds
  for each row execute function public.set_updated_at();

create table if not exists public.round_options (
  id                  uuid primary key default gen_random_uuid(),
  round_id            uuid not null references public.rounds (id) on delete cascade,
  lexicon_entry_id    uuid references public.lexicon_entries (id) on delete set null,
  position            smallint not null check (position between 1 and 5),
  display_word        text not null,
  normalized_word     text not null,
  is_real             boolean not null,
  part_of_speech      text,
  short_definition    text,
  expanded_definition text,
  created_at          timestamptz not null default now()
);

create unique index if not exists round_options_round_position_uidx on public.round_options (round_id, position);
create index if not exists round_options_round_idx on public.round_options (round_id);
create index if not exists round_options_normalized_idx on public.round_options (normalized_word);
create index if not exists round_options_fake_idx on public.round_options (normalized_word) where is_real = false;

alter table public.rounds
  drop constraint if exists rounds_fake_option_fk,
  drop constraint if exists rounds_decoy_option_fk;
alter table public.rounds
  add constraint rounds_fake_option_fk foreign key (fake_option_id)
    references public.round_options (id) on delete set null,
  add constraint rounds_decoy_option_fk foreign key (intended_decoy_option_id)
    references public.round_options (id) on delete set null;

-- ---------------------------------------------------------------------------
-- attempts
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id                    uuid primary key default gen_random_uuid(),
  game_id               uuid not null references public.games (id) on delete cascade,
  user_id               uuid references auth.users (id) on delete set null,
  anonymous_session_id  text,
  display_name_override text,
  mode                  text not null default 'ranked' check (mode in ('ranked','practice')),
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  elapsed_ms            integer,
  client_elapsed_ms     integer,
  correct_count         smallint,
  rounds_total          smallint not null default 10,
  is_ranked             boolean not null default true,
  completion_status     text not null default 'in_progress'
                          check (completion_status in ('in_progress','completed','abandoned')),
  integrity_status      text not null default 'valid'
                          check (integrity_status in ('valid','suspicious','unranked','admin_review')),
  integrity_notes       text,
  is_simulated          boolean not null default false,
  option_order          jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One ranked attempt per identity per game (server enforced + DB enforced).
create unique index if not exists attempts_one_ranked_user_uidx
  on public.attempts (game_id, user_id)
  where is_ranked and user_id is not null and not is_simulated;

create unique index if not exists attempts_one_ranked_anon_uidx
  on public.attempts (game_id, anonymous_session_id)
  where is_ranked and anonymous_session_id is not null and user_id is null and not is_simulated;

-- Leaderboard: accuracy first, time second.
create index if not exists attempts_leaderboard_idx
  on public.attempts (game_id, correct_count desc, elapsed_ms asc)
  where is_ranked and completed_at is not null;

create index if not exists attempts_user_game_idx on public.attempts (user_id, game_id);
create index if not exists attempts_anon_game_idx on public.attempts (anonymous_session_id, game_id);
create index if not exists attempts_user_completed_idx on public.attempts (user_id, completed_at desc);
create index if not exists attempts_simulated_idx on public.attempts (is_simulated);
create index if not exists attempts_integrity_idx on public.attempts (integrity_status);

create trigger attempts_updated_at before update on public.attempts
  for each row execute function public.set_updated_at();

create table if not exists public.attempt_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.attempts (id) on delete cascade,
  round_id            uuid not null references public.rounds (id) on delete cascade,
  selected_option_id  uuid not null references public.round_options (id) on delete cascade,
  display_position    smallint,
  elapsed_at_ms       integer,
  response_elapsed_ms integer,
  is_correct          boolean not null,
  created_at          timestamptz not null default now()
);

create unique index if not exists attempt_answers_unique_round on public.attempt_answers (attempt_id, round_id);
create index if not exists attempt_answers_attempt_idx on public.attempt_answers (attempt_id);
create index if not exists attempt_answers_round_option_idx on public.attempt_answers (round_id, selected_option_id);

-- ---------------------------------------------------------------------------
-- configuration
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key           text primary key,
  enabled       boolean not null default false,
  description   text,
  configuration jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.benchmark_versions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  population_size integer not null default 6000,
  seed            integer not null default 20260728,
  distribution    jsonb not null,
  publicly_visible boolean not null default true,
  active          boolean not null default false,
  version         integer not null default 1,
  created_at      timestamptz not null default now()
);

create unique index if not exists benchmark_single_active_uidx
  on public.benchmark_versions (active) where active;

create table if not exists public.game_generation_batches (
  id            uuid primary key default gen_random_uuid(),
  start_date    date,
  end_date      date,
  days_requested integer,
  prompt        text,
  imported_json jsonb,
  report        jsonb,
  status        text not null default 'prompt_generated'
                  check (status in ('prompt_generated','imported','rejected','published')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action        text not null,
  entity_type   text,
  entity_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit_log (created_at desc);

create table if not exists public.analytics_events (
  id         bigserial primary key,
  name       text not null,
  user_id    uuid references auth.users (id) on delete set null,
  session_id text,
  game_id    uuid references public.games (id) on delete set null,
  attempt_id uuid references public.attempts (id) on delete set null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_name_created_idx on public.analytics_events (name, created_at desc);
create index if not exists analytics_game_idx on public.analytics_events (game_id);

-- ---------------------------------------------------------------------------
-- word usage history (fast editorial reuse checks)
-- ---------------------------------------------------------------------------
create or replace view public.word_usage_history as
  select
    o.normalized_word,
    o.display_word,
    o.is_real,
    (r.fake_option_id = o.id) as was_fake,
    (r.intended_decoy_option_id = o.id) as was_decoy,
    g.active_date,
    g.game_number,
    r.position as round_position
  from public.round_options o
  join public.rounds r on r.id = o.round_id
  join public.games g on g.id = r.game_id;

-- ---------------------------------------------------------------------------
-- ranking / stats functions (SECURITY DEFINER, no answer data exposed)
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_page(
  p_game_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_include_simulated boolean default false
)
returns table (
  rank bigint,
  attempt_id uuid,
  display_name text,
  correct_count smallint,
  elapsed_ms integer,
  is_simulated boolean,
  is_registered boolean
)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select
      a.id,
      case
        when p.display_name is not null and not p.is_banned_name then p.display_name
        when a.display_name_override is not null then a.display_name_override
        when a.user_id is not null then 'Player'
        else 'Guest'
      end as display_name,
      a.correct_count,
      a.elapsed_ms,
      a.is_simulated,
      (a.user_id is not null) as is_registered,
      a.completed_at
    from public.attempts a
    left join public.profiles p on p.user_id = a.user_id
    where a.game_id = p_game_id
      and a.is_ranked
      and a.completed_at is not null
      and a.completion_status = 'completed'
      and a.integrity_status = 'valid'
      and (p_include_simulated or not a.is_simulated)
      and coalesce(p.leaderboard_opt_in, true)
  )
  select
    row_number() over (order by correct_count desc, elapsed_ms asc, completed_at asc) as rank,
    id, display_name, correct_count, elapsed_ms, is_simulated, is_registered
  from eligible
  order by rank
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

create or replace function public.attempt_rank(p_attempt_id uuid, p_include_simulated boolean default false)
returns table (rank bigint, total bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select a.game_id, a.correct_count, a.elapsed_ms, a.completed_at
    from public.attempts a where a.id = p_attempt_id
  ),
  pool as (
    select a.correct_count, a.elapsed_ms, a.completed_at
    from public.attempts a, me
    where a.game_id = me.game_id
      and a.is_ranked
      and a.completed_at is not null
      and a.integrity_status = 'valid'
      and (p_include_simulated or not a.is_simulated)
  )
  select
    (select count(*) + 1 from pool p, me
      where (p.correct_count, -p.elapsed_ms) > (me.correct_count, -me.elapsed_ms)) as rank,
    (select count(*) from pool) as total;
$$;

create or replace function public.daily_stats(p_game_id uuid, p_include_simulated boolean default false)
returns table (
  completions bigint,
  avg_correct numeric,
  median_elapsed_ms numeric,
  perfect_games bigint,
  registered bigint,
  anonymous bigint
)
language sql stable security definer set search_path = public as $$
  with pool as (
    select * from public.attempts a
    where a.game_id = p_game_id and a.is_ranked and a.completed_at is not null
      and a.integrity_status = 'valid'
      and (p_include_simulated or not a.is_simulated)
  )
  select
    count(*),
    round(avg(correct_count)::numeric, 2),
    percentile_cont(0.5) within group (order by elapsed_ms),
    count(*) filter (where correct_count = rounds_total),
    count(*) filter (where user_id is not null),
    count(*) filter (where user_id is null)
  from pool;
$$;

-- Per-round selection distribution. Only released for completed rounds; the
-- caller (server route) decides whether the player is allowed to see it.
create or replace function public.round_selection_stats(p_game_id uuid, p_include_simulated boolean default false)
returns table (
  round_id uuid,
  round_position smallint,
  option_id uuid,
  display_word text,
  is_fake boolean,
  selections bigint,
  round_total bigint
)
language sql stable security definer set search_path = public as $$
  with pool as (
    select aa.round_id, aa.selected_option_id
    from public.attempt_answers aa
    join public.attempts a on a.id = aa.attempt_id
    join public.rounds r on r.id = aa.round_id
    where r.game_id = p_game_id
      and a.is_ranked and a.completed_at is not null
      and a.integrity_status = 'valid'
      and (p_include_simulated or not a.is_simulated)
  ),
  totals as (select round_id, count(*) as round_total from pool group by round_id)
  select
    o.round_id,
    r.position,
    o.id,
    o.display_word,
    (r.fake_option_id = o.id),
    coalesce((select count(*) from pool p where p.selected_option_id = o.id), 0),
    coalesce(t.round_total, 0)
  from public.round_options o
  join public.rounds r on r.id = o.round_id
  left join totals t on t.round_id = o.round_id
  where r.game_id = p_game_id
  order by r.position, o.position;
$$;

create or replace function public.player_lifetime_stats(p_user_id uuid)
returns table (
  games_played bigint,
  perfect_games bigint,
  total_correct bigint,
  total_rounds bigint,
  avg_elapsed_ms numeric,
  best_perfect_ms integer
)
language sql stable security definer set search_path = public as $$
  select
    count(*),
    count(*) filter (where correct_count = rounds_total),
    coalesce(sum(correct_count), 0),
    coalesce(sum(rounds_total), 0),
    round(avg(elapsed_ms)::numeric, 0),
    min(elapsed_ms) filter (where correct_count = rounds_total)
  from public.attempts
  where user_id = p_user_id and is_ranked and completed_at is not null
    and integrity_status in ('valid','suspicious') and not is_simulated;
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.lexicon_entries       enable row level security;
alter table public.games                 enable row level security;
alter table public.rounds                enable row level security;
alter table public.round_options         enable row level security;
alter table public.attempts              enable row level security;
alter table public.attempt_answers       enable row level security;
alter table public.feature_flags         enable row level security;
alter table public.app_settings          enable row level security;
alter table public.benchmark_versions    enable row level security;
alter table public.game_generation_batches enable row level security;
alter table public.admin_audit_log       enable row level security;
alter table public.analytics_events      enable row level security;

-- profiles: read own, update own (guarded), admins read all
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

-- attempts: a player may read their own attempt rows (score fields only via
-- these rows; they can never write them).
drop policy if exists attempts_select_own on public.attempts;
create policy attempts_select_own on public.attempts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- attempt_answers: own attempts only, and never writable from the client.
drop policy if exists attempt_answers_select_own on public.attempt_answers;
create policy attempt_answers_select_own on public.attempt_answers
  for select to authenticated using (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
    or public.is_admin()
  );

-- feature flags are public read (they only describe UI behaviour)
drop policy if exists feature_flags_read on public.feature_flags;
create policy feature_flags_read on public.feature_flags
  for select to anon, authenticated using (true);

-- games/rounds/round_options/lexicon/settings/benchmarks/batches/audit/analytics:
-- NO policies => denied for anon + authenticated. Service role bypasses RLS.
-- Admin UI reads them through authorized server routes.

-- Grant execute on the safe read functions.
grant execute on function public.leaderboard_page(uuid, integer, integer, boolean) to anon, authenticated;
grant execute on function public.attempt_rank(uuid, boolean) to anon, authenticated;
grant execute on function public.daily_stats(uuid, boolean) to anon, authenticated;
grant execute on function public.ny_date(timestamptz) to anon, authenticated;
grant execute on function public.player_lifetime_stats(uuid) to authenticated;
-- round_selection_stats intentionally NOT granted to anon/authenticated:
-- it is served post-completion through a server route.
revoke execute on function public.round_selection_stats(uuid, boolean) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- seed configuration rows
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, description, configuration) values
  ('player_comparisons',    true,  'Show population comparison modules on results', '{"mode":"benchmark","minimum_real_sample_size":100}'::jsonb),
  ('real_leaderboard',      true,  'Public daily leaderboard', '{}'::jsonb),
  ('benchmark_comparisons', true,  'Estimated rank against the benchmark field', '{}'::jsonb),
  ('grades',                true,  'Show letter grades', '{"source":"benchmark"}'::jsonb),
  ('signup_cta',            true,  'Encourage account creation after a result', '{}'::jsonb),
  ('public_round_stats',    false, 'Per-round selection percentages in explanations', '{}'::jsonb),
  ('practice_replay',       false, 'Allow unranked replays of a completed game', '{}'::jsonb),
  ('archive',               false, 'Public archive of past games', '{}'::jsonb),
  ('sharing',               true,  'Spoiler-free share result', '{}'::jsonb),
  ('daily_countdown',       true,  'Countdown to the next daily game', '{}'::jsonb),
  ('benchmark_population',  true,  'Benchmark population model enabled', '{}'::jsonb),
  ('simulated_data',        false, 'Development simulated attempts visible to admin tools', '{}'::jsonb)
on conflict (key) do nothing;

insert into public.app_settings (key, value) values
  ('comparisons', '{"mode":"benchmark","minimum_real_sample_size":100}'::jsonb),
  ('grading', '{"mode":"benchmark"}'::jsonb)
on conflict (key) do nothing;

insert into public.benchmark_versions (name, population_size, seed, distribution, active, publicly_visible)
values (
  'Launch benchmark field v1',
  6000,
  20260728,
  '{
     "accuracy": [0.004,0.010,0.022,0.045,0.078,0.118,0.157,0.181,0.166,0.128,0.091],
     "timeByAccuracy": {
       "0":  {"medianMs": 42000, "logSd": 0.62},
       "1":  {"medianMs": 46000, "logSd": 0.60},
       "2":  {"medianMs": 52000, "logSd": 0.58},
       "3":  {"medianMs": 58000, "logSd": 0.56},
       "4":  {"medianMs": 63000, "logSd": 0.54},
       "5":  {"medianMs": 68000, "logSd": 0.52},
       "6":  {"medianMs": 73000, "logSd": 0.50},
       "7":  {"medianMs": 78000, "logSd": 0.48},
       "8":  {"medianMs": 83000, "logSd": 0.46},
       "9":  {"medianMs": 89000, "logSd": 0.45},
       "10": {"medianMs": 96000, "logSd": 0.44}
     },
     "minPlausibleMs": 9000,
     "maxPlausibleMs": 900000
   }'::jsonb,
  true,
  true
)
on conflict do nothing;
