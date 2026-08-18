-- 08 — تفاصيل إدارية للمستخدم والكيان (لوحة المنصة)
-- تُقرأ فقط من قِبل مدير المنصة (private.is_platform_admin) ولا تُعيد أي أسرار:
-- لا كلمات مرور، لا رموز، لا هوية مشفّرة، لا بيانات وصفية خام.
-- ملاحظة: هذه المهاجرة مُعلّقة حتى تعود صلاحية الكتابة إلى Supabase.

create or replace function public.admin_get_user(_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _res json;
begin
  if not private.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  select json_build_object(
    'user_id', u.id,
    'email', u.email,
    'email_confirmed', (u.email_confirmed_at is not null),
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'full_name', p.full_name,
    'phone', p.phone,
    'locale', p.locale,
    'city', p.city,
    'district', p.district,
    'memberships', coalesce((
      select json_agg(json_build_object(
        'membership_id', m.id,
        'entity_id', e.id,
        'entity_name', e.name,
        'entity_type', e.type,
        'entity_status', e.status,
        'role', m.role,
        'status', m.status,
        'created_at', m.created_at,
        'expires_at', m.expires_at
      ) order by m.created_at desc)
      from public.entity_memberships m
      join public.entities e on e.id = m.entity_id
      where m.user_id = u.id
    ), '[]'::json)
  )
  into _res
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = _user_id;

  if _res is null then
    raise exception 'NOT_FOUND';
  end if;
  return _res;
end;
$$;

create or replace function public.admin_get_entity(_entity_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _res json;
begin
  if not private.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  select json_build_object(
    'entity_id', e.id,
    'name', e.name,
    'type', e.type,
    'status', e.status,
    'created_at', e.created_at,
    'deleted_at', e.deleted_at,
    'members', coalesce((
      select json_agg(json_build_object(
        'membership_id', m.id,
        'user_id', m.user_id,
        'full_name', p.full_name,
        'role', m.role,
        'status', m.status,
        'created_at', m.created_at,
        'expires_at', m.expires_at
      ) order by m.created_at desc)
      from public.entity_memberships m
      left join public.profiles p on p.id = m.user_id
      where m.entity_id = e.id
    ), '[]'::json)
  )
  into _res
  from public.entities e
  where e.id = _entity_id;

  if _res is null then
    raise exception 'NOT_FOUND';
  end if;
  return _res;
end;
$$;

revoke execute on function public.admin_get_user(uuid) from public, anon;
revoke execute on function public.admin_get_entity(uuid) from public, anon;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_get_entity(uuid) to authenticated;
