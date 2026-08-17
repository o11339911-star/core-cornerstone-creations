create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  subject_hash text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);

revoke all on public.auth_security_events from anon, authenticated;
grant all on public.auth_security_events to service_role;

alter table public.auth_security_events enable row level security;

create index if not exists auth_security_events_created_idx
  on public.auth_security_events (created_at desc);