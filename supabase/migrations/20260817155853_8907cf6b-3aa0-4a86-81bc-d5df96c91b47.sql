-- 1) boundary + actor on the existing property exact location table (reused, not duplicated)
alter table public.property_exact_locations
  add column if not exists boundary_geojson jsonb,
  add column if not exists updated_by uuid;

-- 2) project-level precise location (projects that are not linked to a property)
create table if not exists public.project_locations (
  project_id uuid primary key references public.projects(id) on delete cascade,
  precise_address text,
  latitude numeric,
  longitude numeric,
  boundary_geojson jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.project_locations to authenticated;
grant all on public.project_locations to service_role;
revoke insert, update, delete, truncate on public.project_locations from anon, authenticated;
revoke select on public.project_locations from anon;
alter table public.project_locations enable row level security;
drop policy if exists project_locations_select on public.project_locations;
create policy project_locations_select on public.project_locations
  for select to authenticated
  using (private.can_access_project(auth.uid(), project_id));

drop trigger if exists project_locations_touch on public.project_locations;
create trigger project_locations_touch before update on public.project_locations
  for each row execute function public.set_updated_at();

-- 3) audit of every location change (no identity data)
create table if not exists public.project_location_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  actor_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_location_audit_project_idx on public.project_location_audit (project_id, created_at desc);
create index if not exists project_location_audit_property_idx on public.project_location_audit (property_id, created_at desc);
grant select on public.project_location_audit to authenticated;
grant all on public.project_location_audit to service_role;
revoke insert, update, delete, truncate on public.project_location_audit from anon, authenticated;
revoke select on public.project_location_audit from anon;
alter table public.project_location_audit enable row level security;
drop policy if exists project_location_audit_select on public.project_location_audit;
create policy project_location_audit_select on public.project_location_audit
  for select to authenticated
  using (
    (project_id is not null and private.can_access_project(auth.uid(), project_id))
    or (property_id is not null and private.can_view_exact_location(auth.uid(), property_id))
  );

-- 4) GeoJSON Polygon validation (size bounded to prevent abuse)
create or replace function private.is_valid_boundary(_g jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  ring jsonb;
  pt jsonb;
  n int;
  total int := 0;
begin
  if _g is null then return true; end if;
  if jsonb_typeof(_g) <> 'object' or coalesce(_g->>'type','') <> 'Polygon' then return false; end if;
  if jsonb_typeof(_g->'coordinates') <> 'array' then return false; end if;
  if jsonb_array_length(_g->'coordinates') = 0 or jsonb_array_length(_g->'coordinates') > 10 then return false; end if;
  for ring in select value from jsonb_array_elements(_g->'coordinates') loop
    if jsonb_typeof(ring) <> 'array' then return false; end if;
    n := jsonb_array_length(ring);
    if n < 4 then return false; end if;
    total := total + n;
    if total > 2000 then return false; end if;
    if ring->0 <> ring->(n-1) then return false; end if;
    for pt in select value from jsonb_array_elements(ring) loop
      if jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) < 2 then return false; end if;
      if jsonb_typeof(pt->0) <> 'number' or jsonb_typeof(pt->1) <> 'number' then return false; end if;
      if (pt->>0)::numeric < -180 or (pt->>0)::numeric > 180 then return false; end if;
      if (pt->>1)::numeric < -90 or (pt->>1)::numeric > 90 then return false; end if;
    end loop;
  end loop;
  return true;
end; $$;

-- 5) is the project's precise location complete? (address + valid point)
create or replace function private.project_location_complete(_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prop uuid;
  v_ok boolean := false;
begin
  select pp.property_id into v_prop
    from public.property_projects pp
   where pp.project_id = _project_id
   order by pp.created_at
   limit 1;

  if v_prop is not null then
    select coalesce(btrim(coalesce(e.exact_address,'')) <> '' and e.exact_lat is not null and e.exact_lng is not null, false)
      into v_ok
      from public.property_exact_locations e
     where e.property_id = v_prop;
  else
    select coalesce(btrim(coalesce(l.precise_address,'')) <> '' and l.latitude is not null and l.longitude is not null, false)
      into v_ok
      from public.project_locations l
     where l.project_id = _project_id;
  end if;

  return coalesce(v_ok, false);
end; $$;

-- 6) read the resolved location for a project
create or replace function public.project_precise_location(_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_prop uuid;
  v_addr text;
  v_lat numeric;
  v_lng numeric;
  v_boundary jsonb;
  v_can_edit boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can_access_project(v_actor, _project_id) then
    raise exception 'Not allowed to view this project' using errcode = '42501';
  end if;

  select pp.property_id into v_prop
    from public.property_projects pp
   where pp.project_id = _project_id
   order by pp.created_at
   limit 1;

  if v_prop is not null then
    if not private.can_view_exact_location(v_actor, v_prop) then
      return jsonb_build_object(
        'source','property','property_id',v_prop,'visible',false,'can_edit',false,
        'complete', private.project_location_complete(_project_id)
      );
    end if;
    select e.exact_address, e.exact_lat, e.exact_lng, e.boundary_geojson
      into v_addr, v_lat, v_lng, v_boundary
      from public.property_exact_locations e where e.property_id = v_prop;
    v_can_edit := private.can_manage_property(v_actor, v_prop) and private.can_view_exact_location(v_actor, v_prop);
  else
    select l.precise_address, l.latitude, l.longitude, l.boundary_geojson
      into v_addr, v_lat, v_lng, v_boundary
      from public.project_locations l where l.project_id = _project_id;
    v_can_edit := private.can(v_actor, 'projects'::public.app_module, 'update'::public.app_action, null, _project_id);
  end if;

  return jsonb_build_object(
    'source', case when v_prop is not null then 'property' else 'project' end,
    'property_id', v_prop,
    'visible', true,
    'can_edit', coalesce(v_can_edit,false),
    'address', v_addr,
    'lat', v_lat,
    'lng', v_lng,
    'boundary', v_boundary,
    'has_boundary', v_boundary is not null,
    'complete', coalesce(btrim(coalesce(v_addr,'')) <> '' and v_lat is not null and v_lng is not null, false)
  );
end; $$;

-- 7) write the precise location of a property (audited)
create or replace function public.set_property_precise_location(
  _property_id uuid, _address text, _lat numeric, _lng numeric, _boundary jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not (private.can_manage_property(v_actor, _property_id) and private.can_view_exact_location(v_actor, _property_id)) then
    raise exception 'Not allowed to edit this location' using errcode = '42501';
  end if;
  if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if btrim(coalesce(_address,'')) = '' then
    raise exception 'Address is required' using errcode = '22023';
  end if;
  if not private.is_valid_boundary(_boundary) then
    raise exception 'Invalid boundary polygon' using errcode = '22023';
  end if;

  select jsonb_build_object('address', e.exact_address, 'lat', e.exact_lat, 'lng', e.exact_lng,
                            'has_boundary', e.boundary_geojson is not null)
    into v_old from public.property_exact_locations e where e.property_id = _property_id;

  insert into public.property_exact_locations as e
    (property_id, exact_address, exact_lat, exact_lng, boundary_geojson, updated_by)
  values (_property_id, btrim(_address), _lat, _lng, _boundary, v_actor)
  on conflict (property_id) do update
    set exact_address = excluded.exact_address,
        exact_lat = excluded.exact_lat,
        exact_lng = excluded.exact_lng,
        boundary_geojson = excluded.boundary_geojson,
        updated_by = excluded.updated_by,
        updated_at = now();

  v_new := jsonb_build_object('address', btrim(_address), 'lat', _lat, 'lng', _lng,
                              'has_boundary', _boundary is not null);
  insert into public.project_location_audit (property_id, actor_id, old_value, new_value)
  values (_property_id, v_actor, v_old, v_new);

  return v_new;
end; $$;

-- 8) write the precise location of a project (delegates to the linked property, audited)
create or replace function public.set_project_precise_location(
  _project_id uuid, _address text, _lat numeric, _lng numeric, _boundary jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_prop uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select pp.property_id into v_prop
    from public.property_projects pp
   where pp.project_id = _project_id
   order by pp.created_at
   limit 1;

  if v_prop is not null then
    return public.set_property_precise_location(v_prop, _address, _lat, _lng, _boundary);
  end if;

  if not private.can(v_actor, 'projects'::public.app_module, 'update'::public.app_action, null, _project_id) then
    raise exception 'Not allowed to edit this location' using errcode = '42501';
  end if;
  if _lat is null or _lng is null or _lat < -90 or _lat > 90 or _lng < -180 or _lng > 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if btrim(coalesce(_address,'')) = '' then
    raise exception 'Address is required' using errcode = '22023';
  end if;
  if not private.is_valid_boundary(_boundary) then
    raise exception 'Invalid boundary polygon' using errcode = '22023';
  end if;

  select jsonb_build_object('address', l.precise_address, 'lat', l.latitude, 'lng', l.longitude,
                            'has_boundary', l.boundary_geojson is not null)
    into v_old from public.project_locations l where l.project_id = _project_id;

  insert into public.project_locations as l
    (project_id, precise_address, latitude, longitude, boundary_geojson, updated_by)
  values (_project_id, btrim(_address), _lat, _lng, _boundary, v_actor)
  on conflict (project_id) do update
    set precise_address = excluded.precise_address,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        boundary_geojson = excluded.boundary_geojson,
        updated_by = excluded.updated_by,
        updated_at = now();

  v_new := jsonb_build_object('address', btrim(_address), 'lat', _lat, 'lng', _lng,
                              'has_boundary', _boundary is not null);
  insert into public.project_location_audit (project_id, actor_id, old_value, new_value)
  values (_project_id, v_actor, v_old, v_new);

  return v_new;
end; $$;

-- 9) first stage cannot be submitted or approved without a complete location
create or replace function private.require_project_location(_project_id uuid, _stage_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first uuid;
begin
  select id into v_first
    from public.project_stages
   where project_id = _project_id and deleted_at is null and parent_stage_id is null
   order by order_index, created_at
   limit 1;

  if v_first is not null and v_first = _stage_id
     and not private.project_location_complete(_project_id) then
    raise exception 'الموقع الدقيق مطلوب: احفظ عنوانًا ونقطة صالحة قبل إكمال المرحلة الأولى'
      using errcode = '22023';
  end if;
end; $$;

create or replace function public.submit_stage(_stage_id uuid, _note text default null)
returns timestamp with time zone
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_stage public.project_stages%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_stage from public.project_stages where id = _stage_id and deleted_at is null for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = '22023';
  end if;
  if not private.can_manage_stage(v_actor, _stage_id, v_stage.project_id) then
    raise exception 'Not allowed to submit this stage' using errcode = '42501';
  end if;
  if v_stage.status not in ('in_progress','rework') then
    raise exception 'Only a stage in progress or in rework can be submitted (current: %)', v_stage.status
      using errcode = '22023';
  end if;

  perform private.require_project_location(v_stage.project_id, _stage_id);

  update public.project_stages
    set status = 'submitted', submitted_by = v_actor, submitted_at = now(),
        completion_note = coalesce(_note, completion_note),
        actual_end = coalesce(actual_end, current_date)
    where id = _stage_id;

  return now();
end; $function$;

create or replace function public.approve_stage(_stage_id uuid, _note text default null)
returns timestamp with time zone
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_stage public.project_stages%rowtype;
  v_missing int;
  v_open int;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_stage from public.project_stages where id = _stage_id and deleted_at is null for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = '22023';
  end if;
  if not private.can(v_actor, 'stages'::public.app_module, 'approve'::public.app_action, null, v_stage.project_id)
     or not private.stage_in_scope(v_actor, _stage_id, v_stage.project_id) then
    raise exception 'Not allowed to approve this stage' using errcode = '42501';
  end if;
  if v_stage.status <> 'submitted' then
    raise exception 'Only a submitted stage can be approved (current: %)', v_stage.status using errcode = '22023';
  end if;

  if v_stage.submitted_by = v_actor then
    raise exception 'The submitter cannot approve their own stage' using errcode = '42501';
  end if;
  if private.has_stage_role(v_actor, _stage_id, 'executor') then
    raise exception 'The executor cannot approve their own stage' using errcode = '42501';
  end if;

  select count(*) into v_missing
  from public.stage_completion_criteria c
  left join public.stage_criteria_results r on r.criterion_id = c.id
  where c.stage_id = _stage_id and c.is_required and coalesce(r.satisfied, false) = false;
  if v_missing > 0 then
    raise exception 'Stage has % unmet required completion criteria', v_missing using errcode = '22023';
  end if;

  select count(*) into v_open
  from public.stage_observations o
  where o.stage_id = _stage_id and o.kind = 'nonconformity'
    and o.severity in ('high','critical') and o.status <> 'closed';
  if v_open > 0 then
    raise exception 'Stage has % open high/critical nonconformities', v_open using errcode = '22023';
  end if;

  perform private.require_project_location(v_stage.project_id, _stage_id);

  update public.project_stages
    set status = 'approved', approved_by = v_actor, approved_at = now(),
        completion_note = coalesce(_note, completion_note)
    where id = _stage_id;

  return now();
end; $function$;

-- 10) execute grants: never PUBLIC/anon
revoke execute on function private.is_valid_boundary(jsonb) from public, anon;
revoke execute on function private.project_location_complete(uuid) from public, anon;
revoke execute on function private.require_project_location(uuid, uuid) from public, anon;
revoke execute on function public.project_precise_location(uuid) from public, anon;
revoke execute on function public.set_property_precise_location(uuid, text, numeric, numeric, jsonb) from public, anon;
revoke execute on function public.set_project_precise_location(uuid, text, numeric, numeric, jsonb) from public, anon;
grant execute on function private.is_valid_boundary(jsonb) to authenticated;
grant execute on function private.project_location_complete(uuid) to authenticated;
grant execute on function public.project_precise_location(uuid) to authenticated;
grant execute on function public.set_property_precise_location(uuid, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.set_project_precise_location(uuid, text, numeric, numeric, jsonb) to authenticated;