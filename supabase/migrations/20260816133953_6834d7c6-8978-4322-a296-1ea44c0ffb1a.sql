create or replace function public.set_property_primary_owner(
  _property_id uuid,
  _reason text,
  _entity_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_source text;
  v_legal_form text;
  v_unn text;
  v_identity boolean := false;
begin
  if v_uid is null then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(_reason)), 0) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if not public.can_manage_property_self(_property_id) then raise exception 'FORBIDDEN'; end if;

  if _entity_id is not null then
    if not exists (
      select 1 from public.entity_memberships m
      where m.entity_id = _entity_id and m.user_id = v_uid
        and m.status = 'active' and m.role in ('owner','admin','manager')
    ) then raise exception 'FORBIDDEN'; end if;

    select e.name into v_name from public.entities e where e.id = _entity_id;
    select p.legal_form, p.unified_number
      into v_legal_form, v_unn
      from public.entity_profiles p where p.entity_id = _entity_id;
    v_source := 'entity';
  else
    select coalesce(pr.full_name, '') into v_name from public.profiles pr where pr.id = v_uid;
    v_source := 'personal';
    select exists (select 1 from private.personal_identity_links ui where ui.user_id = v_uid) into v_identity;
  end if;

  update public.property_owners
     set ends_on = current_date, is_primary = false
   where property_id = _property_id and ends_on is null;

  insert into public.property_owners(
    property_id, owner_name_text, share_percent, is_primary, starts_on,
    owner_source, owner_entity_id, owner_user_id, owner_name_source,
    owner_legal_form, owner_unified_number, owner_verification_status)
  values (
    _property_id, v_name, 100, true, current_date,
    v_source, _entity_id, case when _entity_id is null then v_uid end, v_source,
    v_legal_form, v_unn,
    case when _entity_id is not null and v_unn is not null then 'verified'
         when _entity_id is null and v_identity then 'linked'
         else 'pending' end);

  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, details)
  values (v_uid, 'update', 'property_owners', _property_id,
          jsonb_build_object('reason', btrim(_reason), 'owner_source', v_source, 'entity_id', _entity_id));
end;
$$;

revoke execute on function public.set_property_primary_owner(uuid, text, uuid) from public, anon;
grant execute on function public.set_property_primary_owner(uuid, text, uuid) to authenticated;