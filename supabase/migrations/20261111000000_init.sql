-- LingoLoop initial schema
-- Security model:
--   * The browser only talks to Supabase for authentication. All data access goes through
--     Next.js route handlers that verify the session server-side.
--   * RLS is still enabled on every table as defense in depth: authenticated users can read
--     only their own rows, and can only write low-risk rows (profile, preferences, progress).
--   * Integrity-sensitive writes (game attempts, mastery, learning events) are performed by the
--     server with the service role after validating the answer.
--   * Secret game answers are excluded from client SELECT via column privileges.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- users
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.learning_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  native_language text not null default 'en',
  target_language text not null default 'es',
  level text not null default 'A1' check (level in ('A1','A2','B1','B2','C1','C2')),
  interests text[] not null default '{}',
  daily_goal_minutes int not null default 10 check (daily_goal_minutes between 1 and 240),
  onboarded boolean not null default false,
  show_translations boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create profile rows automatically on signup.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.learning_profiles (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- content
create table public.vocabulary_items (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'es',
  lemma text not null,
  translation text not null,
  part_of_speech text not null default 'noun',
  article text,
  emoji text,
  cefr text not null default 'A1',
  forms text[] not null default '{}',
  example text,
  example_translation text,
  created_at timestamptz not null default now(),
  unique (language, lemma)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('video','story')),
  language text not null default 'es',
  title text not null,
  genre text not null,
  cefr text not null default 'A1',
  summary text,
  series text,
  series_order int,
  body jsonb not null,
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  is_public boolean not null default true,
  created_by uuid references auth.users on delete set null,
  source text not null default 'starter',
  created_at timestamptz not null default now()
);
create index on public.content_items (kind, status, language);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items on delete cascade,
  kind text not null check (kind in ('video','audio','image','subtitles','poster')),
  storage_path text not null,
  public_url text,
  mime_type text,
  duration_ms int,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.media_assets (content_id);

create table public.content_vocabulary (
  content_id uuid not null references public.content_items on delete cascade,
  vocab_id uuid not null references public.vocabulary_items on delete cascade,
  role text not null default 'reinforced' check (role in ('introduced','reinforced')),
  primary key (content_id, vocab_id)
);

-- ---------------------------------------------------------------- per-user learning state
create table public.user_vocabulary (
  user_id uuid not null references auth.users on delete cascade,
  vocab_id uuid not null references public.vocabulary_items on delete cascade,
  saved boolean not null default false,
  exposures int not null default 0,
  recognition real not null default 0,
  listening real not null default 0,
  production real not null default 0,
  ease real not null default 2.5,
  interval_days real not null default 0,
  repetitions int not null default 0,
  due_at timestamptz,
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  last_seen_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, vocab_id)
);
create index on public.user_vocabulary (user_id, due_at);

create table public.content_progress (
  user_id uuid not null references auth.users on delete cascade,
  content_id uuid not null references public.content_items on delete cascade,
  position real not null default 0,
  completed boolean not null default false,
  bookmarked boolean not null default false,
  liked boolean not null default false,
  skipped boolean not null default false,
  quiz_correct int not null default 0,
  quiz_total int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create table public.game_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  game_type text not null,
  difficulty int not null default 1,
  payload jsonb not null,
  answer jsonb not null,           -- secret: not selectable by clients
  vocab_ids uuid[] not null default '{}',
  source text not null default 'engine',
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.game_instances (user_id, created_at desc);

create table public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game_instances on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  response jsonb not null,
  correct boolean not null,
  time_ms int,
  created_at timestamptz not null default now()
);
create index on public.game_attempts (user_id, created_at desc);

create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  scenario text not null,
  character_name text not null,
  level text not null,
  status text not null default 'active' check (status in ('active','ended')),
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversation_sessions (user_id, created_at desc);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  translation text,
  feedback jsonb,
  via_voice boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.conversation_messages (session_id, created_at);

create table public.learning_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  activity text not null check (activity in ('video','story','game','talk','review')),
  event_type text not null,
  content_id uuid references public.content_items on delete set null,
  vocab_id uuid references public.vocabulary_items on delete set null,
  skill text,
  correct boolean,
  seconds int not null default 0 check (seconds between 0 and 600),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.learning_events (user_id, created_at desc);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  kind text not null check (kind in ('video','story')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  input jsonb not null default '{}',
  content_id uuid references public.content_items on delete set null,
  progress int not null default 0,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index on public.generation_jobs (status, created_at);

-- Atomically claim the next queued job (used by the media worker with the service role).
create function public.claim_generation_job() returns setof public.generation_jobs
language sql security definer set search_path = '' as $$
  update public.generation_jobs j
     set status = 'running', started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from public.generation_jobs
      where status = 'queued' or (status = 'running' and started_at < now() - interval '10 minutes' and attempts < 3)
      order by created_at
      limit 1
      for update skip locked)
  returning j.*;
$$;
revoke all on function public.claim_generation_job() from public, anon, authenticated;
grant execute on function public.claim_generation_job() to service_role;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.learning_profiles enable row level security;
alter table public.vocabulary_items enable row level security;
alter table public.content_items enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_vocabulary enable row level security;
alter table public.user_vocabulary enable row level security;
alter table public.content_progress enable row level security;
alter table public.game_instances enable row level security;
alter table public.game_attempts enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.learning_events enable row level security;
alter table public.generation_jobs enable row level security;

-- Own profile / preferences: read + update.
create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own prefs read" on public.learning_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own prefs update" on public.learning_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Shared content: published content is readable by any signed-in user; private generated
-- content only by its creator.
create policy "vocab read" on public.vocabulary_items for select to authenticated using (true);
create policy "content read" on public.content_items for select to authenticated
  using (is_public or created_by = (select auth.uid()));
create policy "media read" on public.media_assets for select to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_id and (c.is_public or c.created_by = (select auth.uid()))));
create policy "content vocab read" on public.content_vocabulary for select to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_id and (c.is_public or c.created_by = (select auth.uid()))));

-- Own learning data: read-only to clients (server writes with service role after validation).
create policy "own vocab read" on public.user_vocabulary for select to authenticated using (user_id = (select auth.uid()));
create policy "own progress read" on public.content_progress for select to authenticated using (user_id = (select auth.uid()));
create policy "own progress write" on public.content_progress for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own progress update" on public.content_progress for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own games read" on public.game_instances for select to authenticated using (user_id = (select auth.uid()));
create policy "own attempts read" on public.game_attempts for select to authenticated using (user_id = (select auth.uid()));
create policy "own sessions read" on public.conversation_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "own messages read" on public.conversation_messages for select to authenticated using (user_id = (select auth.uid()));
create policy "own events read" on public.learning_events for select to authenticated using (user_id = (select auth.uid()));
create policy "own jobs read" on public.generation_jobs for select to authenticated using (user_id = (select auth.uid()) or user_id is null);

-- Hide secret answers from clients even for their own games.
revoke select on public.game_instances from anon, authenticated;
grant select (id, user_id, game_type, difficulty, payload, vocab_ids, source, answered_at, created_at)
  on public.game_instances to authenticated;

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;
