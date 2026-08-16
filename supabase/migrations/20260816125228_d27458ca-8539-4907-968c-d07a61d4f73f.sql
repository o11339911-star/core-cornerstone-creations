drop function if exists public.admin_search_identities(text);

create function public.admin_search_identities(_query text)
returns jsonb
language plpgsql
-- VOLATILE on purpose: the function writes an audit event.
security definer
set search_path to ''
as $function$
declare
  _uid uuid := auth.uid();
  _q text := btrim(coalesce(_query, ''));
  _normalized text := private.to_ascii_digits(_q);
  _digits text := null;
  _rows jsonb;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.is_platform_admin(_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if length(_q) < 2 then return '[]'::jsonb; end if;

  -- Numeric branch only when the whole input is digits; otherwise search by name.
  if _normalized ~ '^[0-9]+$' then
    _digits := _normalized;
  end if;

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
    where case
            when _digits is not null
              then private.decrypt_identity(l.id_encrypted) = _digits or l.last4 = _digits
            else p.full_name ilike '%' || _q || '%'
          end
    limit 20
  ) s;

  -- Audit payload carries the match count only: never the number, hash or ciphertext.
  perform private.log_identity_access(_uid, 'admin_search', null, jsonb_array_length(_rows));
  return _rows;
end;
$function$;

revoke execute on function public.admin_search_identities(text) from public, anon;
grant execute on function public.admin_search_identities(text) to authenticated;

-- Re-assert least privilege on the crypto helpers and the key accessor.
revoke execute on function private.identity_key() from public, anon, authenticated;
revoke execute on function private.encrypt_identity(text) from public, anon, authenticated;
revoke execute on function private.decrypt_identity(bytea) from public, anon, authenticated;
revoke execute on function private.log_identity_access(uuid, text, uuid, integer) from public, anon, authenticated;
revoke usage on schema private from anon, authenticated;