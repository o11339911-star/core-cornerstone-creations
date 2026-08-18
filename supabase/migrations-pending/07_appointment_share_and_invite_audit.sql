-- 07 — مشاركة الموعد داخل ركيز + تدقيق الدعوات (إضافي فقط، لا حذف ولا توسيع RLS).
-- يعتمد على 03 (شبكة التواصل) و06 (الدعوات والبطاقة). آمن للتشغيل المتكرر.
-- قواعد ثابتة:
--  * appointment_id وحده لا يكفي: الطرفان والمشاركون المقبولون فقط.
--  * المشاركة الداخلية لا تُتاح إلا لعلاقة تواصل مقبولة، ولا تكشف إلا المرجع والعنوان والحالة.

-- ── 1) تدقيق الدعوة ─────────────────────────────────────────────────
alter table public.appointment_invites add column if not exists accepted_at timestamptz;

update public.appointment_invites
   set accepted_at = responded_at
 where status = 'accepted' and accepted_at is null and responded_at is not null;

-- ── 2) إلغاء دعوة من داعيها أو أطراف الموعد ─────────────────────────
create or replace function public.cancel_appointment_invite(_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare i public.appointment_invites%rowtype; a public.appointments%rowtype;
begin
  select * into i from public.appointment_invites where id = _invite_id;
  if i.id is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if i.status <> 'pending' then raise exception 'INVITE_ALREADY_RESOLVED'; end if;

  select * into a from public.appointments where id = i.appointment_id;
  if private.appt_side(auth.uid(), a) is null and i.invited_by is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  update public.appointment_invites
     set status = 'cancelled', responded_at = now()
   where id = _invite_id;

  insert into public.appointment_events (appointment_id, actor_user_id, actor_side, action, note)
  values (i.appointment_id, auth.uid(), 'system', 'cancelled', 'إلغاء دعوة مشارك');

  if i.invitee_user_id is not null then
    perform private.emit_notification(i.invitee_user_id, 'appointment.invite_cancelled',
      null, null, 'appointment', i.appointment_id,
      jsonb_build_object('title', a.title), 'cancelled', 'info');
  end if;

  return true;
end;
$$;

revoke all on function public.cancel_appointment_invite(uuid) from public, anon;
grant execute on function public.cancel_appointment_invite(uuid) to authenticated;

-- ── 3) تحديث الدعوة لتسجيل وقت القبول ───────────────────────────────
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
         responded_at = now(),
         accepted_at = case when _accept then now() else accepted_at end
   where id = _invite_id;

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

-- ── 4) قائمة الدعوات مع بيانات التدقيق ──────────────────────────────
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
      'invitee', case
        when private.appt_side(auth.uid(), a) is not null or i.invitee_user_id = auth.uid()
          then coalesce(i.invitee_email, (select p.full_name from public.profiles p where p.id = i.invitee_user_id))
        else null end,
      'status', i.status,
      'linked_account', i.invitee_user_id is not null,
      'created_at', i.created_at,
      'responded_at', i.responded_at,
      'accepted_at', i.accepted_at,
      'invited_by_label', coalesce(
        (select p.full_name from public.profiles p where p.id = i.invited_by), 'عضو في الموعد'),
      'can_cancel', i.status = 'pending'
        and (private.appt_side(auth.uid(), a) is not null or i.invited_by = auth.uid())
    ) order by i.created_at)
    from public.appointment_invites i
    where i.appointment_id = _appointment_id
      and (private.appt_side(auth.uid(), a) is not null or i.invitee_user_id = auth.uid())
  ), '[]'::json);
end;
$$;

revoke all on function public.list_appointment_invites(uuid) from public, anon;
grant execute on function public.list_appointment_invites(uuid) to authenticated;

-- ── 5) جهات المشاركة المسموح بها: علاقات تواصل مقبولة مع أفراد ──────
create or replace function public.appointment_share_targets()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  return coalesce((
    select json_agg(distinct_targets)
    from (
      select distinct on (t.user_id)
             json_build_object(
               'user_id', t.user_id,
               'name', coalesce((select p.full_name from public.profiles p where p.id = t.user_id), 'جهة متصلة')
             ) as distinct_targets,
             t.user_id
      from (
        select case when l.requester_user_id = auth.uid() then l.target_user_id
                    else l.requester_user_id end as user_id
        from public.network_links l
        where l.status = 'accepted'
          and (l.requester_user_id = auth.uid() or l.target_user_id = auth.uid())
      ) t
      where t.user_id is not null and t.user_id <> auth.uid()
      limit 200
    ) s
  ), '[]'::json);
end;
$$;

revoke all on function public.appointment_share_targets() from public, anon;
grant execute on function public.appointment_share_targets() to authenticated;

-- ── 6) مشاركة داخلية: إشعار بالمرجع فقط، بلا منح وصول ───────────────
create or replace function public.share_appointment_internal(_appointment_id uuid, _user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a.id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if private.appt_access(auth.uid(), a) is null then raise exception 'FORBIDDEN'; end if;
  if _user_id = auth.uid() then raise exception 'SHARE_TARGET_INVALID'; end if;

  if not exists (
    select 1 from public.network_links l
    where l.status = 'accepted'
      and ((l.requester_user_id = auth.uid() and l.target_user_id = _user_id)
        or (l.target_user_id = auth.uid() and l.requester_user_id = _user_id))
  ) then
    raise exception 'SHARE_TARGET_NOT_LINKED';
  end if;

  -- المشاركة لا تمنح وصولًا؛ هي إشعار بالمرجع والعنوان والحالة فقط.
  perform private.emit_notification(_user_id, 'appointment.shared', null, null,
    'appointment', _appointment_id,
    jsonb_build_object('reference', a.reference, 'title', a.title, 'status', a.status),
    a.status, 'info');

  insert into public.appointment_events (appointment_id, actor_user_id, actor_side, action, note)
  values (_appointment_id, auth.uid(), 'system', 'shared', 'مشاركة بطاقة الموعد داخل المنصة');

  return true;
end;
$$;

revoke all on function public.share_appointment_internal(uuid, uuid) from public, anon;
grant execute on function public.share_appointment_internal(uuid, uuid) to authenticated;
