-- users.locale held 'id' for every account whether or not the user ever
-- chose a language: the column defaulted to 'id' and every create path
-- wrote it. Clients now render in the user's preference ahead of the
-- school's language, so that default made every account of an
-- English-language school render in Indonesian.
--
-- NULL now means "no preference, follow the school's language". Accounts
-- still at the old default never chose (the profile page was the only way
-- to pick, and it always showed the school's language), so they go back
-- to NULL. An explicit 'en' is kept.
alter table users
  alter column locale drop not null,
  alter column locale drop default;

update users set locale = null where locale = 'id';
