update users set locale = 'id' where locale is null;

alter table users
  alter column locale set default 'id',
  alter column locale set not null;
