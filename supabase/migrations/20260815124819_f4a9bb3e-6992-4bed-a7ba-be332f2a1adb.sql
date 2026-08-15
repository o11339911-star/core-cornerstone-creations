create or replace function public.set_entity_public_publish(
  _entity_id uuid,
  _is_published boolean,
  _portfolio_opt_in boolean default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.can(_uid, 'members'::app_module, 'manage_members'::app_action, _entity_id, null) then
    raise exception 'FORBIDDEN';
  end if;

  update public.entity_public_profiles
     set is_published = _is_published,
         portfolio_opt_in = coalesce(_portfolio_opt_in, portfolio_opt_in),
         published_at = case when _is_published and published_at is null then now() else published_at end
   where entity_id = _entity_id;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.permission_audit_log (actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (_uid, 'status_change', 'entity_public_profiles', _entity_id, _entity_id,
          jsonb_build_object('is_published', _is_published, 'portfolio_opt_in', _portfolio_opt_in));

  return true;
end;
$$;

revoke all on function public.set_entity_public_publish(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_entity_public_publish(uuid, boolean, boolean) to authenticated, service_role;