-- RAD production schema. Server code uses the service_role key (bypasses RLS);
-- RLS is enabled with no policies so the anon key can't read anything.

create table if not exists roles (
  email text primary key,
  role text not null check (role in ('admin','manager','viewer'))
);

create table if not exists config (
  id int primary key default 1,
  posting_enabled boolean not null default false,
  social_channel text not null default '#social',
  test_channel text not null default '#rad-test'
);
insert into config (id) values (1) on conflict do nothing;

create table if not exists people (
  email text primary key,
  name text not null,
  loc text,
  dob_day int, dob_month int,
  doj_day int, doj_month int, doj_year int
);

create table if not exists confluence_chunks (
  id text primary key,
  page_id text, title text, url text, space text, text text
);
create index if not exists confluence_chunks_space_idx on confluence_chunks(space);

create table if not exists sent (
  id text primary key,
  type text, channel text, "by" text,
  at timestamptz default now(),
  summary text, poll_id text, live boolean default false
);
create index if not exists sent_at_idx on sent(at desc);

create table if not exists pulses (
  id text primary key, question text, started_at timestamptz default now(), active boolean default true
);
create table if not exists pulse_responses (
  pulse_id text, user_id text, name text, score int, comment text, ts timestamptz default now(),
  primary key (pulse_id, user_id)
);
create table if not exists pulse_awaiting (
  user_id text primary key, pulse_id text, until bigint
);

create table if not exists townhalls (
  id text primary key, started_at timestamptz default now(), active boolean default true
);
create table if not exists townhall_responses (
  survey_id text, user_id text, name text, key text, rating int, ts timestamptz default now(),
  primary key (survey_id, user_id, key)
);

create table if not exists polls (
  id text primary key, question text, options jsonb, channel text,
  created_by text, created_at timestamptz default now(), ts text
);
create table if not exists poll_votes (
  poll_id text, user_id text, name text, opt_idx int, ts timestamptz default now(),
  primary key (poll_id, user_id)
);

-- Lock down: enable RLS everywhere (service_role bypasses; anon gets nothing).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
    and tablename in ('roles','config','people','confluence_chunks','sent','pulses',
    'pulse_responses','pulse_awaiting','townhalls','townhall_responses','polls','poll_votes')
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
