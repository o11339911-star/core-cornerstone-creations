create or replace function private.looks_like_secret_pattern(_txt text)
returns boolean language sql immutable set search_path = public as $$
  select _txt is not null and (
    _txt ~ '-----BEGIN'
    or _txt ~ '(^|[^A-Za-z0-9])sk_[A-Za-z0-9]{8,}'
    or _txt ~ 'eyJ[A-Za-z0-9_-]{12,}'
    or _txt ~* '(api[_-]?key|secret|password|token)\s*[:=]\s*\S'
    or _txt ~ '[A-Za-z0-9_-]{40,}'
  )
$$;

create or replace function private.reject_secret_values()
returns trigger language plpgsql set search_path = public as $$
declare v text;
begin
  foreach v in array coalesce(new.secret_env_names, '{}') loop
    if v !~ '^[A-Z][A-Z0-9_]{2,64}$' or private.looks_like_secret_pattern(v) then
      raise exception 'SECRET_VALUE_NOT_ALLOWED';
    end if;
  end loop;
  if private.looks_like_secret_pattern(new.exchanged_fields::text)
     or private.looks_like_secret_pattern(coalesce(new.legal_basis,''))
     or private.looks_like_secret_pattern(coalesce(new.purpose,''))
     or private.looks_like_secret_pattern(coalesce(new.webhook_url,''))
     or private.looks_like_secret_pattern(coalesce(new.live_approval_ref,'')) then
    raise exception 'SECRET_VALUE_NOT_ALLOWED';
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke execute on function private.looks_like_secret_pattern(text) from public;