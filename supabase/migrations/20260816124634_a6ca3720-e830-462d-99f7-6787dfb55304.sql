-- 1) Reversible (but key-protected) storage next to the existing bcrypt hash.
alter table private.personal_identity_links
  add column if not exists id_encrypted bytea;

-- Random 32-byte key kept in Supabase Vault. Never hardcoded, never logged.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'personal_identity_enc_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'personal_identity_enc_key',
      'Symmetric key for private.personal_identity_links.id_encrypted'
    );
  end if;
end$$;

create or replace function private.identity_key()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'personal_identity_enc_key'
$$;

create or replace function private.encrypt_identity(_value text)
returns bytea
language sql
security definer
set search_path to ''
as $$
  select extensions.pgp_sym_encrypt(_value, private.identity_key())
$$;

create or replace function private.decrypt_identity(_value bytea)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case when _value is null then null
              else extensions.pgp_sym_decrypt(_value, private.identity_key()) end
$$;

-- Audit helper: records that a lookup happened, never what the value was.
create or replace function private.log_identity_access(
  _actor uuid, _action text, _target uuid, _matches integer
)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.permission_audit_log
    (actor_user_id, target_user_id, object_type, object_id, action, new_value)
  values (_actor, _target, 'personal_identity', _target, _action,
          jsonb_build_object('matches', _matches));
$$;

-- 2) Store the encrypted copy on link/update.
create or replace function public.link_personal_identity(_national_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
    (user_id, id_hash, id_encrypted, last4, status, format_checked_at, verified_at, provider)
  values (_uid, _hash, private.encrypt_identity(_v), right(_v, 4), 'pending', now(), null, null)
  on conflict (user_id) do update set
    id_hash = excluded.id_hash,
    id_encrypted = excluded.id_encrypted,
    last4 = excluded.last4,
    status = 'pending',
    format_checked_at = now(),
    verified_at = null,
    provider = null,
    updated_at = now();

  _v := null;
  return public.get_my_identity_status();
end;
$function$;

-- 3) Owner-only full number.
create or replace function public.get_my_identity_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare _uid uuid := auth.uid(); _row private.personal_identity_links;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into _row from private.personal_identity_links where user_id = _uid;
  if not found then
    return jsonb_build_object('linked', false, 'status', null, 'last4', null,
      'national_id', null, 'format_checked_at', null, 'verified_at', null, 'provider', null);
  end if;
  return jsonb_build_object(
    'linked', true, 'status', _row.status, 'last4', _row.last4,
    -- Only ever returned to the owner of the row (user_id = auth.uid()).
    'national_id', private.decrypt_identity(_row.id_encrypted),
    'format_checked_at', _row.format_checked_at, 'verified_at', _row.verified_at,
    'provider', _row.provider);
end;
$function$;

-- 4) Platform-admin search by name or identity number.
create or replace function public.admin_search_identities(_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  _uid uuid := auth.uid();
  _q text := btrim(coalesce(_query, ''));
  _digits text := private.to_ascii_digits(_q);
  _rows jsonb;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.is_platform_admin(_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(_q) < 2 then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(r order by r->>'full_name'), '[]'::jsonb) into _rows
  from (
    select jsonb_build_object(
             'user_id', p.id,
             'full_name', p.full_name,
             'status', l.status,
             'last4', l.last4,
             'national_id', private.decrypt_identity(l.id_encrypted),
             'verified_at', l.verified_at
           ) as r
    from private.personal_identity_links l
    join public.profiles p on p.id = l.user_id
    where (_digits <> '' and private.decrypt_identity(l.id_encrypted) = _digits)
       or (_digits <> '' and l.last4 = _digits)
       or (_digits = '' and p.full_name ilike '%' || _q || '%')
    limit 20
  ) s;

  perform private.log_identity_access(_uid, 'admin_search', null, jsonb_array_length(_rows));
  return _rows;
end;
$function$;

-- 5) Contract lookup: exact 10-digit match only, for contract managers, rate limited.
create or replace function public.lookup_identity_for_contract(
  _project_id uuid, _national_id text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _uid uuid := auth.uid();
  _v text := private.to_ascii_digits(coalesce(_national_id, ''));
  _row record;
  _recent integer;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not (private.can(_uid, 'contracts', 'update', null, _project_id)
          or private.can(_uid, 'contracts', 'create', null, _project_id)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not private.is_valid_saudi_id(_v) then
    raise exception 'INVALID_NATIONAL_ID' using errcode = '22023';
  end if;

  select count(*) into _recent
  from public.permission_audit_log
  where actor_user_id = _uid
    and object_type = 'personal_identity'
    and action = 'contract_lookup'
    and created_at > now() - interval '1 hour';
  if _recent >= 30 then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  select p.id as user_id, p.full_name, l.status, l.last4, l.verified_at
    into _row
  from private.personal_identity_links l
  join public.profiles p on p.id = l.user_id
  where private.decrypt_identity(l.id_encrypted) = _v
  limit 1;

  if not found then
    perform private.log_identity_access(_uid, 'contract_lookup', null, 0);
    return jsonb_build_object('found', false);
  end if;

  perform private.log_identity_access(_uid, 'contract_lookup', _row.user_id, 1);
  return jsonb_build_object(
    'found', true,
    'user_id', _row.user_id,
    'full_name', _row.full_name,
    'status', _row.status,
    'last4', _row.last4,
    -- Safe to echo: the caller typed this exact number.
    'national_id', _v,
    'verified_at', _row.verified_at);
end;
$function$;

-- 6) Attach a looked-up person as a contract party.
create or replace function public.add_contract_person_party(
  _contract_id uuid, _user_id uuid, _contract_role text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare _uid uuid := auth.uid(); _id uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.can_manage_contract(_uid, _contract_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = _user_id) then
    raise exception 'TARGET_NOT_FOUND' using errcode = '22023';
  end if;
  if coalesce(btrim(_contract_role), '') = '' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  insert into public.contract_parties (contract_id, user_id, contract_role)
  values (_contract_id, _user_id, btrim(_contract_role))
  returning id into _id;
  return _id;
end;
$function$;

-- 7) Least-privilege execution.
revoke execute on function private.identity_key() from public;
revoke execute on function private.encrypt_identity(text) from public;
revoke execute on function private.decrypt_identity(bytea) from public;
revoke execute on function private.log_identity_access(uuid, text, uuid, integer) from public;
revoke execute on function public.link_personal_identity(text) from public;
revoke execute on function public.get_my_identity_status() from public;
revoke execute on function public.admin_search_identities(text) from public;
revoke execute on function public.lookup_identity_for_contract(uuid, text) from public;
revoke execute on function public.add_contract_person_party(uuid, uuid, text) from public;

grant execute on function public.link_personal_identity(text) to authenticated;
grant execute on function public.get_my_identity_status() to authenticated;
grant execute on function public.admin_search_identities(text) to authenticated;
grant execute on function public.lookup_identity_for_contract(uuid, text) to authenticated;
grant execute on function public.add_contract_person_party(uuid, uuid, text) to authenticated;