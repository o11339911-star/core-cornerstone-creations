
-- =============== call_sessions ===============
create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  caller_entity_id uuid not null references public.entities(id) on delete cascade,
  callee_entity_id uuid not null references public.entities(id) on delete cascade,
  caller_user_id uuid not null,
  answered_user_id uuid,
  status text not null default 'ringing',
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_sessions_status_chk check (status in ('ringing','accepted','declined','missed','ended')),
  constraint call_sessions_parties_chk check (caller_entity_id <> callee_entity_id)
);

create index call_sessions_callee_idx on public.call_sessions (callee_entity_id, status, started_at desc);
create index call_sessions_caller_idx on public.call_sessions (caller_entity_id, started_at desc);
create index call_sessions_appointment_idx on public.call_sessions (appointment_id);

grant select, insert, update on public.call_sessions to authenticated;
grant all on public.call_sessions to service_role;

alter table public.call_sessions enable row level security;

create policy call_sessions_select on public.call_sessions
for select to authenticated
using (
  private.is_active_member(auth.uid(), caller_entity_id)
  or private.is_active_member(auth.uid(), callee_entity_id)
);

create policy call_sessions_insert on public.call_sessions
for insert to authenticated
with check (
  caller_user_id = auth.uid()
  and private.is_active_member(auth.uid(), caller_entity_id)
  and exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and a.status = 'confirmed'
      and (
        (a.requester_entity_id = caller_entity_id and a.provider_entity_id = callee_entity_id)
        or (a.provider_entity_id = caller_entity_id and a.requester_entity_id = callee_entity_id)
      )
  )
);

create policy call_sessions_update on public.call_sessions
for update to authenticated
using (
  private.is_active_member(auth.uid(), caller_entity_id)
  or private.is_active_member(auth.uid(), callee_entity_id)
)
with check (
  private.is_active_member(auth.uid(), caller_entity_id)
  or private.is_active_member(auth.uid(), callee_entity_id)
);

-- immutability + state machine
create or replace function private.enforce_call_session_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.appointment_id is distinct from old.appointment_id
     or new.caller_entity_id is distinct from old.caller_entity_id
     or new.callee_entity_id is distinct from old.callee_entity_id
     or new.caller_user_id is distinct from old.caller_user_id
     or new.started_at is distinct from old.started_at then
    raise exception 'call session identity is immutable';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'ringing' and new.status in ('accepted','declined','missed','ended'))
      or (old.status = 'accepted' and new.status = 'ended')
    ) then
      raise exception 'invalid call status transition % -> %', old.status, new.status;
    end if;

    if new.status = 'accepted' then
      new.accepted_at := coalesce(new.accepted_at, now());
      new.answered_user_id := coalesce(new.answered_user_id, auth.uid());
    end if;

    if new.status in ('declined','missed','ended') then
      new.ended_at := coalesce(new.ended_at, now());
      new.duration_seconds := case
        when new.accepted_at is not null then greatest(0, extract(epoch from (new.ended_at - new.accepted_at))::int)
        else 0 end;
      delete from public.call_signals where call_id = new.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- =============== call_signals ===============
create table public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  sender_user_id uuid not null default auth.uid(),
  sender_entity_id uuid not null references public.entities(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint call_signals_kind_chk check (kind in ('offer','answer','ice','hangup')),
  constraint call_signals_payload_chk check (pg_column_size(payload) <= 16384)
);

create index call_signals_call_idx on public.call_signals (call_id, created_at);

grant select, insert, delete on public.call_signals to authenticated;
grant all on public.call_signals to service_role;

alter table public.call_signals enable row level security;

create policy call_signals_select on public.call_signals
for select to authenticated
using (
  exists (
    select 1 from public.call_sessions cs
    where cs.id = call_id
      and (private.is_active_member(auth.uid(), cs.caller_entity_id)
        or private.is_active_member(auth.uid(), cs.callee_entity_id))
  )
);

create policy call_signals_insert on public.call_signals
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and private.is_active_member(auth.uid(), sender_entity_id)
  and exists (
    select 1 from public.call_sessions cs
    where cs.id = call_id
      and cs.status in ('ringing','accepted')
      and (cs.caller_entity_id = sender_entity_id or cs.callee_entity_id = sender_entity_id)
      and (private.is_active_member(auth.uid(), cs.caller_entity_id)
        or private.is_active_member(auth.uid(), cs.callee_entity_id))
  )
);

create policy call_signals_delete on public.call_signals
for delete to authenticated
using (
  exists (
    select 1 from public.call_sessions cs
    where cs.id = call_id
      and (private.is_active_member(auth.uid(), cs.caller_entity_id)
        or private.is_active_member(auth.uid(), cs.callee_entity_id))
  )
);

create trigger call_sessions_flow
before update on public.call_sessions
for each row execute function private.enforce_call_session_flow();

-- =============== realtime ===============
alter table public.call_sessions replica identity full;
alter table public.call_signals replica identity full;
alter publication supabase_realtime add table public.call_sessions;
alter publication supabase_realtime add table public.call_signals;

-- =============== grants hygiene ===============
revoke truncate on public.call_sessions from anon, authenticated;
revoke delete on public.call_sessions from anon, authenticated;
revoke all on public.call_sessions from anon;
revoke all on public.call_signals from anon;
revoke truncate, update on public.call_signals from anon, authenticated;

revoke execute on function private.enforce_call_session_flow() from public;
grant execute on function private.is_active_member(uuid, uuid) to authenticated;
