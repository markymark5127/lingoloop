-- Japanese as a second target language (English speakers can learn Spanish or Japanese).
--
-- Japanese target-language text is stored with spaces between words ("猫 は ベッド で 寝ています。")
-- so the UI can make each word tappable and build word-order games; the spaces are hidden when
-- displayed. `reading` holds the matching kana, word-for-word, for romaji/kana reading aids.

-- ---------------------------------------------------------------- vocabulary readings
alter table public.vocabulary_items
  add column if not exists reading text,
  add column if not exists example_reading text;

-- ---------------------------------------------------------------- profiles
alter table public.learning_profiles drop constraint if exists learning_profiles_target_language_check;
alter table public.learning_profiles add constraint learning_profiles_target_language_check
  check (target_language in ('es', 'ja'));
-- Level per target language, so switching languages restores where you were: {"es":"A2","ja":"A1"}
alter table public.learning_profiles add column if not exists levels jsonb not null default '{}';

-- ---------------------------------------------------------------- conversations
alter table public.conversation_sessions add column if not exists language text not null default 'es';
alter table public.conversation_messages add column if not exists reading text;

-- ---------------------------------------------------------------- library lookups by language
drop index if exists public.content_items_library_idx;
create index if not exists content_items_library_idx
  on public.content_items (language, kind, cefr, genre, created_at desc)
  where status = 'ready' and is_public;

-- ---------------------------------------------------------------- AI lookup cache per target language
alter table public.ai_lookup_cache add column if not exists language text not null default 'es';
alter table public.ai_lookup_cache drop constraint if exists ai_lookup_cache_pkey;
alter table public.ai_lookup_cache add primary key (language, word, native_language);
alter table public.ai_lookup_cache add column if not exists reading text;
