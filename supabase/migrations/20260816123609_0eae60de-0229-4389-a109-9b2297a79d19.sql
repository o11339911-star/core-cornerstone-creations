-- 1) digit normalisation + validators -------------------------------------
create or replace function private.to_ascii_digits(_v text)
returns text language sql immutable as $$
  select case when _v is null then null else
    translate(btrim(_v),
      U&'\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669\06F0\06F1\06F2\06F3\06F4\06F5\06F6\06F7\06F8\06F9',
      '01234567890123456789')
  end
$$;

create or replace function private.is_valid_saudi_id(_v text)
returns boolean language plpgsql immutable as $$
declare s int := 0; d int; x int; i int;
begin
  if _v is null or _v !~ '^[12][0-9]{9}$' then return false; end if;
  for i in 1..9 loop
    d := substr(_v, i, 1)::int;
    if i % 2 = 1 then
      x := d * 2;
      s := s + (x / 10) + (x % 10);
    else
      s := s + d;
    end if;
  end loop;
  return ((10 - (s % 10)) % 10) = substr(_v, 10, 1)::int;
end;
$$;

create or replace function private.is_valid_unified_number(_v text)
returns boolean language sql immutable as $$
  select _v is not null and _v ~ '^7[0-9]{9}$'
$$;

-- 2) private identity storage ----------------------------------------------
create table if not exists private.personal_identity_links (
  user_id uuid primary key,
  id_hash text not null,
  last4 text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  format_checked_at timestamptz,
  verified_at timestamptz,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.personal_identity_links enable row level security;
revoke all on private.personal_identity_links from public, anon, authenticated;

-- 3) identity RPCs ----------------------------------------------------------
create or replace function public.get_my_identity_status()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare _uid uuid := auth.uid(); _row private.personal_identity_links;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into _row from private.personal_identity_links where user_id = _uid;
  if not found then
    return jsonb_build_object('linked', false, 'status', null, 'last4', null,
      'format_checked_at', null, 'verified_at', null, 'provider', null);
  end if;
  return jsonb_build_object(
    'linked', true, 'status', _row.status, 'last4', _row.last4,
    'format_checked_at', _row.format_checked_at, 'verified_at', _row.verified_at,
    'provider', _row.provider);
end;
$$;

create or replace function public.link_personal_identity(_national_id text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  _uid uuid := auth.uid();
  _v text := private.to_ascii_digits(_national_id);
  _hash text;
  _other record;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.is_valid_saudi_id(_v) then
    raise exception 'INVALID_NATIONAL_ID' using errcode = '22023';
  end if;

  for _other in
    select user_id, id_hash from private.personal_identity_links where user_id <> _uid
  loop
    if _other.id_hash = extensions.crypt(_v, _other.id_hash) then
      raise exception 'IDENTITY_ALREADY_LINKED' using errcode = '23505';
    end if;
  end loop;

  _hash := extensions.crypt(_v, extensions.gen_salt('bf'));

  insert into private.personal_identity_links as l
    (user_id, id_hash, last4, status, format_checked_at, verified_at, provider)
  values (_uid, _hash, right(_v, 4), 'pending', now(), null, null)
  on conflict (user_id) do update set
    id_hash = excluded.id_hash,
    last4 = excluded.last4,
    status = 'pending',
    format_checked_at = now(),
    verified_at = null,
    provider = null,
    updated_at = now();

  _v := null;
  return public.get_my_identity_status();
end;
$$;

revoke all on function private.to_ascii_digits(text) from public;
revoke all on function private.is_valid_saudi_id(text) from public;
revoke all on function private.is_valid_unified_number(text) from public;
revoke all on function public.get_my_identity_status() from public;
revoke all on function public.link_personal_identity(text) from public;
grant execute on function private.to_ascii_digits(text) to authenticated;
grant execute on function private.is_valid_saudi_id(text) to authenticated;
grant execute on function private.is_valid_unified_number(text) to authenticated;
grant execute on function public.get_my_identity_status() to authenticated;
grant execute on function public.link_personal_identity(text) to authenticated;

-- 4) entity unified national number rules -----------------------------------
create or replace function public.create_entity_with_owner(_name text, _type text, _legal_form text, _legal_name_ar text DEFAULT NULL::text, _legal_name_en text DEFAULT NULL::text, _unified_national_number text DEFAULT NULL::text, _cr_number text DEFAULT NULL::text, _tax_number text DEFAULT NULL::text, _contact_email text DEFAULT NULL::text, _contact_phone text DEFAULT NULL::text, _building_no text DEFAULT NULL::text, _street text DEFAULT NULL::text, _district text DEFAULT NULL::text, _city text DEFAULT NULL::text, _postal_code text DEFAULT NULL::text, _additional_no text DEFAULT NULL::text, _responsible_name text DEFAULT NULL::text, _responsible_title text DEFAULT NULL::text, _responsible_email text DEFAULT NULL::text, _responsible_phone text DEFAULT NULL::text)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  _uid uuid := auth.uid();
  _entity_id uuid;
  _owned int;
  _unn text;
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if _type is null or _type not in ('developer','contractor','company','design_office','supervision','inspector') then
    raise exception 'INVALID_TYPE' using errcode = '22023';
  end if;
  if _legal_form is null or _legal_form not in ('individual','company','establishment','government','association','fund','partnership') then
    raise exception 'INVALID_LEGAL_FORM' using errcode = '22023';
  end if;
  if _name is null or length(btrim(_name)) < 2 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  _unn := nullif(btrim(coalesce(private.to_ascii_digits(_unified_national_number),'')),'');
  if _unn is null and _legal_form in ('company','establishment','partnership') then
    raise exception 'UNIFIED_NUMBER_REQUIRED' using errcode = '22023';
  end if;
  if _unn is not null and not private.is_valid_unified_number(_unn) then
    raise exception 'INVALID_UNIFIED_NUMBER' using errcode = '22023';
  end if;

  select count(*) into _owned
  from public.entity_memberships m
  join public.entities e on e.id = m.entity_id and e.deleted_at is null
  where m.user_id = _uid and m.role = 'owner' and m.status = 'active';

  if _owned >= 10 then
    raise exception 'ENTITY_LIMIT_REACHED' using errcode = '42501';
  end if;

  insert into public.entities (name, type, status)
  values (btrim(_name), _type, 'active')
  returning id into _entity_id;

  begin
    insert into public.entity_profiles (
      entity_id, legal_form, legal_name_ar, legal_name_en,
      unified_national_number, cr_number, tax_number,
      contact_email, contact_phone,
      building_no, street, district, city, postal_code, additional_no,
      responsible_name, responsible_title, responsible_email, responsible_phone,
      verification_status, verified_at, verification_note
    ) values (
      _entity_id, _legal_form, nullif(btrim(coalesce(_legal_name_ar,'')),''), nullif(btrim(coalesce(_legal_name_en,'')),''),
      _unn, nullif(btrim(coalesce(private.to_ascii_digits(_cr_number),'')),''), nullif(btrim(coalesce(private.to_ascii_digits(_tax_number),'')),''),
      nullif(btrim(coalesce(_contact_email,'')),''), nullif(btrim(coalesce(_contact_phone,'')),''),
      nullif(btrim(coalesce(private.to_ascii_digits(_building_no),'')),''), nullif(btrim(coalesce(_street,'')),''), nullif(btrim(coalesce(_district,'')),''),
      nullif(btrim(coalesce(_city,'')),''), nullif(btrim(coalesce(private.to_ascii_digits(_postal_code),'')),''), nullif(btrim(coalesce(private.to_ascii_digits(_additional_no),'')),''),
      nullif(btrim(coalesce(_responsible_name,'')),''), nullif(btrim(coalesce(_responsible_title,'')),''),
      nullif(btrim(coalesce(_responsible_email,'')),''), nullif(btrim(coalesce(_responsible_phone,'')),''),
      'pending', null,
      case when _unn is not null then 'تم التحقق من صيغة الرقم الموحد فقط؛ التوثيق الرسمي بانتظار تفعيل التكامل الحكومي.' else null end
    );
  exception when unique_violation then
    raise exception 'OFFICIAL_ID_ALREADY_REGISTERED' using errcode = '23505';
  end;

  insert into public.entity_memberships (entity_id, user_id, role, status)
  values (_entity_id, _uid, 'owner', 'active');

  return _entity_id;
end;
$function$;

create or replace function public.update_entity_official(_entity_id uuid, _legal_form text DEFAULT NULL::text, _legal_name_ar text DEFAULT NULL::text, _legal_name_en text DEFAULT NULL::text, _unified_national_number text DEFAULT NULL::text, _cr_number text DEFAULT NULL::text, _tax_number text DEFAULT NULL::text, _contact_email text DEFAULT NULL::text, _contact_phone text DEFAULT NULL::text, _building_no text DEFAULT NULL::text, _street text DEFAULT NULL::text, _district text DEFAULT NULL::text, _city text DEFAULT NULL::text, _postal_code text DEFAULT NULL::text, _additional_no text DEFAULT NULL::text, _responsible_name text DEFAULT NULL::text, _responsible_title text DEFAULT NULL::text, _responsible_email text DEFAULT NULL::text, _responsible_phone text DEFAULT NULL::text)
returns boolean language plpgsql security definer set search_path to '' as $function$
declare
  _uid uuid := auth.uid();
  _unn text;
  _clear_unn boolean := false;
  _current record;
  _final_form text;
  _final_unn text;
  _changed boolean := false;
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = _uid and m.entity_id = _entity_id
      and m.status = 'active' and m.role in ('owner','admin')
      and (m.expires_at is null or m.expires_at > now())
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if _legal_form is not null and _legal_form not in ('individual','company','establishment','government','association','fund','partnership') then
    raise exception 'INVALID_LEGAL_FORM' using errcode = '22023';
  end if;

  select legal_form, unified_national_number into _current
    from public.entity_profiles where entity_id = _entity_id for update;

  _unn := nullif(btrim(coalesce(private.to_ascii_digits(_unified_national_number),'')),'');
  _clear_unn := _unified_national_number is not null and _unn is null;

  _final_form := coalesce(_legal_form, _current.legal_form);
  _final_unn := case when _clear_unn then null else coalesce(_unn, _current.unified_national_number) end;

  if _unn is not null and not private.is_valid_unified_number(_unn) then
    raise exception 'INVALID_UNIFIED_NUMBER' using errcode = '22023';
  end if;
  if _final_unn is null and _final_form in ('company','establishment','partnership') then
    raise exception 'UNIFIED_NUMBER_REQUIRED' using errcode = '22023';
  end if;

  _changed := _final_unn is distinct from _current.unified_national_number;

  begin
    update public.entity_profiles set
      legal_form = coalesce(_legal_form, legal_form),
      legal_name_ar = coalesce(nullif(btrim(coalesce(_legal_name_ar,'')),''), legal_name_ar),
      legal_name_en = coalesce(nullif(btrim(coalesce(_legal_name_en,'')),''), legal_name_en),
      unified_national_number = _final_unn,
      cr_number = coalesce(nullif(btrim(coalesce(private.to_ascii_digits(_cr_number),'')),''), cr_number),
      tax_number = coalesce(nullif(btrim(coalesce(private.to_ascii_digits(_tax_number),'')),''), tax_number),
      contact_email = coalesce(nullif(btrim(coalesce(_contact_email,'')),''), contact_email),
      contact_phone = coalesce(nullif(btrim(coalesce(_contact_phone,'')),''), contact_phone),
      building_no = coalesce(nullif(btrim(coalesce(private.to_ascii_digits(_building_no),'')),''), building_no),
      street = coalesce(nullif(btrim(coalesce(_street,'')),''), street),
      district = coalesce(nullif(btrim(coalesce(_district,'')),''), district),
      city = coalesce(nullif(btrim(coalesce(_city,'')),''), city),
      postal_code = coalesce(nullif(btrim(coalesce(private.to_ascii_digits(_postal_code),'')),''), postal_code),
      additional_no = coalesce(nullif(btrim(coalesce(private.to_ascii_digits(_additional_no),'')),''), additional_no),
      responsible_name = coalesce(nullif(btrim(coalesce(_responsible_name,'')),''), responsible_name),
      responsible_title = coalesce(nullif(btrim(coalesce(_responsible_title,'')),''), responsible_title),
      responsible_email = coalesce(nullif(btrim(coalesce(_responsible_email,'')),''), responsible_email),
      responsible_phone = coalesce(nullif(btrim(coalesce(_responsible_phone,'')),''), responsible_phone),
      verification_status = case when _changed then 'pending' else verification_status end,
      verified_at = case when _changed then null else verified_at end,
      verification_note = case
        when _changed and _final_unn is not null
          then 'تم التحقق من صيغة الرقم الموحد فقط؛ التوثيق الرسمي بانتظار تفعيل التكامل الحكومي.'
        when _changed then null
        else verification_note end,
      updated_at = now()
    where entity_id = _entity_id;
  exception when unique_violation then
    raise exception 'OFFICIAL_ID_ALREADY_REGISTERED' using errcode = '23505';
  end;

  return true;
end;
$function$;

revoke all on function public.create_entity_with_owner(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.update_entity_official(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.create_entity_with_owner(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.update_entity_official(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;