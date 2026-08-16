create or replace function public.admin_list_users(_q text default null, _limit integer default 50, _offset integer default 0)
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  identity_status text,
  identity_last4 text,
  active_memberships integer,
  registration_complete boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _lim integer := least(greatest(coalesce(_limit, 50), 1), 100);
  _off integer := greatest(coalesce(_offset, 0), 0);
  _term text := nullif(btrim(coalesce(_q, '')), '');
  _digits text;
  _rows integer;
begin
  if _actor is null or not private.is_platform_admin(_actor) then
    raise exception 'FORBIDDEN';
  end if;

  _digits := private.to_ascii_digits(coalesce(_term, ''));
  if _digits !~ '^[0-9]+$' then
    _digits := null;
  end if;

  return query
  with base as (
    select
      u.id as user_id,
      p.full_name,
      u.email::text as email,
      p.phone,
      u.created_at,
      u.last_sign_in_at,
      (u.email_confirmed_at is not null) as email_confirmed,
      l.status as identity_status,
      l.last4 as identity_last4,
      (
        select count(*)::integer
        from public.entity_memberships m
        join public.entities e on e.id = m.entity_id
        where m.user_id = u.id
          and m.status = 'active'
          and e.status = 'active'
          and e.deleted_at is null
      ) as active_memberships,
      (
        coalesce(l.status in ('pending', 'verified'), false)
        and exists (
          select 1
          from public.entity_memberships m
          join public.entities e on e.id = m.entity_id
          join public.entity_profiles ep on ep.entity_id = e.id
          where m.user_id = u.id
            and m.status = 'active'
            and e.status = 'active'
            and e.deleted_at is null
            and ep.unified_national_number ~ '^7[0-9]{9}$'
        )
      ) as registration_complete
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join private.personal_identity_links l on l.user_id = u.id
    where u.deleted_at is null
      and (
        _term is null
        or p.full_name ilike '%' || _term || '%'
        or u.email::text ilike '%' || _term || '%'
        or (_digits is not null and private.to_ascii_digits(coalesce(p.phone, '')) like '%' || _digits || '%')
        or (_digits is not null and l.last4 = _digits)
      )
  ), counted as (
    select count(*) as n from base
  )
  select b.user_id, b.full_name, b.email, b.phone, b.created_at, b.last_sign_in_at,
         b.email_confirmed, b.identity_status, b.identity_last4, b.active_memberships,
         b.registration_complete, c.n
  from base b cross join counted c
  order by b.created_at desc
  limit _lim offset _off;

  get diagnostics _rows = row_count;

  insert into public.permission_audit_log (actor_user_id, object_type, action, new_value)
  values (_actor, 'platform_admins', 'admin_search', jsonb_build_object('list', 'users', 'matches', _rows));
end;
$$;

create or replace function public.admin_list_entities(_q text default null, _limit integer default 50, _offset integer default 0)
returns table (
  entity_id uuid,
  name text,
  type text,
  status text,
  legal_form text,
  unified_national_number text,
  verification_status text,
  created_at timestamptz,
  members_count integer,
  owner_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _lim integer := least(greatest(coalesce(_limit, 50), 1), 100);
  _off integer := greatest(coalesce(_offset, 0), 0);
  _term text := nullif(btrim(coalesce(_q, '')), '');
  _digits text;
  _rows integer;
begin
  if _actor is null or not private.is_platform_admin(_actor) then
    raise exception 'FORBIDDEN';
  end if;

  _digits := private.to_ascii_digits(coalesce(_term, ''));
  if _digits !~ '^[0-9]+$' then
    _digits := null;
  end if;

  return query
  with base as (
    select
      e.id as entity_id,
      e.name,
      e.type,
      e.status,
      ep.legal_form,
      ep.unified_national_number,
      coalesce(ep.verification_status, 'unverified') as verification_status,
      e.created_at,
      (
        select count(*)::integer
        from public.entity_memberships m
        where m.entity_id = e.id and m.status = 'active'
      ) as members_count,
      (
        select pr.full_name
        from public.entity_memberships m
        left join public.profiles pr on pr.id = m.user_id
        where m.entity_id = e.id and m.status = 'active' and m.role = 'owner'
        order by m.created_at asc
        limit 1
      ) as owner_name
    from public.entities e
    left join public.entity_profiles ep on ep.entity_id = e.id
    where e.deleted_at is null
      and (
        _term is null
        or e.name ilike '%' || _term || '%'
        or (_digits is not null and coalesce(ep.unified_national_number, '') like '%' || _digits || '%')
      )
  ), counted as (
    select count(*) as n from base
  )
  select b.entity_id, b.name, b.type, b.status, b.legal_form, b.unified_national_number,
         b.verification_status, b.created_at, b.members_count, b.owner_name, c.n
  from base b cross join counted c
  order by b.created_at desc
  limit _lim offset _off;

  get diagnostics _rows = row_count;

  insert into public.permission_audit_log (actor_user_id, object_type, action, new_value)
  values (_actor, 'platform_admins', 'admin_search', jsonb_build_object('list', 'entities', 'matches', _rows));
end;
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public, anon;
revoke execute on function public.admin_list_entities(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_list_entities(text, integer, integer) to authenticated;