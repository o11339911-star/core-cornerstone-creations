-- 1) owner provenance columns (snapshots copied server-side, never free text)
alter table public.property_owners
  add column if not exists owner_source text,
  add column if not exists owner_legal_form text,
  add column if not exists owner_unified_number text,
  add column if not exists owner_verification_status text,
  add column if not exists is_primary boolean not null default false;

do $$ begin
  alter table public.property_owners
    add constraint property_owners_source_ck
    check (owner_source is null or owner_source in ('personal','entity'));
exception when duplicate_object then null; end $$;

create index if not exists property_owners_primary_idx
  on public.property_owners (property_id) where is_primary and ends_on is null;

-- 2) atomic create: property + derived 100% owner
create or replace function public.create_property_with_owner(
  _kind text,
  _name text,
  _entity_id uuid default null,
  _city text default null,
  _district text default null,
  _land_area numeric default null,
  _plan_no text default null,
  _parcel_no text default null,
  _region text default null,
  _address text default null,
  _frontage text default null,
  _streets text default null,
  _land_use text default null,
  _approx_lat numeric default null,
  _approx_lng numeric default null,
  _notes text default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _pid uuid;
  _etype text;
  _ename text;
  _profile record;
  _full_name text;
begin
  if _uid is null then raise exception 'FORBIDDEN'; end if;
  if _kind not in ('land','villa','building','compound','unit_block') then raise exception 'INVALID_INPUT'; end if;
  if coalesce(length(btrim(_name)),0) < 2 then raise exception 'INVALID_INPUT'; end if;

  if _entity_id is not null then
    select e.type, e.name into _etype, _ename
    from public.entities e
    join public.entity_memberships m
      on m.entity_id = e.id
     and m.user_id = _uid
     and m.status = 'active'
     and (m.expires_at is null or m.expires_at > now())
    where e.id = _entity_id and e.status = 'active' and e.deleted_at is null;

    if _etype is null then raise exception 'FORBIDDEN'; end if;
    if _etype <> 'developer' then raise exception 'ENTITY_TYPE_NOT_ALLOWED'; end if;

    select legal_form, unified_national_number, verification_status, legal_name_ar
      into _profile
    from public.entity_profiles where entity_id = _entity_id;
  end if;

  insert into public.properties (
    owner_id, created_by, entity_id, kind, name, city, district, land_area,
    plan_no, parcel_no, region, address, frontage, streets, land_use,
    approx_lat, approx_lng, notes
  ) values (
    _uid, _uid, _entity_id, _kind, btrim(_name), nullif(btrim(coalesce(_city,'')),''),
    nullif(btrim(coalesce(_district,'')),''), _land_area,
    nullif(btrim(coalesce(_plan_no,'')),''), nullif(btrim(coalesce(_parcel_no,'')),''),
    nullif(btrim(coalesce(_region,'')),''), nullif(btrim(coalesce(_address,'')),''),
    nullif(btrim(coalesce(_frontage,'')),''), nullif(btrim(coalesce(_streets,'')),''),
    nullif(btrim(coalesce(_land_use,'')),''), _approx_lat, _approx_lng,
    nullif(btrim(coalesce(_notes,'')),'')
  ) returning id into _pid;

  if _entity_id is not null then
    insert into public.property_owners (
      property_id, owner_entity_id, owner_name_text, share_percent, is_primary,
      owner_source, owner_legal_form, owner_unified_number, owner_verification_status
    ) values (
      _pid, _entity_id, coalesce(_profile.legal_name_ar, _ename), 100, true,
      'entity', _profile.legal_form, _profile.unified_national_number,
      coalesce(_profile.verification_status,'pending')
    );
  else
    select full_name into _full_name from public.profiles where id = _uid;
    insert into public.property_owners (
      property_id, owner_user_id, owner_name_text, share_percent, is_primary,
      owner_source, owner_verification_status
    ) values (
      _pid, _uid, _full_name, 100, true, 'personal',
      case when exists (
        select 1 from private.personal_identity_links l
        where l.user_id = _uid and l.status in ('pending','verified')
      ) then 'linked' else 'unlinked' end
    );
  end if;

  return _pid;
end;
$$;

-- 3) controlled owner correction
create or replace function public.set_property_primary_owner(
  _property_id uuid,
  _entity_id uuid,
  _reason text
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _old record;
  _new_id uuid;
  _etype text;
  _ename text;
  _profile record;
  _full_name text;
begin
  if _uid is null then raise exception 'FORBIDDEN'; end if;
  if not private.can_manage_property(_uid, _property_id) then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(btrim(coalesce(_reason,''))),0) < 5 then raise exception 'REASON_REQUIRED'; end if;

  perform 1 from public.properties where id = _property_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  if _entity_id is not null then
    select e.type, e.name into _etype, _ename
    from public.entities e
    join public.entity_memberships m
      on m.entity_id = e.id
     and m.user_id = _uid
     and m.status = 'active'
     and (m.expires_at is null or m.expires_at > now())
    where e.id = _entity_id and e.status = 'active' and e.deleted_at is null;
    if _etype is null then raise exception 'FORBIDDEN'; end if;

    select legal_form, unified_national_number, verification_status, legal_name_ar
      into _profile
    from public.entity_profiles where entity_id = _entity_id;
  end if;

  select id, owner_user_id, owner_entity_id, owner_source into _old
  from public.property_owners
  where property_id = _property_id and ends_on is null
  order by is_primary desc, created_at asc limit 1;

  update public.property_owners
     set ends_on = current_date
   where property_id = _property_id and ends_on is null;

  if _entity_id is not null then
    insert into public.property_owners (
      property_id, owner_entity_id, owner_name_text, share_percent, is_primary,
      owner_source, owner_legal_form, owner_unified_number, owner_verification_status
    ) values (
      _property_id, _entity_id, coalesce(_profile.legal_name_ar, _ename), 100, true,
      'entity', _profile.legal_form, _profile.unified_national_number,
      coalesce(_profile.verification_status,'pending')
    ) returning id into _new_id;
  else
    select full_name into _full_name from public.profiles where id = _uid;
    insert into public.property_owners (
      property_id, owner_user_id, owner_name_text, share_percent, is_primary,
      owner_source, owner_verification_status
    ) values (
      _property_id, _uid, _full_name, 100, true, 'personal',
      case when exists (
        select 1 from private.personal_identity_links l
        where l.user_id = _uid and l.status in ('pending','verified')
      ) then 'linked' else 'unlinked' end
    ) returning id into _new_id;
  end if;

  insert into public.permission_audit_log (
    actor_user_id, target_entity_id, object_type, object_id, action, old_value, new_value
  ) values (
    _uid, _entity_id, 'property_owners', _property_id, 'update',
    jsonb_build_object(
      'owner_row_id', _old.id,
      'owner_source', _old.owner_source,
      'owner_user_id', _old.owner_user_id,
      'owner_entity_id', _old.owner_entity_id
    ),
    jsonb_build_object(
      'owner_row_id', _new_id,
      'owner_source', case when _entity_id is null then 'personal' else 'entity' end,
      'owner_user_id', case when _entity_id is null then _uid else null end,
      'owner_entity_id', _entity_id,
      'reason', left(btrim(_reason), 400)
    )
  );

  return _new_id;
end;
$$;

-- audit object type allowance
alter table public.permission_audit_log drop constraint if exists permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions','contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts','project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions','observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results','requests','request_messages','property_services','property_owners','documents','document_versions','document_links','document_audience','reports','report_versions','report_templates','report_assets','report_template_imports','platform_admins','payment_milestones','disbursement_requests','financial_executions','financial_documents','retention_holds','ledger_entries','projects','project_acceptances','project_closure_items','punch_items','warranties','project_reopen_requests','portfolio_entries','platform_queue_item','platform_staff','platform_case_access','platform_breakglass','entity_public_profiles','marketing_profiles','marketing_contracts','marketing_contract_amounts','marketing_versions','marketing_assets','marketing_leads','marketing_packages','media_shoot_requests','media_shoot_attendance','media_assets','media_asset_versions','media_publications','personal_identity']));

-- 4) mark existing rows + unambiguous backfill (entity-scoped properties only)
update public.property_owners o
   set owner_source = case when o.owner_entity_id is not null then 'entity'
                           when o.owner_user_id is not null then 'personal' else null end
 where o.owner_source is null;

update public.property_owners o
   set is_primary = true
 where o.ends_on is null and o.share_percent = 100 and not o.is_primary;

insert into public.property_owners (
  property_id, owner_entity_id, owner_name_text, share_percent, is_primary,
  owner_source, owner_legal_form, owner_unified_number, owner_verification_status
)
select p.id, p.entity_id, coalesce(ep.legal_name_ar, e.name), 100, true,
       'entity', ep.legal_form, ep.unified_national_number, coalesce(ep.verification_status,'pending')
from public.properties p
join public.entities e on e.id = p.entity_id
left join public.entity_profiles ep on ep.entity_id = p.entity_id
where p.deleted_at is null
  and p.entity_id is not null
  and not exists (select 1 from public.property_owners o where o.property_id = p.id);

-- 5) grants
revoke all on function public.create_property_with_owner(text,text,uuid,text,text,numeric,text,text,text,text,text,text,text,numeric,numeric,text) from public, anon;
revoke all on function public.set_property_primary_owner(uuid,uuid,text) from public, anon;
grant execute on function public.create_property_with_owner(text,text,uuid,text,text,numeric,text,text,text,text,text,text,text,numeric,numeric,text) to authenticated;
grant execute on function public.set_property_primary_owner(uuid,uuid,text) to authenticated;