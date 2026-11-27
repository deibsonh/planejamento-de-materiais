create table if not exists public.planning_workspace (
  id integer primary key check (id = 1),
  payload jsonb,
  version bigint not null default 0
);
alter table public.planning_workspace enable row level security;
revoke all on public.planning_workspace from public, anon, authenticated;
grant select, insert, update on public.planning_workspace to service_role;
insert into public.planning_workspace (id) values (1) on conflict do nothing;
