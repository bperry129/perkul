-- Embeddable widget: the publisher registry.
--
-- A publisher is a site we have licensed the game to. The key is what appears
-- in their copy-paste snippet; allowed_origins is what the browser is told it
-- may frame us from. Attribution is a licence condition, so it is a column and
-- not a promise: a compliance crawler flips attribution_ok and the embed
-- degrades to a branded ribbon rather than silently losing us the backlink.

create table if not exists public.publishers (
  id uuid primary key default gen_random_uuid(),
  -- Public, appears in HTML on someone else's site. Not a secret: it names the
  -- account, and allowed_origins is what actually enforces anything.
  key text not null unique,
  name text not null,
  contact_email text,
  -- Scheme + host, no trailing slash: 'https://example.com'. Fed verbatim into
  -- a frame-ancestors CSP, so it is validated on write, never on read.
  allowed_origins text[] not null default '{}',
  active boolean not null default true,
  attribution_ok boolean not null default true,
  attribution_checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

comment on column public.publishers.key is
  'Public embed key. Safe to expose; allowed_origins does the enforcing.';
comment on column public.publishers.attribution_ok is
  'False when the parent page is missing its perkul.com credit link.';

-- Which embed a play came from. Null means it was played on perkul.com itself.
-- on delete set null: removing a publisher must never destroy gameplay history.
alter table public.attempts
  add column if not exists publisher_id uuid references public.publishers(id) on delete set null;

create index if not exists attempts_publisher_id_idx
  on public.attempts (publisher_id)
  where publisher_id is not null;

-- Server-only table. Every read goes through the service client in
-- src/lib/publishers.ts; nothing about a licence agreement belongs in a
-- browser, so RLS is on with no policies at all.
alter table public.publishers enable row level security;
