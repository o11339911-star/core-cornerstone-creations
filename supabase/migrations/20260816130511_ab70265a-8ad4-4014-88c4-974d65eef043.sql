-- Registration completion gate: state derived from source of truth only.

create or replace function public.get_registration_completion_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _bypass boolean := false;
  _identity boolean := false;
  _entity boolean := false;
begin
  if _uid is null then
    raise exception 'FORBIDDEN';
  end if;

  select exists (select 1 from public.platform_admins pa where pa.user_id = _uid)
      or exists (select 1 from public.platform_staff ps where ps.user_id = _uid and ps.active)
    into _bypass;

  select exists (
    select 1 from private.personal_identity_links l
    where l.user_id = _uid and l.status in ('pending', 'verified')
  ) into _identity;

  select exists (
    select 1
    from public.entity_memberships m
    join public.entities e on e.id = m.entity_id
    join public.entity_profiles p on p.entity_id = e.id
    where m.user_id = _uid
      and m.status = 'active'
      and e.status = 'active'
      and e.deleted_at is null
      and p.unified_national_number ~ '^7[0-9]{9}$'
  ) into _entity;

  return jsonb_build_object(
    'bypass', _bypass,
    'identity_complete', _identity,
    'entity_complete', _entity,
    'complete', _bypass or (_identity and _entity),
    'current_step',
      case
        when _bypass or (_identity and _entity) then 'complete'
        when not _identity then 'identity'
        else 'entity'
      end
  );
end;
$$;

revoke all on function public.get_registration_completion_state() from public, anon;
grant execute on function public.get_registration_completion_state() to authenticated;

-- Registration-time commercial entity creation.
create or replace function public.complete_registration_entity(
  _name text,
  _type text,
  _legal_form text,
  _unified_national_number text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _entity_id uuid;
begin
  if _uid is null then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from private.personal_identity_links l
    where l.user_id = _uid and l.status in ('pending', 'verified')
  ) then
    raise exception 'IDENTITY_REQUIRED';
  end if;

  if _type not in ('developer','contractor','company','design_office','supervision','inspector') then
    raise exception 'INVALID_TYPE';
  end if;

  if _legal_form not in ('company','establishment','partnership') then
    raise exception 'INVALID_LEGAL_FORM';
  end if;

  if _unified_national_number !~ '^7[0-9]{9}$' then
    raise exception 'INVALID_UNIFIED_NUMBER';
  end if;

  -- Never auto-join an existing entity just because its number is known.
  if exists (
    select 1 from public.entity_profiles p
    where p.unified_national_number = _unified_national_number
  ) then
    raise exception 'OFFICIAL_ID_ALREADY_REGISTERED';
  end if;

  _entity_id := public.create_entity_with_owner(
    _name := _name,
    _type := _type,
    _legal_form := _legal_form,
    _unified_national_number := _unified_national_number
  );

  return _entity_id;
end;
$$;

revoke all on function public.complete_registration_entity(text, text, text, text) from public, anon;
grant execute on function public.complete_registration_entity(text, text, text, text) to authenticated;