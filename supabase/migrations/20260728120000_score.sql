-- ===========================================================================
-- Perkul score: "most right in the least time wins."
--
-- Ranking used to be accuracy-absolute (a 10/10 always beat a 9/10). It is now
-- a single number, so a pathologically slow perfect game can lose to a fast
-- 9/10. The maths here MUST stay in step with src/lib/scoring.ts:
--
--   score = max(0, correct_count * CORRECT_POINTS - seconds * POINTS_PER_SECOND)
--   CORRECT_POINTS    = 1000
--   POINTS_PER_SECOND = 8      -- one correct answer is worth ~125 seconds
--
-- If you retune those two constants, change them in BOTH places.
-- Idempotent: safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The score itself: generated + stored, so the DB is the single authority
--    and the leaderboard can be ordered and indexed on it.
-- ---------------------------------------------------------------------------
alter table public.attempts
  add column if not exists score integer
    generated always as (
      greatest(
        0,
        coalesce(correct_count, 0)::integer * 1000
          - round(coalesce(elapsed_ms, 0)::numeric / 1000.0 * 8)::integer
      )
    ) stored;

comment on column public.attempts.score is
  'Perkul score, generated: greatest(0, correct_count * 1000 - seconds * 8). Mirrors perkulScore() in src/lib/scoring.ts.';

-- ---------------------------------------------------------------------------
-- 2. Indexes. The ladder is now (score desc, elapsed_ms asc); the old
--    accuracy-first index no longer serves any query we run.
-- ---------------------------------------------------------------------------
create index if not exists attempts_score_leaderboard_idx
  on public.attempts (game_id, score desc, elapsed_ms asc)
  where is_ranked and completed_at is not null;

drop index if exists public.attempts_leaderboard_idx;

-- ---------------------------------------------------------------------------
-- 3. leaderboard_page(): order by score, and return it so the UI can show the
--    number it is being ranked on. Return type changes, so drop first.
-- ---------------------------------------------------------------------------
drop function if exists public.leaderboard_page(uuid, integer, integer, boolean);

create function public.leaderboard_page(
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
  score integer,
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
      a.score,
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
    row_number() over (order by score desc, elapsed_ms asc, completed_at asc) as rank,
    id, display_name, correct_count, elapsed_ms, score, is_simulated, is_registered
  from eligible
  order by rank
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- 4. attempt_rank(): same ordering. Row comparison is lexicographic, so this
--    reads as "score desc, then elapsed_ms asc" exactly like above.
-- ---------------------------------------------------------------------------
create or replace function public.attempt_rank(p_attempt_id uuid, p_include_simulated boolean default false)
returns table (rank bigint, total bigint)
language sql stable security definer set search_path = public as $$
  with me as (
    select a.game_id, a.score, a.elapsed_ms, a.completed_at
    from public.attempts a where a.id = p_attempt_id
  ),
  pool as (
    select a.score, a.elapsed_ms, a.completed_at
    from public.attempts a, me
    where a.game_id = me.game_id
      and a.is_ranked
      and a.completed_at is not null
      and a.integrity_status = 'valid'
      and (p_include_simulated or not a.is_simulated)
  )
  select
    (select count(*) + 1 from pool p, me
      where (p.score, -p.elapsed_ms) > (me.score, -me.elapsed_ms)) as rank,
    (select count(*) from pool) as total;
$$;

grant execute on function public.leaderboard_page(uuid, integer, integer, boolean) to anon, authenticated;
grant execute on function public.attempt_rank(uuid, boolean) to anon, authenticated;

-- Let PostgREST see the new column and the new function signature.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Sanity check (run by hand after applying; expects the fast 9/10 to win):
--
--   select correct_count, elapsed_ms, score
--   from (values (10, 3600000), (9, 60000)) as v(correct_count, elapsed_ms)
--   cross join lateral (
--     select greatest(0, v.correct_count * 1000
--                        - round(v.elapsed_ms / 1000.0 * 8)::int) as score
--   ) s
--   order by score desc;
--   -- => 9 / 60000 / 8520  then  10 / 3600000 / 0
-- ---------------------------------------------------------------------------
