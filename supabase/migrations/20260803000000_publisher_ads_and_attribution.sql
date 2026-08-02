-- Embeddable widget, round two: ads opt-in and real attribution enforcement.
--
-- The credit link in the copy-paste snippet is the entire backlink deal, and a
-- publisher can always delete an HTML paragraph after the fact. The only real
-- enforcement point is server-side: periodically re-fetch the page the widget
-- is actually running on and check the raw HTML for the link. This migration
-- adds the columns that decision needs and the table that tells the crawler
-- what to fetch.

alter table public.publishers
  add column if not exists ads_enabled boolean not null default false,
  add column if not exists attribution_grace_until timestamptz;

comment on column public.publishers.ads_enabled is
  'Per-publisher opt-in for ads inside the embed. Only ever flipped on for a publisher who agreed to a revenue split -- never a blanket default, because the ad slot sits inside someone else''s page.';
comment on column public.publishers.attribution_grace_until is
  'Set once, the first time the attribution crawler finds the credit link missing on every known page. The embed keeps working until this passes; still missing once it does, and the embed pauses. Cleared back to null the moment the link is seen again.';

-- Pages a publisher has actually embedded on. We cannot crawl what we don't
-- know about, so the embed itself reports its parent page's URL back to us
-- on load (see src/app/api/embed/report/route.ts) and this is where that
-- lands. Validated server-side against allowed_origins before it is written,
-- so this table can never be seeded with someone else's URL.
create table if not exists public.publisher_pages (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references public.publishers(id) on delete cascade,
  url text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  attribution_found boolean,
  unique (publisher_id, url)
);

comment on table public.publisher_pages is
  'One row per distinct URL a publisher has embedded the widget on. attribution_found is set by the attribution crawler, not by the embed itself -- the embed only ever reports where it is running, never whether the credit link is present, because that check has to happen server-side against the real page HTML to mean anything.';

create index if not exists publisher_pages_publisher_id_idx on public.publisher_pages (publisher_id);

-- Server-only, same reasoning as publishers itself.
alter table public.publisher_pages enable row level security;
