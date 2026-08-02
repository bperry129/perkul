-- Seeds the "demo" publisher used by the live embed on /for-publishers.
--
-- /embed/daily?k=demo needs a real row to render at all (embed/daily/page.tsx
-- refuses to play a game for an unknown key even though CSP's frame-ancestors
-- always allows 'self' regardless — see the long comment on frameAncestors()
-- in src/lib/publishers.ts for why those are two separate decisions). This is
-- the one publisher allowed to frame perkul.com itself, since it exists only
-- to demonstrate the widget on our own landing page.
insert into public.publishers (key, name, allowed_origins, active, attribution_ok, notes)
values (
  'demo',
  'Perkul (self-demo on /for-publishers)',
  array['https://perkul.com', 'https://www.perkul.com', 'http://localhost:3000'],
  true,
  true,
  'Reserved key powering the live demo embed on /for-publishers. Not a real publisher — do not hand this key out.'
)
on conflict (key) do update set
  allowed_origins = excluded.allowed_origins,
  active = true;
