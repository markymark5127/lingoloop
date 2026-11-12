-- Accounts created before the signup trigger existed have no profile rows, which makes
-- onboarding loop (its UPDATE matches nothing). Create the missing rows; safe to re-run.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

insert into public.learning_profiles (user_id, native_language)
select u.id, case when u.raw_user_meta_data->>'locale' = 'ja' then 'ja' else 'en' end
from auth.users u
on conflict (user_id) do nothing;
