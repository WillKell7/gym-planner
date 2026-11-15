-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It is safe to run again.

-- 1. Where the planner's data lives: one row per chunk (core, workouts, runs, ...) per user.
create table if not exists public.app_docs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Let signed-in users reach the table through the API (newer Supabase projects
-- don't do this automatically). The rules below still limit them to their own rows.
grant select, insert, update, delete on public.app_docs to authenticated;

-- 2. Each signed-in person can only see and change their own rows.
alter table public.app_docs enable row level security;
drop policy if exists "read own"   on public.app_docs;
drop policy if exists "add own"    on public.app_docs;
drop policy if exists "change own" on public.app_docs;
drop policy if exists "delete own" on public.app_docs;
create policy "read own"   on public.app_docs for select using (auth.uid() = user_id);
create policy "add own"    on public.app_docs for insert with check (auth.uid() = user_id);
create policy "change own" on public.app_docs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.app_docs for delete using (auth.uid() = user_id);

-- 3. Live updates between devices.
do $$ begin
  alter publication supabase_realtime add table public.app_docs;
exception when duplicate_object then null; end $$;

-- 4. Private bucket for check-in photos, one folder per user.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;
drop policy if exists "photos read own"   on storage.objects;
drop policy if exists "photos add own"    on storage.objects;
drop policy if exists "photos delete own" on storage.objects;
create policy "photos read own"   on storage.objects for select using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos add own"    on storage.objects for insert with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos delete own" on storage.objects for delete using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
