-- Tokyo-standard pitch accent for Japanese vocabulary (downstep mora; 0 = heiban). Powers the
-- pitch-accent game. Null when a word has common variants or isn't tagged.
alter table public.vocabulary_items add column if not exists pitch_accent smallint check (pitch_accent between 0 and 12);
