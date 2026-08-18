-- 04 — المواعيد: أدوار خادمية صارمة (طالب/مقدّم خدمة) ومنع تأكيد الطالب لموعده.
-- مستقل عن 01/02 (لا يعتمد على مولّد المراجع). آمن للتشغيل المتكرر.

alter table public.appointments
  add column if not exists requester_user_id  uuid,
  add column if not exists pending_party      text,
  add column if not exists confirmed_at       timestamptz,
  add column if not exists cancelled_at       timestamptz,
  add column if not exists postponed_at       timestamptz,
  add column if not exists previous_starts_at timestamptz,
  add column if not exists last_proposed_by   uuid;

do $$ begin
  alter table public.appointments
    add constraint appointments_pending_party_chk
    check (pending_party is null or pending_party in ('requester','provider'));
exception when duplicate_object then null; end $$;

update public.appointments
   set pending_party = 'provider'
 where pending_party is null and status in ('proposed','postponed');

-- ---------- سجل زمني/تدقيق ----------
create table if not exists public.appointment_events (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  actor_user_id  uuid,
  actor_side     text not null check (actor_side in ('requester','provider','system')),
  action         text not null check (action in ('proposed','confirmed','rescheduled','cancelled','completed')),
  from_starts_at timestamptz,
  to_starts_at   timestamptz,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists appointment_events_appointment_idx
  on public.appointment_events(appointment_id, created_at desc);

grant select on public.appointment_events to authenticated;
grant all on public.appointment_events to service_role;
revoke insert, update, delete, truncate on public.appointment_events from anon, authenticated;
revoke select on public.appointment_events from anon;
alter table public.appointment_events enable row level security;

-- ---------- تحديد جهة المستخدم من الموعد ----------
create or replace function private.appt_side(_uid uuid, _a public.appointments)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare v_requester boolean; v_provider boolean;
begin
  if _uid is null then return null; end if;

  v_requester := (_a.requester_user_id = _uid)
    or (_a.requester_entity_id is not null and private.is_active_member(_uid, _a.requester_entity_id));
  v_provider := private.is_active_member(_uid, _a.provider_entity_id);

  -- مُنشئ الموعد يبقى دائمًا في جهة الطلب مهما كانت عضوياته الأخرى.
  if _a.created_by = _uid and v_requester then return 'requester'; end if;
  if v_requester and v_provider then return 'requester'; end if; -- الأضيق صلاحية
  if v_provider then return 'provider'; end if;
  if v_requester then return 'requester'; end if;
  return null;
end;
$$;

revoke all on function private.appt_side(uuid, public.appointments) from public, anon;
grant execute on function private.appt_side(uuid, public.appointments) to authenticated;

drop policy if exists "appointment_events_party_select" on public.appointment_events;
create policy "appointment_events_party_select"
  on public.appointment_events for select to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_events.appointment_id
        and private.appt_side(auth.uid(), a) is not null
    )
  );

-- ---------- التأكيد: ممنوع على الطالب/المُنشئ ----------
create or replace function public.confirm_appointment(_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype; v_side text; p record;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_side := private.appt_side(auth.uid(), a);
  if v_side is null then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('proposed','postponed') then raise exception 'APPOINTMENT_NOT_PROPOSED'; end if;

  if a.created_by = auth.uid() or a.last_proposed_by = auth.uid() then
    raise exception 'CONFIRM_BY_REQUESTER_FORBIDDEN';
  end if;
  if v_side <> coalesce(a.pending_party, 'provider') then
    raise exception 'CONFIRM_NOT_YOUR_TURN';
  end if;

  update public.appointments
     set status = 'confirmed', confirmed_at = now(), pending_party = null, updated_at = now()
   where id = _appointment_id;

  insert into public.appointment_events(appointment_id, actor_user_id, actor_side, action, to_starts_at)
  values (_appointment_id, auth.uid(), v_side, 'confirmed', a.starts_at);

  for p in select user_id, entity_id from public.appointment_participants where appointment_id = _appointment_id loop
    perform private.emit_notification(p.user_id, 'appointment.confirmed', null, p.entity_id,
      'appointment', _appointment_id, jsonb_build_object('title', a.title, 'starts_at', a.starts_at),
      'confirmed', 'info');
  end loop;
end;
$$;

revoke all on function public.confirm_appointment(uuid) from public, anon;
grant execute on function public.confirm_appointment(uuid) to authenticated;

-- ---------- إعادة الجدولة: الحالة تعود «بانتظار الموافقة» من الطرف الآخر ----------
create or replace function public.reschedule_appointment(
  _appointment_id uuid,
  _new_starts_at timestamptz,
  _reason text default null
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype; v_side text; v_other text; p record;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_side := private.appt_side(auth.uid(), a);
  if v_side is null then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('proposed','postponed','confirmed') then raise exception 'APPOINTMENT_STATE_INVALID'; end if;
  if _new_starts_at <= now() then raise exception 'APPOINTMENT_IN_THE_PAST'; end if;

  v_other := case when v_side = 'requester' then 'provider' else 'requester' end;

  update public.appointments
     set previous_starts_at = starts_at,
         starts_at = _new_starts_at,
         cancel_deadline_at = case when cancel_deadline_at is not null
                                   then _new_starts_at - (starts_at - cancel_deadline_at) end,
         status = 'postponed',
         postponed_at = now(),
         confirmed_at = null,
         pending_party = v_other,
         last_proposed_by = auth.uid(),
         updated_at = now()
   where id = _appointment_id;

  insert into public.appointment_events(appointment_id, actor_user_id, actor_side, action,
                                        from_starts_at, to_starts_at, note)
  values (_appointment_id, auth.uid(), v_side, 'rescheduled', a.starts_at, _new_starts_at, _reason);

  update public.duration_timers
     set due_at = _new_starts_at - interval '1 hour', state = 'running', stopped_at = null
   where subject_kind = 'appointment' and subject_id = _appointment_id;

  for p in select user_id, entity_id from public.appointment_participants where appointment_id = _appointment_id loop
    perform private.emit_notification(p.user_id, 'appointment.rescheduled', null, p.entity_id,
      'appointment', _appointment_id,
      jsonb_build_object('title', a.title, 'starts_at', _new_starts_at, 'previous_starts_at', a.starts_at),
      'postponed', 'info');
  end loop;
end;
$$;

revoke all on function public.reschedule_appointment(uuid, timestamptz, text) from public, anon;
grant execute on function public.reschedule_appointment(uuid, timestamptz, text) to authenticated;

-- ---------- الإلغاء: لطرفي الموعد فقط (يدعم الطالب الشخصي) ----------
create or replace function public.cancel_appointment(_appointment_id uuid, _reason text default null)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype; v_side text; p record;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_side := private.appt_side(auth.uid(), a);
  if v_side is null then raise exception 'FORBIDDEN'; end if;
  if a.status in ('cancelled','completed','no_show') then raise exception 'APPOINTMENT_NOT_CANCELLABLE'; end if;
  if a.cancel_deadline_at is not null and now() > a.cancel_deadline_at then
    raise exception 'APPOINTMENT_CANCEL_WINDOW_PASSED';
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
         cancel_reason = _reason, pending_party = null, updated_at = now()
   where id = _appointment_id;

  insert into public.appointment_events(appointment_id, actor_user_id, actor_side, action, from_starts_at, note)
  values (_appointment_id, auth.uid(), v_side, 'cancelled', a.starts_at, _reason);

  update public.duration_timers set state = 'stopped', stopped_at = now()
   where subject_kind = 'appointment' and subject_id = _appointment_id;

  for p in select user_id, entity_id from public.appointment_participants where appointment_id = _appointment_id loop
    perform private.emit_notification(p.user_id, 'appointment.cancelled', null, p.entity_id,
      'appointment', _appointment_id, jsonb_build_object('title', a.title, 'reason', _reason),
      'cancelled', 'info');
  end loop;
end;
$$;

revoke all on function public.cancel_appointment(uuid, text) from public, anon;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;

-- ---------- قائمة مواعيدي مع الدور الخادمي ----------
create or replace function public.list_my_appointments()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare v_rows json;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  select coalesce(json_agg(row_to_json(x) order by x.starts_at), '[]'::json) into v_rows
  from (
    select a.id, a.title, a.kind, a.status, a.starts_at, a.previous_starts_at,
           a.cancel_deadline_at, a.confirmed_at,
           private.appt_side(auth.uid(), a) as my_side,
           coalesce(a.pending_party,
                    case when a.status in ('proposed','postponed') then 'provider' end) as pending_party,
           (private.appt_side(auth.uid(), a) = coalesce(a.pending_party, 'provider')
            and a.status in ('proposed','postponed')
            and a.created_by is distinct from auth.uid()
            and a.last_proposed_by is distinct from auth.uid()) as can_confirm,
           (a.status in ('proposed','postponed','confirmed')) as can_cancel,
           (a.status in ('proposed','postponed','confirmed')) as can_reschedule
    from public.appointments a
    where private.appt_side(auth.uid(), a) is not null
    order by a.starts_at
    limit 200
  ) x;

  return v_rows;
end;
$$;

revoke all on function public.list_my_appointments() from public, anon;
grant execute on function public.list_my_appointments() to authenticated;

-- ---------- سجل موعد واحد ----------
create or replace function public.appointment_timeline(_appointment_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if private.appt_side(auth.uid(), a) is null then raise exception 'FORBIDDEN'; end if;

  return coalesce((
    select json_agg(json_build_object(
      'action', e.action, 'actor_side', e.actor_side,
      'from_starts_at', e.from_starts_at, 'to_starts_at', e.to_starts_at,
      'note', e.note, 'created_at', e.created_at
    ) order by e.created_at desc)
    from public.appointment_events e where e.appointment_id = _appointment_id
  ), '[]'::json);
end;
$$;

revoke all on function public.appointment_timeline(uuid) from public, anon;
grant execute on function public.appointment_timeline(uuid) to authenticated;
