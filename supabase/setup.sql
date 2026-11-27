create table if not exists public.planning_workspace (
  id integer primary key check (id = 1),
  payload jsonb,
  version bigint not null default 0
);
alter table public.planning_workspace enable row level security;
revoke all on public.planning_workspace from public, anon, authenticated;
grant select, insert, update on public.planning_workspace to service_role;
insert into public.planning_workspace (id) values (1) on conflict do nothing;

create table if not exists public.planning_login_attempts (
  email text primary key,
  started_at timestamptz not null,
  attempts integer not null
);
alter table public.planning_login_attempts enable row level security;
revoke all on public.planning_login_attempts from public, anon, authenticated;

create or replace function public.planning_allow_login(account text)
returns boolean language sql security definer set search_path = '' as $$
  insert into public.planning_login_attempts as limit_row (email, started_at, attempts)
  values (account, now(), 1)
  on conflict (email) do update set
    attempts = case when limit_row.started_at <= now() - interval '5 minutes' then 1 else least(limit_row.attempts + 1, 11) end,
    started_at = case when limit_row.started_at <= now() - interval '5 minutes' then now() else limit_row.started_at end
  returning attempts <= 10;
$$;
revoke all on function public.planning_allow_login(text) from public, anon, authenticated;
grant execute on function public.planning_allow_login(text) to service_role;
