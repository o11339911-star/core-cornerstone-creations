create or replace function public.svc_identity_upsert(
  _user_id uuid, _fingerprint text, _cipher text, _last4 text
) returns text
language plpgsql security definer set search_path to '' as $$
begin
  return private.svc_identity_upsert(_user_id, _fingerprint, _cipher, _last4);
end $$;

create or replace function public.svc_identity_lookup(_fingerprint text)
returns uuid
language plpgsql security definer set search_path to '' as $$
begin
  return private.svc_identity_lookup(_fingerprint);
end $$;

create or replace function public.svc_identity_cipher(_user_id uuid, _actor uuid)
returns text
language plpgsql security definer set search_path to '' as $$
begin
  return private.svc_identity_cipher(_user_id, _actor);
end $$;

create or replace function public.svc_identity_backfill_pending()
returns table (user_id uuid, plain text)
language plpgsql security definer set search_path to '' as $$
begin
  return query select * from private.svc_identity_backfill_pending();
end $$;

revoke all on function public.svc_identity_upsert(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.svc_identity_lookup(text) from public, anon, authenticated;
revoke all on function public.svc_identity_cipher(uuid, uuid) from public, anon, authenticated;
revoke all on function public.svc_identity_backfill_pending() from public, anon, authenticated;
grant execute on function public.svc_identity_upsert(uuid, text, text, text) to service_role;
grant execute on function public.svc_identity_lookup(text) to service_role;
grant execute on function public.svc_identity_cipher(uuid, uuid) to service_role;
grant execute on function public.svc_identity_backfill_pending() to service_role;