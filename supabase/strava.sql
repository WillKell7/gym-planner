-- Strava sync. Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It is safe to run again. (Run supabase/schema.sql first if you haven't.)

-- 1. Runs copied from Strava. Only the "strava" Edge Function writes here;
--    the app reads it and adds new runs to your log.
create table if not exists public.strava_runs (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  id         bigint      not null,              -- the Strava activity id
  data       jsonb       not null,              -- {name, date, km, sec, hr, ...}
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
grant select on public.strava_runs to authenticated;
grant select, insert, update, delete on public.strava_runs to service_role;
alter table public.strava_runs enable row level security;
drop policy if exists "read own strava runs" on public.strava_runs;
create policy "read own strava runs" on public.strava_runs for select using (auth.uid() = user_id);

do $$ begin
  alter publication supabase_realtime add table public.strava_runs;
exception when duplicate_object then null; end $$;

-- 2. Your Strava sign-in tokens. Only the Edge Function can read these:
--    the app and the public key have no access at all.
create table if not exists public.strava_tokens (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  athlete_id    bigint      not null unique,
  athlete_name  text,
  access_token  text        not null,
  refresh_token text        not null,
  expires_at    bigint      not null,           -- seconds since 1970
  scope         text,
  last_sync     timestamptz,
  updated_at    timestamptz not null default now()
);
revoke all on public.strava_tokens from anon, authenticated;
grant select, insert, update, delete on public.strava_tokens to service_role;
alter table public.strava_tokens enable row level security;  -- no policies on purpose
