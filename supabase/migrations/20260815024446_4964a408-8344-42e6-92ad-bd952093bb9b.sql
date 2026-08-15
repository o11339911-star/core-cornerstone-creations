create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_owner_count int;
begin
  -- Privileged server-side path (service_role / cascade cleanup): no actor.
  if v_actor is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.user_id = v_actor then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.expires_at is distinct from old.expires_at then
      raise exception 'A member cannot change their own role, status or expiry'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' and old.user_id = v_actor then
    raise exception 'A member cannot remove their own membership' using errcode = '42501';
  end if;

  if tg_op in ('UPDATE','DELETE') and old.role = 'owner' and old.status = 'active' then
    select count(*) into v_owner_count
    from public.entity_memberships em
    where em.entity_id = old.entity_id
      and em.role = 'owner'
      and em.status = 'active'
      and em.id <> old.id;

    if v_owner_count = 0 and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
      raise exception 'An entity must keep at least one active owner' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.prevent_self_role_change() from public, anon, authenticated;