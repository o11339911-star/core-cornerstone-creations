-- ============ hardening: call_sessions ============
alter table public.call_sessions drop constraint if exists call_sessions_status_chk;
alter table public.call_sessions add constraint call_sessions_status_chk
  check (status in ('ringing','accepted','declined','missed','ended','cancelled'));

alter table public.call_sessions drop constraint if exists call_sessions_end_reason_chk;
alter table public.call_sessions add constraint call_sessions_end_reason_chk
  check (end_reason is null or end_reason in ('hangup','declined','missed','failed','cancelled'));

-- one active session per appointment
drop index if exists public.call_sessions_active_uniq;
create unique index call_sessions_active_uniq
  on public.call_sessions (appointment_id)
  where status in ('ringing','accepted');

-- link to auth users
alter table public.call_sessions drop constraint if exists call_sessions_caller_user_fk;
alter table public.call_sessions add constraint call_sessions_caller_user_fk
  foreign key (caller_user_id) references auth.users(id) on delete cascade;

alter table public.call_sessions drop constraint if exists call_sessions_answered_user_fk;
alter table public.call_sessions add constraint call_sessions_answered_user_fk
  foreign key (answered_user_id) references auth.users(id) on delete set null;

-- ============ state machine ============
create or replace function private.enforce_call_session_flow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if new.appointment_id is distinct from old.appointment_id
     or new.caller_entity_id is distinct from old.caller_entity_id
     or new.callee_entity_id is distinct from old.callee_entity_id
     or new.caller_user_id is distinct from old.caller_user_id
     or new.answered_user_id is distinct from old.answered_user_id
     or new.started_at is distinct from old.started_at
     or new.accepted_at is distinct from old.accepted_at
     or new.ended_at is distinct from old.ended_at
     or new.duration_seconds is distinct from old.duration_seconds
     or new.created_at is distinct from old.created_at then
    raise exception 'call session identity and timing fields are immutable';
  end if;

  if new.status is not distinct from old.status then
    new.end_reason := old.end_reason;
    new.updated_at := statement_timestamp();
    return new;
  end if;

  if old.status = 'ringing' and new.status in ('accepted','declined') then
    if v_uid is null or not private.is_active_member(v_uid, old.callee_entity_id) then
      raise exception 'only an active member of the callee entity may answer';
    end if;
    if new.status = 'accepted' then
      new.answered_user_id := v_uid;
      new.accepted_at := statement_timestamp();
      new.end_reason := null;
    else
      new.answered_user_id := v_uid;
      new.ended_at := statement_timestamp();
      new.duration_seconds := 0;
      new.end_reason := 'declined';
    end if;

  elsif old.status = 'ringing' and new.status in ('ended','cancelled') then
    if v_uid is null or v_uid is distinct from old.caller_user_id then
      raise exception 'only the caller may cancel a ringing call';
    end if;
    new.ended_at := statement_timestamp();
    new.duration_seconds := 0;
    new.end_reason := coalesce(nullif(new.end_reason, 'declined'), 'cancelled');

  elsif old.status = 'ringing' and new.status = 'missed' then
    if old.started_at > statement_timestamp() - interval '60 seconds' then
      raise exception 'a ringing call may only be marked missed after 60 seconds';
    end if;
    if v_uid is null
       or not (private.is_active_member(v_uid, old.caller_entity_id)
               or private.is_active_member(v_uid, old.callee_entity_id)) then
      raise exception 'not a participant of this call';
    end if;
    new.ended_at := statement_timestamp();
    new.duration_seconds := 0;
    new.end_reason := 'missed';

  elsif old.status = 'accepted' and new.status = 'ended' then
    if v_uid is null
       or (v_uid is distinct from old.caller_user_id
           and v_uid is distinct from old.answered_user_id) then
      raise exception 'only the two call participants may end this call';
    end if;
    new.ended_at := statement_timestamp();
    new.duration_seconds := greatest(
      0, extract(epoch from (statement_timestamp() - old.accepted_at))::int);
    new.end_reason := case when new.end_reason = 'failed' then 'failed' else 'hangup' end;

  else
    raise exception 'invalid call status transition % -> %', old.status, new.status;
  end if;

  if new.status in ('declined','missed','ended','cancelled') then
    delete from public.call_signals where call_id = new.id;
  end if;

  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke execute on function private.enforce_call_session_flow() from public, anon, authenticated;

-- ============ hardening: call_signals ============
drop policy if exists call_signals_delete on public.call_signals;
drop policy if exists call_signals_select on public.call_signals;
drop policy if exists call_signals_insert on public.call_signals;

revoke delete on public.call_signals from anon, authenticated;

alter table public.call_signals drop constraint if exists call_signals_payload_shape_chk;
alter table public.call_signals add constraint call_signals_payload_shape_chk check (
  case kind
    when 'offer'  then jsonb_typeof(payload->'sdp') = 'string' and jsonb_typeof(payload->'type') = 'string'
    when 'answer' then jsonb_typeof(payload->'sdp') = 'string' and jsonb_typeof(payload->'type') = 'string'
    when 'ice'    then jsonb_typeof(payload->'candidate') = 'object'
    when 'hangup' then payload = '{}'::jsonb
    else false
  end
);

create policy call_signals_select on public.call_signals
for select to authenticated
using (
  exists (
    select 1 from public.call_sessions cs
    where cs.id = call_id
      and (auth.uid() = cs.caller_user_id or auth.uid() = cs.answered_user_id)
  )
);

create policy call_signals_insert on public.call_signals
for insert to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from public.call_sessions cs
    where cs.id = call_id
      and cs.status in ('ringing','accepted')
      and (
        (kind = 'offer'
          and auth.uid() = cs.caller_user_id
          and sender_entity_id = cs.caller_entity_id)
        or (kind = 'answer'
          and cs.status = 'accepted'
          and auth.uid() = cs.answered_user_id
          and sender_entity_id = cs.callee_entity_id)
        or (kind = 'ice'
          and (
            (auth.uid() = cs.caller_user_id and sender_entity_id = cs.caller_entity_id)
            or (cs.status = 'accepted' and auth.uid() = cs.answered_user_id
                and sender_entity_id = cs.callee_entity_id)
          ))
        or (kind = 'hangup'
          and (auth.uid() = cs.caller_user_id or auth.uid() = cs.answered_user_id))
      )
  )
);