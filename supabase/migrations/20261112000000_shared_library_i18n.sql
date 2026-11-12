-- Shared content library, AI output caches, and Japanese-speaking learners.
--
-- 1. Generated videos/stories are published to a shared library (is_public = true) so the next
--    learner at the same level/genre gets an existing item instead of a new AI generation.
--    Every item stores translations for all supported native languages side by side.
-- 2. tts_cache / ai_lookup_cache memoize paid AI calls (speech synthesis, word lookups).
--    They are server-only: RLS on, no client policies.
-- 3. Vocabulary gets Japanese glosses; new users inherit the UI language they signed up in.

-- ---------------------------------------------------------------- vocabulary (ja)
alter table public.vocabulary_items
  add column if not exists translation_ja text,
  add column if not exists example_translation_ja text;

-- ---------------------------------------------------------------- library lookups
create index if not exists content_items_library_idx
  on public.content_items (kind, cefr, genre, created_at desc)
  where status = 'ready' and is_public;

-- ---------------------------------------------------------------- AI caches (server only)
create table if not exists public.tts_cache (
  hash text primary key,              -- sha256(model|voice|text)
  text text not null,
  voice text not null,
  storage_path text not null,
  bytes int not null default 0,
  hits int not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

create table if not exists public.ai_lookup_cache (
  word text not null,                 -- normalized surface form
  native_language text not null,
  lemma text not null,
  translation text not null,
  part_of_speech text not null default 'other',
  hits int not null default 0,
  created_at timestamptz not null default now(),
  primary key (word, native_language)
);

alter table public.tts_cache enable row level security;
alter table public.ai_lookup_cache enable row level security;
revoke all on public.tts_cache from anon, authenticated;
revoke all on public.ai_lookup_cache from anon, authenticated;

-- ---------------------------------------------------------------- signup language
alter table public.learning_profiles drop constraint if exists learning_profiles_native_language_check;
alter table public.learning_profiles add constraint learning_profiles_native_language_check
  check (native_language in ('en', 'ja'));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.learning_profiles (user_id, native_language)
  values (new.id, case when new.raw_user_meta_data->>'locale' = 'ja' then 'ja' else 'en' end);
  return new;
end $$;
