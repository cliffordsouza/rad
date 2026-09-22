-- People can lack an email (celebrated by name only), so email can't be the PK.
drop table if exists people;
create table people (
  id bigserial primary key,
  email text unique,           -- nullable; Postgres allows multiple NULLs
  name text not null,
  loc text,
  dob_day int, dob_month int,
  doj_day int, doj_month int, doj_year int
);
alter table people enable row level security;
