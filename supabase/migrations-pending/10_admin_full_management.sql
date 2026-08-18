-- 10 — إدارة كاملة لمدير النظام من لوحة المنصة (مُعلّقة حتى تعود صلاحية Supabase)
--
-- المبدأ: كل فعل كتابي إداري يمر عبر دالة SECURITY DEFINER بـsearch_path مثبت،
-- تتحقق داخليًا أن المستدعي مدير منصة، وتسجّل الفعل في public.permission_audit_log
-- (الفاعل، الفعل، الهدف، السبب، الوقت). لا تُعاد أي بيانات اعتماد إطلاقًا.

/* ------------------------------------------------------------------ *
 * 0) أدوات مشتركة
 * ------------------------------------------------------------------ */

create or replace function private.assert_platform_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  _actor uuid := auth.uid();
begin
  if _actor is null or not private.is_platform_admin(_actor) then
    raise exception 'FORBIDDEN';
  end if;
  return _actor;
end;
$$;

create or replace function private.admin_audit(
  _actor uuid,
  _action text,
  _object_type text,
  _object_id text,
  _reason text,
  _target_user uuid default null,
  _target_entity uuid default null,
  _target_project uuid default null,
  _old jsonb default null,
  _new jsonb default null
)
returns void
language sql
security definer
set search_path = public, private
as $$
  insert into public.permission_audit_log(
    actor_user_id, action, object_type, object_id,
    target_user_id, target_entity_id, target_project_id, old_value, new_value)
  values (
    _actor, _action, _object_type, _object_id,
    _target_user, _target_entity, _target_project,
    _old, coalesce(_new, '{}'::jsonb) || jsonb_build_object('reason', _reason));
$$;

/* ------------------------------------------------------------------ *
 * 1) تجميد الحسابات على مستوى المنصة (يمنع الدخول فعليًا)
 * ------------------------------------------------------------------ */

create table if not exists public.platform_account_suspensions (
  user_id uuid primary key,
  reason text not null,
  suspended_by uuid not null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  lift_reason text
);

revoke insert, update, delete, truncate on public.platform_account_suspensions from anon, authenticated;
revoke select on public.platform_account_suspensions from anon;
grant select on public.platform_account_suspensions to authenticated;
grant all on public.platform_account_suspensions to service_role;

alter table public.platform_account_suspensions enable row level security;

drop policy if exists "platform admins read suspensions" on public.platform_account_suspensions;
create policy "platform admins read suspensions"
on public.platform_account_suspensions
for select
to authenticated
using (private.is_platform_admin(auth.uid()) or user_id = auth.uid());

create or replace function private.account_is_suspended(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.platform_account_suspensions s
    where s.user_id = _user_id and s.lifted_at is null
  );
$$;

-- تعليق الحساب يُضاف إلى التعليق القائم المبني على العضويات (لا يلغيه).
create or replace function private.user_is_suspended(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.account_is_suspended(_user_id)
     or (exists (select 1 from public.entity_memberships m
                 where m.user_id = _user_id and m.status = 'suspended')
        and not exists (select 1 from public.entity_memberships m
                        where m.user_id = _user_id and m.status = 'active'));
$$;

-- تحقق عام يستخدمه تدفق الدخول: هل الحساب الحالي مجمّد؟
create or replace function public.my_account_suspension()
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (select json_build_object('suspended', true, 'reason', s.reason, 'since', s.created_at)
       from public.platform_account_suspensions s
      where s.user_id = auth.uid() and s.lifted_at is null),
    json_build_object('suspended', false));
$$;

create or replace function public.admin_set_user_suspension(
  _user_id uuid, _suspended boolean, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  if _suspended then
    insert into public.platform_account_suspensions(user_id, reason, suspended_by)
    values (_user_id, _reason, _actor)
    on conflict (user_id) do update
      set reason = excluded.reason, suspended_by = excluded.suspended_by,
          created_at = now(), lifted_at = null, lifted_by = null, lift_reason = null;
  else
    update public.platform_account_suspensions
       set lifted_at = now(), lifted_by = _actor, lift_reason = _reason
     where user_id = _user_id and lifted_at is null;
  end if;

  perform private.admin_audit(_actor,
    case when _suspended then 'admin.user.suspend' else 'admin.user.unsuspend' end,
    'user', _user_id::text, _reason, _user_id);

  return json_build_object('ok', true, 'suspended', _suspended);
end;
$$;

/* ------------------------------------------------------------------ *
 * 2) بيانات المستخدم والعضويات
 * ------------------------------------------------------------------ */

create or replace function public.admin_update_user_profile(
  _user_id uuid, _full_name text, _phone text, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _old jsonb;
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  select to_jsonb(p) - 'id' into _old from public.profiles p where p.id = _user_id;
  if _old is null then raise exception 'NOT_FOUND'; end if;

  update public.profiles
     set full_name = coalesce(nullif(btrim(_full_name), ''), full_name),
         phone     = coalesce(nullif(btrim(_phone), ''), phone),
         updated_at = now()
   where id = _user_id;

  perform private.admin_audit(_actor, 'admin.user.profile_update', 'profile', _user_id::text,
    _reason, _user_id, null, null, _old,
    jsonb_build_object('full_name', _full_name, 'phone', _phone));

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_log_identity_reveal(_user_id uuid, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;
  perform private.admin_audit(_actor, 'admin.user.identity_reveal', 'identity',
    _user_id::text, _reason, _user_id);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_membership(
  _membership_id uuid, _role app_role, _status text, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _old jsonb;
  _m record;
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into _m from public.entity_memberships where id = _membership_id;
  if _m is null then raise exception 'NOT_FOUND'; end if;
  _old := to_jsonb(_m);

  update public.entity_memberships
     set role = coalesce(_role, role),
         status = coalesce(nullif(btrim(_status), ''), status)
   where id = _membership_id;

  perform private.admin_audit(_actor, 'admin.membership.update', 'entity_membership',
    _membership_id::text, _reason, _m.user_id, _m.entity_id, null, _old,
    jsonb_build_object('role', _role, 'status', _status));

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_add_membership(
  _user_id uuid, _entity_id uuid, _role app_role, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _id uuid;
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  insert into public.entity_memberships(user_id, entity_id, role, status, invited_by)
  values (_user_id, _entity_id, _role, 'active', _actor)
  returning id into _id;

  perform private.admin_audit(_actor, 'admin.membership.add', 'entity_membership',
    _id::text, _reason, _user_id, _entity_id, null, null,
    jsonb_build_object('role', _role));

  return json_build_object('ok', true, 'membership_id', _id);
end;
$$;

/* ------------------------------------------------------------------ *
 * 3) حذف الحساب عبر مسار محوكم
 * ------------------------------------------------------------------ */

create or replace function public.admin_evaluate_user_erasure(_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  perform private.assert_platform_admin();
  return public.evaluate_erasure_constraints(_user_id);
end;
$$;

create or replace function public.admin_delete_user(
  _user_id uuid, _reason text, _confirm_name text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _name text;
  _eval json;
begin
  if _reason is null or length(btrim(_reason)) < 10 then
    raise exception 'REASON_REQUIRED';
  end if;

  select full_name into _name from public.profiles where id = _user_id;
  if _name is null or btrim(_confirm_name) is distinct from btrim(_name) then
    raise exception 'CONFIRM_MISMATCH';
  end if;

  _eval := public.evaluate_erasure_constraints(_user_id);
  if coalesce((_eval ->> 'can_erase')::boolean, false) is not true then
    raise exception 'ERASURE_BLOCKED';
  end if;

  perform private.admin_audit(_actor, 'admin.user.delete', 'user', _user_id::text,
    _reason, _user_id, null, null, jsonb_build_object('full_name', _name), _eval::jsonb);

  update public.entity_memberships set status = 'revoked'
   where user_id = _user_id and status <> 'revoked';
  delete from auth.users where id = _user_id;

  return json_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------------ *
 * 4) الكيانات
 * ------------------------------------------------------------------ */

create or replace function public.admin_update_entity(
  _entity_id uuid, _name text, _type text, _status text, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _old jsonb;
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  select to_jsonb(e) into _old from public.entities e where e.id = _entity_id;
  if _old is null then raise exception 'NOT_FOUND'; end if;

  update public.entities
     set name = coalesce(nullif(btrim(_name), ''), name),
         type = coalesce(nullif(btrim(_type), ''), type),
         status = coalesce(nullif(btrim(_status), ''), status)
   where id = _entity_id;

  perform private.admin_audit(_actor, 'admin.entity.update', 'entity', _entity_id::text,
    _reason, null, _entity_id, null, _old,
    jsonb_build_object('name', _name, 'type', _type, 'status', _status));

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_entity_suspension(
  _entity_id uuid, _suspended boolean, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.entities
     set status = case when _suspended then 'suspended' else 'active' end
   where id = _entity_id;

  update public.entity_memberships
     set status = case when _suspended then 'suspended' else 'active' end
   where entity_id = _entity_id
     and status in (case when _suspended then 'active' else 'suspended' end);

  perform private.admin_audit(_actor,
    case when _suspended then 'admin.entity.suspend' else 'admin.entity.unsuspend' end,
    'entity', _entity_id::text, _reason, null, _entity_id);

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_entity_dependencies(_entity_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  _projects int; _members int; _contracts int;
begin
  perform private.assert_platform_admin();

  select count(*) into _projects from public.projects
   where entity_id = _entity_id and deleted_at is null and status <> 'closed';
  select count(*) into _members from public.entity_memberships
   where entity_id = _entity_id and status = 'active';
  select count(*) into _contracts from public.contract_parties cp
    join public.contracts c on c.id = cp.contract_id
   where cp.entity_id = _entity_id and c.status in ('active', 'draft');

  return json_build_object(
    'open_projects', _projects,
    'active_members', _members,
    'open_contracts', _contracts,
    'can_delete', (_projects = 0 and _contracts = 0));
end;
$$;

create or replace function public.admin_delete_entity(
  _entity_id uuid, _reason text, _confirm_name text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _name text;
  _deps json;
begin
  if _reason is null or length(btrim(_reason)) < 10 then
    raise exception 'REASON_REQUIRED';
  end if;

  select name into _name from public.entities where id = _entity_id;
  if _name is null then raise exception 'NOT_FOUND'; end if;
  if btrim(_confirm_name) is distinct from btrim(_name) then
    raise exception 'CONFIRM_MISMATCH';
  end if;

  _deps := public.admin_entity_dependencies(_entity_id);
  if coalesce((_deps ->> 'can_delete')::boolean, false) is not true then
    raise exception 'ENTITY_HAS_OBLIGATIONS';
  end if;

  update public.entities set deleted_at = now(), status = 'deleted' where id = _entity_id;
  update public.entity_memberships set status = 'revoked'
   where entity_id = _entity_id and status <> 'revoked';

  perform private.admin_audit(_actor, 'admin.entity.delete', 'entity', _entity_id::text,
    _reason, null, _entity_id, null, jsonb_build_object('name', _name), _deps::jsonb);

  return json_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------------ *
 * 5) المشاريع والمحتوى العام
 * ------------------------------------------------------------------ */

create or replace function public.admin_list_projects(
  _q text default null, _limit int default 50, _offset int default 0)
returns table (
  project_id uuid, name text, status text, entity_id uuid, entity_name text,
  created_at timestamptz, deleted_at timestamptz, total_count bigint)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  perform private.assert_platform_admin();
  return query
  with base as (
    select p.id, p.name, p.status, p.entity_id, e.name as entity_name,
           p.created_at, p.deleted_at
      from public.projects p
      left join public.entities e on e.id = p.entity_id
     where _q is null or p.name ilike '%' || _q || '%' or coalesce(p.code, '') ilike '%' || _q || '%'
  )
  select b.id, b.name, b.status, b.entity_id, b.entity_name, b.created_at, b.deleted_at,
         (select count(*) from base) as total_count
    from base b
   order by b.created_at desc
   limit greatest(_limit, 1) offset greatest(_offset, 0);
end;
$$;

create or replace function public.admin_set_project_state(
  _project_id uuid, _action text, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _old text;
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;
  if _action not in ('suspend', 'cancel', 'reopen') then
    raise exception 'BAD_ACTION';
  end if;

  select status into _old from public.projects where id = _project_id;
  if _old is null then raise exception 'NOT_FOUND'; end if;

  update public.projects
     set status = case _action
                    when 'suspend' then 'suspended'
                    when 'cancel'  then 'cancelled'
                    else 'active' end,
         closed_at = case when _action = 'reopen' then null else now() end,
         closed_by = case when _action = 'reopen' then null else _actor end,
         closure_note = case when _action = 'reopen' then null else _reason end,
         reopened_count = reopened_count + case when _action = 'reopen' then 1 else 0 end,
         updated_at = now()
   where id = _project_id;

  perform private.admin_audit(_actor, 'admin.project.' || _action, 'project',
    _project_id::text, _reason, null, null, _project_id,
    jsonb_build_object('status', _old), null);

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_public_content(
  _kind text, _id uuid, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  if _kind = 'service_listing' then
    update public.service_listings set status = 'removed' where id = _id;
  elsif _kind = 'marketing_asset' then
    delete from public.marketing_assets where id = _id;
  elsif _kind = 'entity_public_profile' then
    delete from public.entity_public_profiles where entity_id = _id;
  else
    raise exception 'BAD_KIND';
  end if;

  perform private.admin_audit(_actor, 'admin.content.remove', _kind, _id::text, _reason);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_entity_verification(
  _entity_id uuid, _status text, _reason text)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _actor uuid := private.assert_platform_admin();
  _old text;
begin
  if _reason is null or length(btrim(_reason)) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;
  if _status not in ('unverified','pending','verified','rejected') then
    raise exception 'INVALID_STATUS';
  end if;

  select verification_status into _old from public.entities where id = _entity_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  update public.entities set verification_status = _status where id = _entity_id;

  perform private.admin_audit(_actor, 'admin.entity.verification', 'entity', _entity_id::text,
    _reason, null, _entity_id, null,
    jsonb_build_object('verification_status', _old),
    jsonb_build_object('verification_status', _status));

  return json_build_object('ok', true);
end;
$$;

/* ------------------------------------------------------------------ *
 * 6) الصلاحيات: سحب من public/anon ومنح صريح لمن يحتاج فقط
 * ------------------------------------------------------------------ */

do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and p.proname in (
              'admin_set_user_suspension','admin_update_user_profile','admin_log_identity_reveal',
              'admin_set_membership','admin_add_membership','admin_evaluate_user_erasure',
              'admin_delete_user','admin_update_entity','admin_set_entity_suspension',
              'admin_entity_dependencies','admin_delete_entity','admin_set_entity_verification','admin_list_projects',
              'admin_set_project_state','admin_remove_public_content','my_account_suspension'))
        or (n.nspname = 'private' and p.proname in (
              'assert_platform_admin','admin_audit','account_is_suspended','user_is_suspended'))
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon', r.nspname, r.proname, r.args);
    if r.nspname = 'public' then
      execute format('grant execute on function %I.%I(%s) to authenticated', r.nspname, r.proname, r.args);
    end if;
  end loop;
end $$;

-- دوال private المستخدمة داخل تعبيرات سياسات RLS تحتاج EXECUTE صريحًا للأدوار المستعلمة.
grant execute on function private.user_is_suspended(uuid) to authenticated;
grant execute on function private.account_is_suspended(uuid) to authenticated;
grant execute on function private.is_platform_admin(uuid) to authenticated;
