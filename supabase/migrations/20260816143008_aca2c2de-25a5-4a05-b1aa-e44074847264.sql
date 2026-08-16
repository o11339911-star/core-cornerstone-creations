-- ============================================================
-- Property <-> Project link hardening (same entity, or an
-- actually-effective contract between the two entities).
-- ============================================================

create or replace function private.effective_link_contract(
  _property_id uuid,
  _project_id uuid,
  _require_property_scope boolean default false,
  _require_project_scope boolean default false
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.properties pr
  join public.projects pj on pj.id = _project_id and pj.deleted_at is null
  join public.contracts c
    on c.deleted_at is null
   and c.status = 'active'
   and c.current_version_id is not null
   and (c.project_id = _project_id or c.property_id = _property_id)
  join public.contract_versions cv
    on cv.id = c.current_version_id
   and cv.approved_at is not null
   and cv.starts_on <= current_date
   and (cv.ends_on is null or cv.ends_on >= current_date)
  where pr.id = _property_id
    and pr.deleted_at is null
    and pr.entity_id is not null
    and pj.entity_id is not null
    and pr.entity_id <> pj.entity_id
    and (not _require_project_scope or c.project_id = _project_id)
    and (not _require_property_scope or c.property_id = _property_id)
    and exists (
      select 1 from public.contract_parties cp
      where cp.contract_id = c.id and cp.entity_id = pr.entity_id
    )
    and exists (
      select 1 from public.contract_parties cp
      where cp.contract_id = c.id and cp.entity_id = pj.entity_id
    )
  limit 1;
$$;

-- Candidate projects for a given property.
create or replace function public.list_link_candidate_projects(
  _property_id uuid,
  _q text default null,
  _limit int default 10,
  _offset int default 0
)
returns table (
  project_id uuid,
  name text,
  code text,
  status text,
  source text,
  counterparty_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _prop record;
  _term text := nullif(btrim(coalesce(_q, '')), '');
begin
  if _uid is null then
    raise exception 'FORBIDDEN';
  end if;

  select p.id, p.entity_id, p.owner_id into _prop
  from public.properties p
  where p.id = _property_id and p.deleted_at is null;

  if _prop.id is null or not private.can_manage_property(_uid, _property_id) then
    raise exception 'FORBIDDEN';
  end if;

  if _prop.entity_id is not null and not private.is_active_member(_uid, _prop.entity_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  with candidates as (
    select
      pj.id,
      pj.name,
      pj.code,
      pj.status,
      case when pj.entity_id is not distinct from _prop.entity_id then 'own' else 'contract' end as src,
      case
        when pj.entity_id is not distinct from _prop.entity_id then null
        else (select e.name from public.entities e where e.id = pj.entity_id)
      end as party_name
    from public.projects pj
    where pj.deleted_at is null
      and not exists (
        select 1 from public.property_projects pp
        where pp.property_id = _property_id and pp.project_id = pj.id
      )
      and (
        (
          pj.entity_id is not distinct from _prop.entity_id
          and (pj.entity_id is not null or pj.owner_id = _prop.owner_id)
          and private.can_access_project(_uid, pj.id)
        )
        or private.effective_link_contract(_property_id, pj.id, false, true) is not null
      )
      and (
        _term is null
        or pj.name ilike '%' || _term || '%'
        or coalesce(pj.code, '') ilike '%' || _term || '%'
      )
  )
  select c.id, c.name, c.code, c.status, c.src, c.party_name,
         (select count(*) from candidates)::bigint
  from candidates c
  order by c.src, c.name
  limit greatest(1, least(coalesce(_limit, 10), 50))
  offset greatest(0, coalesce(_offset, 0));
end;
$$;

-- Candidate properties for a given project.
create or replace function public.list_link_candidate_properties(
  _project_id uuid,
  _q text default null,
  _limit int default 10,
  _offset int default 0
)
returns table (
  property_id uuid,
  name text,
  code text,
  status text,
  source text,
  counterparty_name text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _proj record;
  _term text := nullif(btrim(coalesce(_q, '')), '');
begin
  if _uid is null then
    raise exception 'FORBIDDEN';
  end if;

  select p.id, p.entity_id, p.owner_id into _proj
  from public.projects p
  where p.id = _project_id and p.deleted_at is null;

  if _proj.id is null or not private.can_access_project(_uid, _project_id) then
    raise exception 'FORBIDDEN';
  end if;

  if _proj.entity_id is not null and not private.is_active_member(_uid, _proj.entity_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  with candidates as (
    select
      pr.id,
      pr.name,
      pr.code,
      pr.status,
      case when pr.entity_id is not distinct from _proj.entity_id then 'own' else 'contract' end as src,
      case
        when pr.entity_id is not distinct from _proj.entity_id then null
        else (select e.name from public.entities e where e.id = pr.entity_id)
      end as party_name
    from public.properties pr
    where pr.deleted_at is null
      and not exists (
        select 1 from public.property_projects pp
        where pp.property_id = pr.id and pp.project_id = _project_id
      )
      and (
        (
          pr.entity_id is not distinct from _proj.entity_id
          and (pr.entity_id is not null or pr.owner_id = _proj.owner_id)
          and private.can_access_property(_uid, pr.id)
        )
        or private.effective_link_contract(pr.id, _project_id, true, false) is not null
      )
      and (
        _term is null
        or pr.name ilike '%' || _term || '%'
        or coalesce(pr.code, '') ilike '%' || _term || '%'
      )
  )
  select c.id, c.name, c.code, c.status, c.src, c.party_name,
         (select count(*) from candidates)::bigint
  from candidates c
  order by c.src, c.name
  limit greatest(1, least(coalesce(_limit, 10), 50))
  offset greatest(0, coalesce(_offset, 0));
end;
$$;

-- Authoritative link creation: re-verifies at write time under row locks.
create or replace function public.link_property_project(
  _property_id uuid,
  _project_id uuid,
  _relation text default 'related'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
  _prop record;
  _proj record;
  _contract uuid;
  _reason text;
  _link_id uuid;
  _source text;
begin
  if _uid is null then
    raise exception 'FORBIDDEN';
  end if;
  if coalesce(_relation, 'related') not in ('primary', 'related') then
    raise exception 'INVALID_RELATION';
  end if;

  -- TOCTOU guard: lock both anchors before re-deriving authorization.
  select p.id, p.entity_id, p.owner_id into _prop
  from public.properties p
  where p.id = _property_id and p.deleted_at is null
  for update;

  select p.id, p.entity_id, p.owner_id into _proj
  from public.projects p
  where p.id = _project_id and p.deleted_at is null
  for update;

  if _prop.id is null or _proj.id is null then
    _reason := 'not_found';
  elsif not private.can_manage_property(_uid, _property_id) then
    _reason := 'no_property_manage';
  elsif _prop.entity_id is not null and not private.is_active_member(_uid, _prop.entity_id) then
    _reason := 'no_active_membership';
  elsif _prop.entity_id is not distinct from _proj.entity_id
        and (_prop.entity_id is not null or _prop.owner_id = _proj.owner_id) then
    if private.can_access_project(_uid, _project_id) then
      _source := 'own';
    else
      _reason := 'no_project_access';
    end if;
  else
    _contract := private.effective_link_contract(_property_id, _project_id, false, true);
    if _contract is null then
      _reason := 'no_effective_contract';
    else
      _source := 'contract';
    end if;
  end if;

  if _reason is not null then
    insert into public.permission_audit_log (
      actor_user_id, target_entity_id, target_project_id, object_type, object_id, action, new_value
    ) values (
      _uid, _prop.entity_id, _project_id, 'property_project_link', _property_id, 'link_denied',
      jsonb_build_object('reason', _reason, 'property_id', _property_id, 'project_id', _project_id)
    );
    return jsonb_build_object('ok', false, 'reason', _reason);
  end if;

  insert into public.property_projects (property_id, project_id, relation, linked_by)
  values (_property_id, _project_id, coalesce(_relation, 'related'), _uid)
  on conflict do nothing
  returning id into _link_id;

  insert into public.permission_audit_log (
    actor_user_id, target_entity_id, target_project_id, object_type, object_id, action, new_value
  ) values (
    _uid, _prop.entity_id, _project_id, 'property_project_link', _property_id, 'link_granted',
    jsonb_build_object(
      'source', _source,
      'contract_id', _contract,
      'property_id', _property_id,
      'project_id', _project_id,
      'relation', coalesce(_relation, 'related')
    )
  );

  return jsonb_build_object('ok', true, 'link_id', _link_id, 'source', _source);
end;
$$;

revoke all on function private.effective_link_contract(uuid, uuid, boolean, boolean) from public, anon;
revoke all on function public.list_link_candidate_projects(uuid, text, int, int) from public, anon;
revoke all on function public.list_link_candidate_properties(uuid, text, int, int) from public, anon;
revoke all on function public.link_property_project(uuid, uuid, text) from public, anon;

grant execute on function private.effective_link_contract(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.list_link_candidate_projects(uuid, text, int, int) to authenticated;
grant execute on function public.list_link_candidate_properties(uuid, text, int, int) to authenticated;
grant execute on function public.link_property_project(uuid, uuid, text) to authenticated;