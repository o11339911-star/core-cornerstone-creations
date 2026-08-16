create or replace function public.set_listing_context(_listing_id uuid, _project_id uuid default null, _request_id uuid default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare _entity uuid;
begin
  select entity_id into _entity from public.service_listings where id = _listing_id;
  if _entity is null then raise exception 'LISTING_NOT_FOUND' using errcode='P0002'; end if;
  if not private.is_active_member(auth.uid(), _entity) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.service_listings set project_id = _project_id, request_id = _request_id where id = _listing_id;
end $$;
revoke all on function public.set_listing_context(uuid, uuid, uuid) from public;
grant execute on function public.set_listing_context(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.set_listing_archived(_listing_id uuid, _archived boolean)
returns void language plpgsql security definer set search_path = public, private as $$
declare _entity uuid;
begin
  select entity_id into _entity from public.service_listings where id = _listing_id;
  if _entity is null then raise exception 'LISTING_NOT_FOUND' using errcode='P0002'; end if;
  if not private.is_active_member(auth.uid(), _entity) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  update public.service_listings set archived_at = case when _archived then now() else null end where id = _listing_id;
end $$;
revoke all on function public.set_listing_archived(uuid, boolean) from public;
grant execute on function public.set_listing_archived(uuid, boolean) to authenticated, service_role;
