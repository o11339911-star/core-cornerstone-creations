-- 06 — مشاركو الاجتماع ودعواتهم + بطاقة الموعد + وصول الاجتماع.
-- يعتمد على 01 (المراجع) و02 (المرجع والدورة) و04 (الأدوار). آمن للتشغيل المتكرر.
-- قواعد ثابتة:
--  * معرّف الموعد وحده لا يمنح وصولًا: الطرفان والمشاركون المقبولون فقط.
--  * الدعوة لا تُفعّل بمعرفة الرابط، بل بمطابقة الحساب أو بريده الموثق خادميًا.
--  * لا كتابة مباشرة من العميل على أي جدول هنا.

-- ── 1) دعوات المشاركين ──────────────────────────────────────────────
create table if not exists public.appointment_invites (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  invited_by     uuid not null,
  invitee_user_id uuid,
  invitee_email  text check (invitee_email is null or invitee_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  constraint appointment_invites_identity_chk
    check (num_nonnulls(invitee_user_id, invitee_email) >= 1)
);

-- منع التكرار على نفس الموعد لنفس الهوية (حساب أو بريد).
create unique index if not exists appointment_invites_user_uniq
  on public.appointment_invites (appointment_id, invitee_user_id)
  where invitee_user_id is not null;
create unique index if not exists appointment_invites_email_uniq
  on public.appointment_invites (appointment_id, lower(invitee_email))
  where invitee_email is not null;

grant select on public.appointment_invites to authenticated;
grant all on public.appointment_invites to service_role;
revoke insert, update, delete, truncate on public.appointment_invites from anon, authenticated;
revoke select on public.appointment_invites from anon;

alter table public.appointment_invites enable row level security;

-- ── 2) وصول الموعد: طرف أو مشارك مقبول ──────────────────────────────
create or replace function private.appt_access(_uid uuid, _a public.appointments)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare v_side text;
begin
  if _uid is null then return null; end if;

  v_side := private.appt_side(_uid, _a);
  if v_side is not null then return v_side; end if;

  -- مشارك مقبول فقط؛ الدعوة المعلّقة لا تمنح أي وصول.
  if exists (
    select 1 from public.appointment_invites i
    where i.appointment_id = _a.id
      and i.status = 'accepted'
      and i.invitee_user_id = _uid
  ) then
    return 'participant';
  end if;

  return null;
end;
$$;

revoke all on function private.appt_access(uuid, public.appointments) from public, anon;
grant execute on function private.appt_access(uuid, public.appointments) to authenticated;

drop policy if exists "appointment_invites_read_scope" on public.appointment_invites;
create policy "appointment_invites_read_scope"
  on public.appointment_invites for select to authenticated
  using (
    invitee_user_id = auth.uid()
    or exists (
      select 1 from public.appointments a
      where a.id = appointment_id and private.appt_side(auth.uid(), a) is not null
    )
  );

-- ── 3) بطاقة الموعد ─────────────────────────────────────────────────
-- تكشف الحد الأدنى: لا هوية ولا جوال ولا بريد للأطراف، أسماء عرض فقط.
create or replace function public.appointment_card(_appointment_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype; v_access text; v_req text; v_prov text;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_access := private.appt_access(auth.uid(), a);
  if v_access is null then raise exception 'FORBIDDEN'; end if;

  select e.name into v_prov from public.entities e where e.id = a.provider_entity_id;
  if a.requester_entity_id is not null then
    select e.name into v_req from public.entities e where e.id = a.requester_entity_id;
  else
    select coalesce(p.full_name, 'حساب شخصي') into v_req
      from public.profiles p where p.id = a.requester_user_id;
  end if;

  return json_build_object(
    'id', a.id,
    'reference', a.reference,
    'created_at', a.created_at,
    'kind', a.kind,
    'title', a.title,
    'starts_at', a.starts_at,
    'previous_starts_at', a.previous_starts_at,
    'status', a.status,
    'requester_label', coalesce(v_req, 'غير محدد'),
    'provider_label', coalesce(v_prov, 'غير محدد'),
    'my_access', v_access,
    'can_confirm', (
      v_access = coalesce(a.pending_party, 'provider')
      and a.status in ('proposed','postponed')
      and a.created_by is distinct from auth.uid()
      and a.last_proposed_by is distinct from auth.uid()
    ),
    'can_manage', v_access in ('requester','provider'),
    'verify_date', (a.starts_at at time zone 'Asia/Riyadh')::date
  );
end;
$$;

revoke all on function public.appointment_card(uuid) from public, anon;
grant execute on function public.appointment_card(uuid) to authenticated;

-- ── 4) دعوة مشارك ───────────────────────────────────────────────────
create or replace function public.invite_appointment_participant(
  _appointment_id uuid,
  _email text default null,
  _user_id uuid default null
) returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype; v_side text; v_target uuid; v_email text; v_id uuid;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_side := private.appt_side(auth.uid(), a);
  if v_side is null then raise exception 'FORBIDDEN'; end if;
  if a.kind <> 'meeting' then raise exception 'PARTICIPANTS_ONLY_FOR_MEETING'; end if;
  if a.status in ('cancelled','completed') then raise exception 'APPOINTMENT_STATE_INVALID'; end if;

  v_email := nullif(lower(trim(_email)), '');
  v_target := _user_id;

  -- ربط البريد بحساب قائم: بريد الحساب المؤكد أو البريد الرسمي الموثق.
  if v_target is null and v_email is not null then
    select u.id into v_target from auth.users u
      where lower(u.email) = v_email and u.email_confirmed_at is not null limit 1;
    if v_target is null then
      select oe.owner_user_id into v_target from public.official_emails oe
        where lower(oe.email) = v_email and oe.status = 'verified' and oe.owner_user_id is not null
        limit 1;
    end if;
  end if;

  if v_target is null and v_email is null then raise exception 'INVITE_TARGET_REQUIRED'; end if;
  if v_target = a.created_by then raise exception 'INVITE_TARGET_IS_PARTY'; end if;

  insert into public.appointment_invites (appointment_id, invited_by, invitee_user_id, invitee_email)
  values (_appointment_id, auth.uid(), v_target, v_email)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then raise exception 'INVITE_ALREADY_EXISTS'; end if;

  if v_target is not null then
    perform private.emit_notification(v_target, 'appointment.invited', null, null,
      'appointment', _appointment_id,
      jsonb_build_object('title', a.title, 'starts_at', a.starts_at),
      'pending', 'info');
  end if;

  return json_build_object('invite_id', v_id, 'linked_account', v_target is not null);
end;
$$;

revoke all on function public.invite_appointment_participant(uuid, text, uuid) from public, anon;
grant execute on function public.invite_appointment_participant(uuid, text, uuid) to authenticated;

-- ── 5) الرد على الدعوة ──────────────────────────────────────────────
-- المطابقة بالحساب أو ببريد موثق فعليًا، لا بمعرفة المعرّف.
create or replace function public.respond_appointment_invite(_invite_id uuid, _accept boolean)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare i public.appointment_invites%rowtype; a public.appointments%rowtype; v_ok boolean := false;
begin
  select * into i from public.appointment_invites where id = _invite_id;
  if i.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if i.status <> 'pending' then raise exception 'INVITE_ALREADY_RESOLVED'; end if;

  if i.invitee_user_id = auth.uid() then
    v_ok := true;
  elsif i.invitee_email is not null then
    v_ok := exists (
      select 1 from auth.users u
      where u.id = auth.uid() and lower(u.email) = lower(i.invitee_email)
        and u.email_confirmed_at is not null
    ) or exists (
      select 1 from public.official_emails oe
      where oe.owner_user_id = auth.uid() and oe.status = 'verified'
        and lower(oe.email) = lower(i.invitee_email)
    );
  end if;
  if not v_ok then raise exception 'FORBIDDEN'; end if;

  select * into a from public.appointments where id = i.appointment_id;

  update public.appointment_invites
     set status = case when _accept then 'accepted' else 'declined' end,
         invitee_user_id = coalesce(invitee_user_id, auth.uid()),
         responded_at = now()
   where id = _invite_id;

  -- الإضافة الفعلية للجلسة بعد القبول فقط.
  if _accept then
    insert into public.appointment_participants (appointment_id, user_id, entity_id, side)
    values (i.appointment_id, auth.uid(), a.provider_entity_id, 'guest')
    on conflict do nothing;
  end if;

  insert into public.appointment_events (appointment_id, actor_user_id, actor_side, action, note)
  values (i.appointment_id, auth.uid(), 'system',
          case when _accept then 'confirmed' else 'cancelled' end,
          case when _accept then 'قبول دعوة مشارك' else 'رفض دعوة مشارك' end);

  perform private.emit_notification(i.invited_by,
    case when _accept then 'appointment.invite_accepted' else 'appointment.invite_declined' end,
    null, null, 'appointment', i.appointment_id,
    jsonb_build_object('title', a.title), null, 'info');

  return true;
end;
$$;

revoke all on function public.respond_appointment_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_appointment_invite(uuid, boolean) to authenticated;

-- ── 6) قائمة الدعوات لموعد ──────────────────────────────────────────
create or replace function public.list_appointment_invites(_appointment_id uuid)
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
  if private.appt_access(auth.uid(), a) is null then raise exception 'FORBIDDEN'; end if;

  return coalesce((
    select json_agg(json_build_object(
      'id', i.id,
      -- عرض البريد كاملًا لأطراف الموعد فقط؛ المشارك يرى دعوته وحدها.
      'invitee', case
        when private.appt_side(auth.uid(), a) is not null or i.invitee_user_id = auth.uid()
          then coalesce(i.invitee_email, (select p.full_name from public.profiles p where p.id = i.invitee_user_id))
        else null end,
      'status', i.status,
      'linked_account', i.invitee_user_id is not null,
      'created_at', i.created_at,
      'responded_at', i.responded_at
    ) order by i.created_at)
    from public.appointment_invites i
    where i.appointment_id = _appointment_id
      and (private.appt_side(auth.uid(), a) is not null or i.invitee_user_id = auth.uid())
  ), '[]'::json);
end;
$$;

revoke all on function public.list_appointment_invites(uuid) from public, anon;
grant execute on function public.list_appointment_invites(uuid) to authenticated;

-- ── 7) دعواتي المعلّقة ──────────────────────────────────────────────
create or replace function public.list_my_appointment_invites()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  return coalesce((
    select json_agg(json_build_object(
      'id', i.id,
      'appointment_id', i.appointment_id,
      'title', a.title,
      'starts_at', a.starts_at,
      'status', i.status
    ) order by a.starts_at)
    from public.appointment_invites i
    join public.appointments a on a.id = i.appointment_id
    where i.status = 'pending'
      and (
        i.invitee_user_id = auth.uid()
        or (i.invitee_email is not null and exists (
          select 1 from auth.users u where u.id = auth.uid()
            and lower(u.email) = lower(i.invitee_email) and u.email_confirmed_at is not null))
        or (i.invitee_email is not null and exists (
          select 1 from public.official_emails oe where oe.owner_user_id = auth.uid()
            and oe.status = 'verified' and lower(oe.email) = lower(i.invitee_email)))
      )
  ), '[]'::json);
end;
$$;

revoke all on function public.list_my_appointment_invites() from public, anon;
grant execute on function public.list_my_appointment_invites() to authenticated;

-- ── 8) وصول جلسة الاجتماع ───────────────────────────────────────────
-- لا تُفتح جلسة إلا لموعد اجتماع مؤكد ولمن يملك وصولًا فعليًا.
create or replace function public.appointment_meeting_access(_appointment_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype; v_access text;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_access := private.appt_access(auth.uid(), a);
  if v_access is null then raise exception 'FORBIDDEN'; end if;

  return json_build_object(
    'is_meeting', a.kind = 'meeting',
    'access', v_access,
    'can_join', a.kind = 'meeting'
                and a.status = 'confirmed'
                and now() >= a.starts_at - interval '15 minutes'
                and now() <= a.starts_at + interval '4 hours',
    'starts_at', a.starts_at
  );
end;
$$;

revoke all on function public.appointment_meeting_access(uuid) from public, anon;
grant execute on function public.appointment_meeting_access(uuid) to authenticated;
