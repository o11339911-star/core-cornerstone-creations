-- 1) throttle store (server-only)
create table if not exists private.auth_throttle (
  key text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.svc_auth_throttle(_key text, _limit integer, _window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare _row private.auth_throttle;
begin
  if _key is null or length(_key) = 0 then return false; end if;
  insert into private.auth_throttle(key, window_start, attempts, updated_at)
  values (_key, now(), 1, now())
  on conflict (key) do update set
    window_start = case when private.auth_throttle.window_start < now() - make_interval(secs => _window_seconds)
                        then now() else private.auth_throttle.window_start end,
    attempts = case when private.auth_throttle.window_start < now() - make_interval(secs => _window_seconds)
                    then 1 else private.auth_throttle.attempts + 1 end,
    updated_at = now()
  returning * into _row;
  delete from private.auth_throttle where updated_at < now() - interval '1 day';
  return _row.attempts <= greatest(_limit, 1);
end;
$$;

-- 2) attach identity at signup time (called only by the server with service_role)
create or replace function public.svc_register_identity(_user_id uuid, _national_id text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  _v text := private.to_ascii_digits(coalesce(_national_id, ''));
  _other record;
begin
  if _user_id is null then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  if not private.is_valid_saudi_id(_v) then
    raise exception 'INVALID_NATIONAL_ID' using errcode = '22023';
  end if;

  for _other in select user_id, id_hash from private.personal_identity_links where user_id <> _user_id
  loop
    if _other.id_hash = extensions.crypt(_v, _other.id_hash) then
      raise exception 'IDENTITY_ALREADY_LINKED' using errcode = '23505';
    end if;
  end loop;

  insert into private.personal_identity_links as l
    (user_id, id_hash, id_encrypted, last4, status, format_checked_at, verified_at, provider)
  values (_user_id, extensions.crypt(_v, extensions.gen_salt('bf')), private.encrypt_identity(_v),
          right(_v, 4), 'pending', now(), null, null)
  on conflict (user_id) do update set
    id_hash = excluded.id_hash,
    id_encrypted = excluded.id_encrypted,
    last4 = excluded.last4,
    status = 'pending',
    format_checked_at = now(),
    updated_at = now();

  _v := null;
end;
$$;

-- 3) resolve login identifier -> internal user id only (never email)
create or replace function public.svc_resolve_identity_login(_national_id text)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  _v text := private.to_ascii_digits(coalesce(_national_id, ''));
  _uid uuid;
begin
  if not private.is_valid_saudi_id(_v) then return null; end if;
  select l.user_id into _uid
  from private.personal_identity_links l
  where private.decrypt_identity(l.id_encrypted) = _v
  limit 1;
  return _uid;
end;
$$;

-- 4) lock down execution: server only
revoke all on function public.svc_auth_throttle(text, integer, integer) from public, anon, authenticated;
revoke all on function public.svc_register_identity(uuid, text) from public, anon, authenticated;
revoke all on function public.svc_resolve_identity_login(text) from public, anon, authenticated;
grant execute on function public.svc_auth_throttle(text, integer, integer) to service_role;
grant execute on function public.svc_register_identity(uuid, text) to service_role;
grant execute on function public.svc_resolve_identity_login(text) to service_role;