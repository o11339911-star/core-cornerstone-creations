-- 02 — المواعيد: مرجع Rakiz، حالة «مؤجل»، الحجز باسم حساب شخصي، وتحقق آمن بالمرجع.
-- يعتمد على 01_platform_references.sql.

alter table public.appointments
  add column if not exists reference       text unique,
  add column if not exists postponed_at    timestamptz,
  add column if not exists previous_starts_at timestamptz,
  add column if not exists confirmed_at    timestamptz,
  add column if not exists completed_at    timestamptz,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists requester_user_id uuid;

-- الحجز الشخصي: الطالب إما كيان أو مستخدم، وليس كليهما ولا لا شيء.
alter table public.appointments alter column requester_entity_id drop not null;
alter table public.appointments alter column duration_minutes set default 60;
alter table public.appointments alter column cancel_deadline_at drop not null;

do $$ begin
  alter table public.appointments
    add constraint appointments_requester_one_of
    check (num_nonnulls(requester_entity_id, requester_user_id) = 1);
exception when duplicate_object then null; end $$;

-- توافق البيانات القديمة: مرجع لكل موعد قائم، بلا تغيير أي بيانات أخرى.
do $$
declare r record;
begin
  for r in select id from public.appointments where reference is null loop
    update public.appointments
      set reference = private.new_platform_reference('appointment', 'appointments', r.id)
      where id = r.id;
  end loop;
end $$;

-- سياسة قراءة الطالب الشخصي (الكيانات تبقى على سياساتها الحالية دون تغيير).
drop policy if exists "appointments_personal_requester_select" on public.appointments;
create policy "appointments_personal_requester_select"
  on public.appointments for select to authenticated
  using (requester_user_id = auth.uid());

-- حجز باسم حساب شخصي: الطالب هو المستخدم نفسه حصرًا.
create or replace function public.propose_personal_appointment(
  _provider_entity_id uuid,
  _kind text,
  _title text,
  _starts_at timestamptz,
  _requester_timezone text default 'Asia/Riyadh',
  _provider_timezone text default 'Asia/Riyadh',
  _duration_minutes int default 60,
  _cancel_hours int default 0,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if _starts_at <= now() then raise exception 'APPOINTMENT_IN_PAST'; end if;

  insert into public.appointments (
    requester_user_id, provider_entity_id, kind, title, starts_at,
    requester_timezone, provider_timezone, duration_minutes,
    cancel_deadline_at, notes, status, created_by
  ) values (
    auth.uid(), _provider_entity_id, _kind, _title, _starts_at,
    _requester_timezone, _provider_timezone, coalesce(_duration_minutes, 60),
    case when coalesce(_cancel_hours, 0) > 0
         then _starts_at - make_interval(hours => _cancel_hours) end,
    _notes, 'proposed', auth.uid()
  ) returning id into _id;

  update public.appointments
    set reference = private.new_platform_reference('appointment', 'appointments', _id)
    where id = _id;

  return _id;
end;
$$;

revoke all on function public.propose_personal_appointment(uuid, text, text, timestamptz, text, text, int, int, text) from public, anon;
grant execute on function public.propose_personal_appointment(uuid, text, text, timestamptz, text, text, int, int, text) to authenticated;

-- تأجيل الموعد: مصرَّح لطرفي الموعد فقط، مع حفظ الموعد السابق.
create or replace function public.postpone_appointment(
  _appointment_id uuid,
  _new_starts_at timestamptz,
  _reason text default null
) returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if _new_starts_at <= now() then raise exception 'APPOINTMENT_IN_PAST'; end if;
  if a.status not in ('proposed', 'confirmed') then raise exception 'APPOINTMENT_STATE_INVALID'; end if;

  if not (
    a.requester_user_id = auth.uid()
    or (a.requester_entity_id is not null and private.is_entity_manager(auth.uid(), a.requester_entity_id))
    or private.is_entity_manager(auth.uid(), a.provider_entity_id)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.appointments
     set previous_starts_at = starts_at,
         starts_at = _new_starts_at,
         cancel_deadline_at = case when cancel_deadline_at is not null
                                   then _new_starts_at - (starts_at - cancel_deadline_at) end,
         postponed_at = now(),
         status = 'postponed',
         cancel_reason = coalesce(_reason, cancel_reason),
         updated_at = now()
   where id = _appointment_id;

  return true;
end;
$$;

revoke all on function public.postpone_appointment(uuid, timestamptz, text) from public, anon;
grant execute on function public.postpone_appointment(uuid, timestamptz, text) to authenticated;

-- تحقق عام بالمرجع + التاريخ: لا يكشف أي بيانات شخصية، فقط وجود الموعد وحالته وتاريخه.
create or replace function public.verify_appointment_reference(
  _reference text,
  _date date
) returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select json_build_object(
        'found', true,
        'status', a.status,
        'kind', a.kind,
        'date', (a.starts_at at time zone 'Asia/Riyadh')::date
      )
      from public.appointments a
      where a.reference = _reference
        and (a.starts_at at time zone 'Asia/Riyadh')::date = _date
      limit 1),
    json_build_object('found', false)
  );
$$;

revoke all on function public.verify_appointment_reference(text, date) from public;
grant execute on function public.verify_appointment_reference(text, date) to anon, authenticated;
