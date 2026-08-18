-- 09 — سجل التدقيق الإداري + تنبيه مالك المشروع عند break-glass
-- معلّقة: لا يمكن تطبيقها حاليًا بسبب SUPABASE_FORBIDDEN على واجهة الإدارة.
-- لا تُطبَّق يدويًا دون مراجعة: كلا الدالتين SECURITY DEFINER.

-- 1) قراءة سجل التدقيق لفريق المنصة المخوّل فقط -----------------------------
create or replace function public.admin_list_audit_log(
  _q text default null,
  _object_type text default null,
  _action text default null,
  _limit integer default 100
)
returns table(
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  target_user_id uuid,
  target_entity_id uuid,
  target_project_id uuid,
  object_type text,
  object_id uuid,
  action text
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare v_actor uuid := auth.uid();
begin
  -- fail-closed: أي دور غير مخوّل لا يرى أي صف
  if v_actor is null or not private.platform_can(v_actor, 'audit.view') then
    raise exception 'forbidden: audit.view';
  end if;

  return query
  select a.id, a.created_at, a.actor_user_id, p.full_name,
         a.target_user_id, a.target_entity_id, a.target_project_id,
         a.object_type, a.object_id, a.action
  from public.permission_audit_log a
  left join public.profiles p on p.id = a.actor_user_id
  where (_object_type is null or a.object_type = _object_type)
    and (_action is null or a.action = _action)
    and (
      _q is null
      or a.object_type ilike '%' || _q || '%'
      or coalesce(p.full_name, '') ilike '%' || _q || '%'
    )
  order by a.created_at desc
  limit least(coalesce(_limit, 100), 200);
end;
$$;

revoke execute on function public.admin_list_audit_log(text, text, text, integer) from public, anon;
grant execute on function public.admin_list_audit_log(text, text, text, integer) to authenticated;

-- 2) إضافة الفعل 'audit.view' إلى محرك صلاحيات المنصة ------------------------
-- تعديل محافظ: يبقى كل فرع قائم كما هو ويُضاف فرع واحد مطابق للوحدة والفعل.
create or replace function private.platform_can(_user_id uuid, _action text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_role public.platform_role;
begin
  if _user_id is null then return false; end if;
  if private.is_platform_admin(_user_id) then return true; end if;
  v_role := private.platform_role(_user_id);
  if v_role is null then return false; end if;
  return case _action
    when 'queue.view'      then true
    when 'queue.claim'     then v_role in ('superadmin','reviewer','support','compliance')
    when 'queue.assign'    then v_role in ('superadmin','reviewer','compliance')
    when 'queue.reassign'  then v_role = 'superadmin'
    when 'queue.resolve'   then true
    when 'staff.manage'    then v_role = 'superadmin'
    when 'case.grant'      then v_role in ('superadmin','reviewer','compliance')
    when 'breakglass.request' then true
    when 'breakglass.approve' then v_role = 'superadmin'
    when 'audit.view'      then v_role in ('superadmin','compliance')
    when 'directory.view'  then v_role = 'superadmin'
    else false end;
end;
$$;

revoke all on function private.platform_can(uuid, text) from public, anon;
grant execute on function private.platform_can(uuid, text) to authenticated, service_role;

-- 3) تنبيه فوري لمالك المشروع عند اعتماد break-glass -------------------------
-- المالك يجب أن يعرف بالوصول الاستثنائي لحظة اعتماده، لا بعد انتهائه.
create or replace function public.approve_breakglass(_request_id uuid, _minutes integer default 60)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid(); v_req public.platform_breakglass_requests;
  v_grant uuid; v_exp timestamptz; r record; v_owner uuid;
begin
  if v_actor is null or not private.platform_can(v_actor, 'breakglass.approve') then
    raise exception 'forbidden: breakglass.approve';
  end if;
  if _minutes is null or _minutes < 1 or _minutes > 240 then raise exception 'invalid duration'; end if;

  select * into v_req from public.platform_breakglass_requests where id = _request_id for update;
  if v_req.id is null then raise exception 'not found'; end if;
  if v_req.status <> 'pending' then raise exception 'request is not pending'; end if;
  if v_req.requested_by = v_actor then raise exception 'separation of duties: self-approval is forbidden'; end if;

  v_exp := now() + make_interval(mins => _minutes);

  insert into public.permission_grants(subject_user_id, scope_type, scope_project_id, module, action, effect, granted_by, expires_at)
  values (v_req.requested_by, 'project', v_req.project_id, 'projects'::public.app_module, 'view'::public.app_action, 'allow', v_actor, v_exp)
  returning id into v_grant;

  update public.platform_breakglass_requests
     set status = 'approved', approved_by = v_actor, approved_at = now(), expires_at = v_exp, grant_id = v_grant
   where id = _request_id;

  insert into public.permission_audit_log(actor_user_id, target_user_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, v_req.requested_by, v_req.project_id, 'platform_breakglass', _request_id, 'approve',
          jsonb_build_object('expires_at', v_exp, 'reason', v_req.reason));

  perform private.emit_notification(v_req.requested_by, 'platform.breakglass_approved', v_req.project_id, null,
    'breakglass', _request_id, jsonb_build_object('expires_at', v_exp), null, 'critical');
  for r in select user_id from public.platform_staff where active and role = 'superadmin' loop
    perform private.emit_notification(r.user_id, 'platform.breakglass_approved', v_req.project_id, null,
      'breakglass', _request_id, jsonb_build_object('expires_at', v_exp, 'approved_by', v_actor), 'audit', 'critical');
  end loop;

  -- جديد: إشعار مالك المشروع نفسه (بلا كشف هوية الموظف أو سببه الحرفي)
  select p.owner_id into v_owner from public.projects p where p.id = v_req.project_id;
  if v_owner is not null then
    perform private.emit_notification(v_owner, 'platform.breakglass_approved', v_req.project_id, null,
      'breakglass', _request_id, jsonb_build_object('expires_at', v_exp), null, 'critical');
  end if;

  return v_grant;
end;
$$;

revoke all on function public.approve_breakglass(uuid, integer) from public, anon;
grant execute on function public.approve_breakglass(uuid, integer) to authenticated;
