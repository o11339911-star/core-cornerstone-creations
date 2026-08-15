-- ============ 1) أدوار المنصة ============
create type public.platform_role as enum ('superadmin','reviewer','support','compliance');
create type public.platform_availability as enum ('available','busy','on_leave','suspended');

create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.platform_role not null default 'support',
  availability public.platform_availability not null default 'available',
  max_concurrent integer not null default 5 check (max_concurrent between 0 and 100),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.platform_staff to authenticated;
grant all on public.platform_staff to service_role;
alter table public.platform_staff enable row level security;

create or replace function private.is_platform_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = _user_id and s.active
  );
$$;

create or replace function private.platform_role(_user_id uuid)
returns public.platform_role language sql stable security definer set search_path to 'public' as $$
  select s.role from public.platform_staff s where s.user_id = _user_id and s.active;
$$;

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
    else false end;
end;
$$;

create policy "platform staff readable by platform staff"
on public.platform_staff for select to authenticated
using (private.is_platform_staff(auth.uid()) or private.is_platform_admin(auth.uid()));

-- ============ 2) طابور المراجعة الموحّد ============
create type public.platform_queue_source as enum
  ('entity_verification','template_review','report','support_ticket','compliance_task');
create type public.platform_queue_status as enum
  ('open','assigned','in_progress','resolved','closed');

create table public.platform_queue_items (
  id uuid primary key default gen_random_uuid(),
  source_type public.platform_queue_source not null,
  source_table text not null,
  source_id uuid not null,
  entity_id uuid references public.entities(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  status public.platform_queue_status not null default 'open',
  assigned_to uuid references public.platform_staff(user_id) on delete set null,
  assigned_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.platform_queue_items to authenticated;
grant all on public.platform_queue_items to service_role;
alter table public.platform_queue_items enable row level security;

create unique index platform_queue_items_open_source_uq
  on public.platform_queue_items (source_type, source_id)
  where status <> 'closed';

create unique index platform_queue_items_active_assign_uq
  on public.platform_queue_items (source_type, source_id)
  where status in ('assigned','in_progress');

create index platform_queue_items_assigned_idx
  on public.platform_queue_items (assigned_to, status);

create policy "queue readable by platform staff"
on public.platform_queue_items for select to authenticated
using (private.is_platform_staff(auth.uid()) or private.is_platform_admin(auth.uid()));

-- ============ 3) وصول Case-based ============
create table public.platform_case_access (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.permission_grants(id) on delete cascade,
  queue_item_id uuid not null references public.platform_queue_items(id) on delete cascade,
  staff_user_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text not null check (length(btrim(reason)) >= 5),
  granted_by uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

grant select on public.platform_case_access to authenticated;
grant all on public.platform_case_access to service_role;
alter table public.platform_case_access enable row level security;

create policy "case access readable by platform staff"
on public.platform_case_access for select to authenticated
using (private.is_platform_staff(auth.uid()) or private.is_platform_admin(auth.uid()));

-- ============ 4) Break-glass ============
create type public.breakglass_status as enum ('pending','approved','denied','expired');

create table public.platform_breakglass_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text not null check (length(btrim(reason)) >= 10),
  status public.breakglass_status not null default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  denied_reason text,
  expires_at timestamptz,
  grant_id uuid references public.permission_grants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breakglass_no_self_approval check (approved_by is null or approved_by <> requested_by)
);

grant select on public.platform_breakglass_requests to authenticated;
grant all on public.platform_breakglass_requests to service_role;
alter table public.platform_breakglass_requests enable row level security;

create policy "breakglass readable by platform staff"
on public.platform_breakglass_requests for select to authenticated
using (private.is_platform_staff(auth.uid()) or private.is_platform_admin(auth.uid()));

-- ============ 5) updated_at triggers ============
create trigger trg_platform_staff_updated before update on public.platform_staff
for each row execute function public.set_updated_at();
create trigger trg_platform_queue_updated before update on public.platform_queue_items
for each row execute function public.set_updated_at();
create trigger trg_platform_bg_updated before update on public.platform_breakglass_requests
for each row execute function public.set_updated_at();

-- ============ 6) أنواع الإشعارات ============
alter table public.notification_types drop constraint if exists notification_types_target_kind_check;
alter table public.notification_types add constraint notification_types_target_kind_check
  check (target_kind = any (array['request','stage','contract','document','disbursement','financial_document','milestone','retention','membership','warranty','queue_item','breakglass']));

insert into public.notification_types (code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind)
values
 ('platform.queue_assigned','action_required','in_app',true,false,'notif.platform.queueAssigned.subject','notif.platform.queueAssigned.body','queue_item'),
 ('platform.queue_reassigned','info','in_app',true,false,'notif.platform.queueReassigned.subject','notif.platform.queueReassigned.body','queue_item'),
 ('platform.case_access_granted','security','in_app',true,true,'notif.platform.caseAccess.subject','notif.platform.caseAccess.body','queue_item'),
 ('platform.breakglass_requested','security','in_app',true,true,'notif.platform.breakglassRequested.subject','notif.platform.breakglassRequested.body','breakglass'),
 ('platform.breakglass_approved','security','in_app',true,true,'notif.platform.breakglassApproved.subject','notif.platform.breakglassApproved.body','breakglass')
on conflict (code) do nothing;

-- ============ 7) private.can : فرع موظفي المنصة (قراءة فقط) ============
create or replace function private.can(_user_id uuid, _module app_module, _action app_action, _entity_id uuid default null::uuid, _project_id uuid default null::uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_entity_id uuid := _entity_id;
  v_owner_id uuid;
begin
  if _user_id is null then
    return false;
  end if;

  if _project_id is not null then
    select p.owner_id, coalesce(v_entity_id, p.entity_id)
      into v_owner_id, v_entity_id
    from public.projects p
    where p.id = _project_id and p.deleted_at is null;

    if v_owner_id is null then
      return false;
    end if;

    if v_owner_id = _user_id then
      return true;
    end if;
  end if;

  -- explicit deny always wins (project scope can be evaluated without an entity)
  if exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id
      and g.module = _module
      and g.action = _action
      and g.effect = 'deny'
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (
        (g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id)
      )
  ) then
    return false;
  end if;

  -- ==== المرحلة 20: موظف المنصة — قراءة فقط ضمن منحة سارية مرتبطة بحالة/طوارئ ====
  -- الوظيفة وحدها لا تمنح شيئًا. لا يمنح هذا الفرع أي فعل كتابة أو اعتماد إطلاقًا.
  if _project_id is not null
     and _action = 'view'::public.app_action
     and private.is_platform_staff(_user_id)
  then
    if exists (
      select 1
      from public.platform_case_access ca
      join public.permission_grants g on g.id = ca.grant_id
      where ca.staff_user_id = _user_id
        and ca.project_id = _project_id
        and ca.revoked_at is null
        and ca.expires_at > now()
        and g.revoked_at is null
        and g.effect = 'allow'
        and (g.expires_at is null or g.expires_at > now())
    ) then
      return true;
    end if;

    if exists (
      select 1
      from public.platform_breakglass_requests b
      join public.permission_grants g on g.id = b.grant_id
      where b.requested_by = _user_id
        and b.project_id = _project_id
        and b.status = 'approved'
        and b.expires_at > now()
        and g.revoked_at is null
        and g.effect = 'allow'
        and (g.expires_at is null or g.expires_at > now())
    ) then
      return true;
    end if;
  end if;

  -- external party path: accepted party entity ceiling ∩ member's role
  if _project_id is not null and private.party_ceiling(_user_id, _module, _action, _project_id) then
    return true;
  end if;

  if v_entity_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.entity_memberships em
    join public.role_permissions rp on rp.role = em.role
    where em.user_id = _user_id
      and em.entity_id = v_entity_id
      and em.status = 'active'
      and (em.expires_at is null or em.expires_at > now())
      and rp.module = _module
      and rp.action = _action
      and (
        _project_id is null
        or em.role in ('owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role)
      )
  ) then
    return true;
  end if;

  if _project_id is not null and private.has_project_assignment(_user_id, _project_id) then
    if exists (
      select 1
      from public.project_assignments a
      join public.entity_memberships em
        on em.user_id = a.user_id
       and em.entity_id = coalesce(a.entity_id, v_entity_id)
       and em.status = 'active'
      join public.role_permissions rp on rp.role = em.role
      where a.user_id = _user_id
        and a.project_id = _project_id
        and a.status = 'active'
        and a.deleted_at is null
        and rp.module = _module
        and rp.action = _action
    ) then
      return true;
    end if;
  end if;

  -- منح صريحة عامة: تُستثنى منها منح المنصة المؤقتة (لا تتجاوز قيد القراءة أعلاه)
  return exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id
      and g.module = _module
      and g.action = _action
      and g.effect = 'allow'
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and not exists (select 1 from public.platform_case_access ca where ca.grant_id = g.id)
      and not exists (select 1 from public.platform_breakglass_requests b where b.grant_id = g.id)
      and (
        (g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id)
      )
  );
end;
$function$;

-- ============ 8) دوال التشغيل ============

-- إنشاء/فتح عنصر طابور (داخلي)
create or replace function private.upsert_queue_item(
  _source_type public.platform_queue_source, _source_table text, _source_id uuid,
  _title text, _entity_id uuid default null, _project_id uuid default null, _priority smallint default 3)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  select id into v_id from public.platform_queue_items
   where source_type = _source_type and source_id = _source_id and status <> 'closed';
  if v_id is not null then return v_id; end if;
  insert into public.platform_queue_items(source_type, source_table, source_id, title, entity_id, project_id, priority)
  values (_source_type, _source_table, _source_id, _title, _entity_id, _project_id, coalesce(_priority,3))
  returning id into v_id;
  return v_id;
end;
$$;

-- إغلاق تلقائي عند معالجة الأصل
create or replace function private.close_queue_for_source(
  _source_type public.platform_queue_source, _source_id uuid, _reason text)
returns void language sql security definer set search_path to 'public' as $$
  update public.platform_queue_items
     set status = 'closed', close_reason = coalesce(_reason,'source_resolved'),
         resolved_at = coalesce(resolved_at, now()), updated_at = now()
   where source_type = _source_type and source_id = _source_id and status <> 'closed';
$$;

-- التوزيع الآلي المتوازن
create or replace function public.auto_assign_queue_item(_item_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_item public.platform_queue_items;
  v_staff uuid;
begin
  if v_actor is null or not private.platform_can(v_actor, 'queue.assign') then
    raise exception 'forbidden: queue.assign';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform_queue:' || _item_id::text, 0));

  select * into v_item from public.platform_queue_items where id = _item_id for update;
  if v_item.id is null then raise exception 'queue item not found'; end if;
  if v_item.status = 'closed' then raise exception 'queue item is closed'; end if;
  if v_item.assigned_to is not null then
    raise exception 'queue item already assigned';
  end if;

  select s.user_id into v_staff
  from public.platform_staff s
  left join lateral (
    select count(*)::int as load from public.platform_queue_items q
     where q.assigned_to = s.user_id and q.status in ('assigned','in_progress')
  ) l on true
  where s.active
    and s.availability = 'available'
    and l.load < s.max_concurrent
  order by l.load asc, s.created_at asc
  limit 1;

  if v_staff is null then raise exception 'no available staff'; end if;

  update public.platform_queue_items
     set assigned_to = v_staff, assigned_at = now(), status = 'assigned', updated_at = now()
   where id = _item_id;

  insert into public.permission_audit_log(actor_user_id, target_user_id, target_entity_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, v_staff, v_item.entity_id, v_item.project_id, 'platform_queue_item', _item_id, 'assign',
          jsonb_build_object('assigned_to', v_staff));

  perform private.emit_notification(v_staff, 'platform.queue_assigned', v_item.project_id, v_item.entity_id,
    'queue_item', _item_id, jsonb_build_object('title', v_item.title), null, 'info');

  return v_staff;
end;
$$;

-- إعادة التوزيع المنضبطة
create or replace function public.reassign_queue_item(_item_id uuid, _to_user uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_item public.platform_queue_items;
  v_ok boolean;
begin
  if v_actor is null or not private.platform_can(v_actor, 'queue.reassign') then
    raise exception 'forbidden: queue.reassign';
  end if;
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'reason is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform_queue:' || _item_id::text, 0));

  select * into v_item from public.platform_queue_items where id = _item_id for update;
  if v_item.id is null then raise exception 'queue item not found'; end if;
  if v_item.status = 'closed' then raise exception 'queue item is closed'; end if;

  select (s.active and s.availability = 'available') into v_ok
    from public.platform_staff s where s.user_id = _to_user;
  if v_ok is not true then raise exception 'target staff is not available'; end if;

  update public.platform_queue_items
     set assigned_to = _to_user, assigned_at = now(),
         status = case when status = 'open' then 'assigned'::public.platform_queue_status else status end,
         updated_at = now()
   where id = _item_id;

  insert into public.permission_audit_log(actor_user_id, target_user_id, target_entity_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (v_actor, _to_user, v_item.entity_id, v_item.project_id, 'platform_queue_item', _item_id, 'reassign',
          jsonb_build_object('assigned_to', v_item.assigned_to),
          jsonb_build_object('assigned_to', _to_user, 'reason', _reason));

  perform private.emit_notification(_to_user, 'platform.queue_reassigned', v_item.project_id, v_item.entity_id,
    'queue_item', _item_id, jsonb_build_object('title', v_item.title, 'reason', _reason), null, 'info');
  if v_item.assigned_to is not null and v_item.assigned_to <> _to_user then
    perform private.emit_notification(v_item.assigned_to, 'platform.queue_reassigned', v_item.project_id, v_item.entity_id,
      'queue_item', _item_id, jsonb_build_object('title', v_item.title, 'reason', _reason), 'from', 'info');
  end if;
end;
$$;

-- تحديث حالة الموظف
create or replace function public.set_platform_staff_state(_user_id uuid, _availability public.platform_availability, _max_concurrent integer default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.platform_can(v_actor, 'staff.manage') then
    raise exception 'forbidden: staff.manage';
  end if;
  update public.platform_staff
     set availability = _availability,
         max_concurrent = coalesce(_max_concurrent, max_concurrent),
         updated_at = now()
   where user_id = _user_id;
  insert into public.permission_audit_log(actor_user_id, target_user_id, object_type, object_id, action, new_value)
  values (v_actor, _user_id, 'platform_staff', _user_id, 'update',
          jsonb_build_object('availability', _availability, 'max_concurrent', _max_concurrent));
end;
$$;

-- إغلاق عنصر يدويًا
create or replace function public.resolve_queue_item(_item_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid(); v_item public.platform_queue_items;
begin
  if v_actor is null or not private.platform_can(v_actor, 'queue.resolve') then
    raise exception 'forbidden: queue.resolve';
  end if;
  select * into v_item from public.platform_queue_items where id = _item_id for update;
  if v_item.id is null then raise exception 'queue item not found'; end if;
  if v_item.assigned_to is distinct from v_actor and not private.platform_can(v_actor,'queue.reassign') then
    raise exception 'forbidden: not assignee';
  end if;
  update public.platform_queue_items
     set status = 'resolved', resolved_at = now(), resolved_by = v_actor,
         close_reason = _reason, updated_at = now()
   where id = _item_id;
  insert into public.permission_audit_log(actor_user_id, object_type, object_id, action, new_value)
  values (v_actor, 'platform_queue_item', _item_id, 'resolve', jsonb_build_object('reason', _reason));
end;
$$;

-- منح وصول Case-based مؤقت (قراءة فقط)
create or replace function public.grant_case_access(_item_id uuid, _staff_user_id uuid, _minutes integer, _reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_item public.platform_queue_items;
  v_grant uuid; v_id uuid; v_exp timestamptz;
begin
  if v_actor is null or not private.platform_can(v_actor, 'case.grant') then
    raise exception 'forbidden: case.grant';
  end if;
  if _reason is null or length(btrim(_reason)) < 5 then raise exception 'reason is required'; end if;
  if _minutes is null or _minutes < 1 or _minutes > 1440 then raise exception 'invalid duration'; end if;

  select * into v_item from public.platform_queue_items where id = _item_id;
  if v_item.id is null then raise exception 'queue item not found'; end if;
  if v_item.project_id is null then raise exception 'queue item has no project scope'; end if;
  if v_item.assigned_to is distinct from _staff_user_id then
    raise exception 'staff is not the assignee of this item';
  end if;
  if not private.is_platform_staff(_staff_user_id) then raise exception 'not platform staff'; end if;

  v_exp := now() + make_interval(mins => _minutes);

  insert into public.permission_grants(subject_user_id, scope_type, scope_project_id, module, action, effect, granted_by, expires_at)
  values (_staff_user_id, 'project', v_item.project_id, 'projects'::public.app_module, 'view'::public.app_action, 'allow', v_actor, v_exp)
  returning id into v_grant;

  insert into public.platform_case_access(grant_id, queue_item_id, staff_user_id, project_id, reason, granted_by, expires_at)
  values (v_grant, _item_id, _staff_user_id, v_item.project_id, _reason, v_actor, v_exp)
  returning id into v_id;

  insert into public.permission_audit_log(actor_user_id, target_user_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, _staff_user_id, v_item.project_id, 'platform_case_access', v_id, 'grant',
          jsonb_build_object('reason', _reason, 'expires_at', v_exp, 'queue_item_id', _item_id));

  perform private.emit_notification(_staff_user_id, 'platform.case_access_granted', v_item.project_id, v_item.entity_id,
    'queue_item', _item_id, jsonb_build_object('expires_at', v_exp), null, 'warning');

  return v_id;
end;
$$;

create or replace function public.revoke_case_access(_case_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid(); v_row public.platform_case_access;
begin
  if v_actor is null or not private.platform_can(v_actor, 'case.grant') then
    raise exception 'forbidden: case.grant';
  end if;
  select * into v_row from public.platform_case_access where id = _case_id;
  if v_row.id is null then raise exception 'not found'; end if;
  update public.platform_case_access set revoked_at = now() where id = _case_id;
  update public.permission_grants set revoked_at = now() where id = v_row.grant_id;
  insert into public.permission_audit_log(actor_user_id, target_user_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, v_row.staff_user_id, v_row.project_id, 'platform_case_access', _case_id, 'revoke', jsonb_build_object('revoked_at', now()));
end;
$$;

-- Break-glass
create or replace function public.request_breakglass(_project_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid(); v_id uuid; r record;
begin
  if v_actor is null or not private.platform_can(v_actor, 'breakglass.request') then
    raise exception 'forbidden: breakglass.request';
  end if;
  if _reason is null or length(btrim(_reason)) < 10 then raise exception 'reason is required'; end if;

  insert into public.platform_breakglass_requests(requested_by, project_id, reason)
  values (v_actor, _project_id, _reason) returning id into v_id;

  insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, _project_id, 'platform_breakglass', v_id, 'request', jsonb_build_object('reason', _reason));

  for r in select user_id from public.platform_staff where active and role = 'superadmin' and user_id <> v_actor loop
    perform private.emit_notification(r.user_id, 'platform.breakglass_requested', _project_id, null,
      'breakglass', v_id, jsonb_build_object('reason', _reason), null, 'critical');
  end loop;

  return v_id;
end;
$$;

create or replace function public.approve_breakglass(_request_id uuid, _minutes integer default 60)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid(); v_req public.platform_breakglass_requests;
  v_grant uuid; v_exp timestamptz; r record;
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

  return v_grant;
end;
$$;

create or replace function public.deny_breakglass(_request_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid(); v_req public.platform_breakglass_requests;
begin
  if v_actor is null or not private.platform_can(v_actor, 'breakglass.approve') then
    raise exception 'forbidden: breakglass.approve';
  end if;
  select * into v_req from public.platform_breakglass_requests where id = _request_id for update;
  if v_req.id is null then raise exception 'not found'; end if;
  if v_req.requested_by = v_actor then raise exception 'separation of duties: self-decision is forbidden'; end if;
  update public.platform_breakglass_requests
     set status = 'denied', denied_reason = _reason, approved_by = v_actor, approved_at = now()
   where id = _request_id;
  insert into public.permission_audit_log(actor_user_id, target_user_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, v_req.requested_by, v_req.project_id, 'platform_breakglass', _request_id, 'deny', jsonb_build_object('reason', _reason));
end;
$$;

-- قراءات
create or replace function public.list_queue_items(_status text default null, _mine boolean default false)
returns setof public.platform_queue_items language plpgsql stable security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.platform_can(v_actor, 'queue.view') then
    raise exception 'forbidden: queue.view';
  end if;
  return query
    select * from public.platform_queue_items q
    where (_status is null or q.status::text = _status)
      and (not _mine or q.assigned_to = v_actor)
    order by q.priority asc, q.created_at asc
    limit 200;
end;
$$;

create or replace function public.platform_me()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid(); v_row public.platform_staff;
begin
  if v_actor is null then return jsonb_build_object('is_staff', false); end if;
  select * into v_row from public.platform_staff where user_id = v_actor;
  return jsonb_build_object(
    'is_staff', v_row.user_id is not null and v_row.active,
    'is_admin', private.is_platform_admin(v_actor),
    'role', v_row.role,
    'availability', v_row.availability,
    'max_concurrent', v_row.max_concurrent
  );
end;
$$;

create or replace function public.list_platform_staff()
returns table(user_id uuid, role public.platform_role, availability public.platform_availability,
              max_concurrent integer, active boolean, current_load integer, full_name text)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.platform_can(v_actor, 'queue.view') then
    raise exception 'forbidden';
  end if;
  return query
  select s.user_id, s.role, s.availability, s.max_concurrent, s.active,
    (select count(*)::int from public.platform_queue_items q
      where q.assigned_to = s.user_id and q.status in ('assigned','in_progress')),
    p.full_name
  from public.platform_staff s
  left join public.profiles p on p.id = s.user_id
  order by s.created_at asc;
end;
$$;

create or replace function public.list_breakglass_requests()
returns setof public.platform_breakglass_requests language plpgsql stable security definer set search_path to 'public' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.platform_can(v_actor, 'queue.view') then
    raise exception 'forbidden';
  end if;
  return query select * from public.platform_breakglass_requests order by created_at desc limit 200;
end;
$$;

-- ============ 9) تريغرات المصادر ============
create or replace function private.tg_entity_verification_queue()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.verified_at is null then
      perform private.upsert_queue_item('entity_verification','entity_profiles', new.entity_id,
        coalesce(new.legal_name_ar, 'توثيق كيان'), new.entity_id, null, 2::smallint);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.verified_at is not null and old.verified_at is null then
      perform private.close_queue_for_source('entity_verification', new.entity_id, 'source_resolved');
    elsif new.verified_at is null and old.verified_at is not null then
      perform private.upsert_queue_item('entity_verification','entity_profiles', new.entity_id,
        coalesce(new.legal_name_ar, 'توثيق كيان'), new.entity_id, null, 2::smallint);
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_entity_verification_queue
after insert or update of verified_at on public.entity_profiles
for each row execute function private.tg_entity_verification_queue();

create or replace function private.tg_template_import_queue()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform private.upsert_queue_item('template_review','report_template_imports', new.id,
      'مراجعة استيراد قالب', new.entity_id, null, 3::smallint);
  elsif new.status is distinct from old.status and new.status in ('applied','failed','rejected','cancelled') then
    perform private.close_queue_for_source('template_review', new.id, 'source_resolved');
  end if;
  return new;
end;
$$;
create trigger trg_template_import_queue
after insert or update of status on public.report_template_imports
for each row execute function private.tg_template_import_queue();

create or replace function private.tg_request_queue_close()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.closed_at is not null and old.closed_at is null then
    perform private.close_queue_for_source('support_ticket', new.id, 'source_resolved');
    perform private.close_queue_for_source('report', new.id, 'source_resolved');
  end if;
  return new;
end;
$$;
create trigger trg_request_queue_close
after update of closed_at on public.requests
for each row execute function private.tg_request_queue_close();

-- ============ 10) سحب الصلاحيات الزائدة ============
revoke insert, update, delete, truncate on public.platform_staff from anon, authenticated;
revoke insert, update, delete, truncate on public.platform_queue_items from anon, authenticated;
revoke insert, update, delete, truncate on public.platform_case_access from anon, authenticated;
revoke insert, update, delete, truncate on public.platform_breakglass_requests from anon, authenticated;
revoke select on public.platform_staff, public.platform_queue_items, public.platform_case_access, public.platform_breakglass_requests from anon;

revoke all on function public.auto_assign_queue_item(uuid) from anon, public;
revoke all on function public.reassign_queue_item(uuid, uuid, text) from anon, public;
revoke all on function public.set_platform_staff_state(uuid, public.platform_availability, integer) from anon, public;
revoke all on function public.resolve_queue_item(uuid, text) from anon, public;
revoke all on function public.grant_case_access(uuid, uuid, integer, text) from anon, public;
revoke all on function public.revoke_case_access(uuid) from anon, public;
revoke all on function public.request_breakglass(uuid, text) from anon, public;
revoke all on function public.approve_breakglass(uuid, integer) from anon, public;
revoke all on function public.deny_breakglass(uuid, text) from anon, public;
revoke all on function public.list_queue_items(text, boolean) from anon, public;
revoke all on function public.platform_me() from anon, public;
revoke all on function public.list_platform_staff() from anon, public;
revoke all on function public.list_breakglass_requests() from anon, public;

grant execute on function public.auto_assign_queue_item(uuid) to authenticated;
grant execute on function public.reassign_queue_item(uuid, uuid, text) to authenticated;
grant execute on function public.set_platform_staff_state(uuid, public.platform_availability, integer) to authenticated;
grant execute on function public.resolve_queue_item(uuid, text) to authenticated;
grant execute on function public.grant_case_access(uuid, uuid, integer, text) to authenticated;
grant execute on function public.revoke_case_access(uuid) to authenticated;
grant execute on function public.request_breakglass(uuid, text) to authenticated;
grant execute on function public.approve_breakglass(uuid, integer) to authenticated;
grant execute on function public.deny_breakglass(uuid, text) to authenticated;
grant execute on function public.list_queue_items(text, boolean) to authenticated;
grant execute on function public.platform_me() to authenticated;
grant execute on function public.list_platform_staff() to authenticated;
grant execute on function public.list_breakglass_requests() to authenticated;