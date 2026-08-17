-- ===================== identity visibility storage =====================
create table if not exists public.project_identity_visibility (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  field_group text not null check (field_group in ('ownership','deed_license','parcel_plan','precise_location','contractor','contracted_parties')),
  level text not null default 'internal' check (level in ('internal','all_parties','selected_parties')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, field_group)
);

create table if not exists public.project_identity_audience (
  id uuid primary key default gen_random_uuid(),
  visibility_id uuid not null references public.project_identity_visibility(id) on delete cascade,
  project_party_id uuid not null references public.project_parties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (visibility_id, project_party_id)
);

create index if not exists idx_piv_project on public.project_identity_visibility(project_id);
create index if not exists idx_pia_visibility on public.project_identity_audience(visibility_id);

grant select on public.project_identity_visibility to authenticated;
grant select on public.project_identity_audience to authenticated;
grant all on public.project_identity_visibility to service_role;
grant all on public.project_identity_audience to service_role;
revoke insert, update, delete, truncate on public.project_identity_visibility from anon, authenticated;
revoke insert, update, delete, truncate on public.project_identity_audience from anon, authenticated;
revoke select on public.project_identity_visibility from anon;
revoke select on public.project_identity_audience from anon;

alter table public.project_identity_visibility enable row level security;
alter table public.project_identity_audience enable row level security;

drop policy if exists "identity visibility readable by project managers" on public.project_identity_visibility;
create policy "identity visibility readable by project managers"
on public.project_identity_visibility for select to authenticated
using (public.can_manage_project_parties(project_id));

drop policy if exists "identity audience readable by project managers" on public.project_identity_audience;
create policy "identity audience readable by project managers"
on public.project_identity_audience for select to authenticated
using (exists (
  select 1 from public.project_identity_visibility v
  where v.id = visibility_id and public.can_manage_project_parties(v.project_id)
));

create or replace function public.touch_updated_at_identity_visibility()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_piv_updated_at on public.project_identity_visibility;
create trigger trg_piv_updated_at before update on public.project_identity_visibility
for each row execute function public.touch_updated_at_identity_visibility();

-- ===================== permission helpers =====================
create or replace function private.identity_is_manager(_user_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or private.can(_user_id, 'projects'::public.app_module, 'update'::public.app_action, p.entity_id, _project_id)
        or private.can(_user_id, 'members'::public.app_module, 'manage_members'::public.app_action, p.entity_id, _project_id)
      )
  );
$$;

create or replace function private.identity_my_party(_user_id uuid, _project_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select pp.id from public.project_parties pp
  where pp.project_id = _project_id
    and pp.status = 'accepted'
    and (pp.ends_on is null or pp.ends_on >= current_date)
    and private.is_my_project_party(_user_id, pp.id)
  limit 1;
$$;

create or replace function private.identity_group_allowed(_user_id uuid, _project_id uuid, _group text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_level text;
  v_party uuid;
begin
  if _user_id is null then return false; end if;
  if private.identity_is_manager(_user_id, _project_id) then return true; end if;

  -- internal staff of the owning entity keep their existing project access
  if private.can_access_project(_user_id, _project_id) then return true; end if;

  v_party := private.identity_my_party(_user_id, _project_id);
  if v_party is null then return false; end if;

  select level into v_level from public.project_identity_visibility
   where project_id = _project_id and field_group = _group;
  v_level := coalesce(v_level, 'internal');

  if v_level = 'all_parties' then return true; end if;
  if v_level = 'selected_parties' then
    return exists (
      select 1 from public.project_identity_audience a
      join public.project_identity_visibility v on v.id = a.visibility_id
      where v.project_id = _project_id and v.field_group = _group
        and a.project_party_id = v_party
    );
  end if;
  return false;
end; $$;

-- ===================== unified project identity (read only) =====================
create or replace function public.project_identity(_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_project public.projects%rowtype;
  v_prop uuid;
  v_manager boolean;
  v_party uuid;
  v_out jsonb;
  v_tmp jsonb;
  v_addr text;
  v_lat numeric;
  v_lng numeric;
  v_boundary jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_project from public.projects where id = _project_id and deleted_at is null;
  if not found then
    raise exception 'Project not found' using errcode = '42501';
  end if;

  v_manager := private.identity_is_manager(v_actor, _project_id);
  v_party := private.identity_my_party(v_actor, _project_id);
  if not v_manager and not private.can_access_project(v_actor, _project_id) and v_party is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select pp.property_id into v_prop
    from public.property_projects pp
   where pp.project_id = _project_id
   order by pp.created_at limit 1;

  v_out := jsonb_build_object(
    'project_id', _project_id,
    'project_name', v_project.name,
    'project_code', v_project.code,
    'property_id', v_prop,
    'can_manage', v_manager,
    'groups', jsonb_build_object()
  );

  -- ownership
  if private.identity_group_allowed(v_actor, _project_id, 'ownership') then
    if v_prop is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', coalesce(nullif(o.owner_name_text,''), e.name),
               'kind', case when o.owner_entity_id is not null then 'entity' else 'person' end,
               'legal_form', o.owner_legal_form,
               'identifier_kind', case when o.owner_unified_number is not null then 'unified_number' else 'national_id' end,
               'identifier_value', coalesce(o.owner_unified_number, right(coalesce(o.national_id_masked,''), 4)),
               'is_full_identifier', o.owner_unified_number is not null,
               'share_percent', o.share_percent,
               'verification_status', o.owner_verification_status
             ) order by o.is_primary desc, o.share_percent desc), '[]'::jsonb)
        into v_tmp
        from public.property_owners o
        left join public.entities e on e.id = o.owner_entity_id
       where o.property_id = v_prop and (o.ends_on is null or o.ends_on >= current_date);
    else
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', e.name, 'kind', 'entity', 'legal_form', ep.legal_form,
               'identifier_kind', 'unified_number',
               'identifier_value', coalesce(ep.unified_national_number, ep.cr_number),
               'is_full_identifier', true,
               'share_percent', null, 'verification_status', ep.verification_status)), '[]'::jsonb)
        into v_tmp
        from public.entities e
        left join public.entity_profiles ep on ep.entity_id = e.id
       where e.id = v_project.entity_id;
    end if;
    v_out := jsonb_set(v_out, '{groups,ownership}', coalesce(v_tmp, '[]'::jsonb));
  end if;

  -- deed + license
  if private.identity_group_allowed(v_actor, _project_id, 'deed_license') then
    v_tmp := jsonb_build_object('deed_number', null, 'deed_issuer', null, 'license_number', null, 'license_authority', null);
    if v_prop is not null then
      select jsonb_build_object(
               'deed_number', (select d.deed_number from public.deeds d where d.property_id = v_prop order by d.created_at desc limit 1),
               'deed_issuer', (select d.issuer from public.deeds d where d.property_id = v_prop order by d.created_at desc limit 1),
               'license_number', (select l.license_number from public.building_licenses l where l.property_id = v_prop order by l.created_at desc limit 1),
               'license_authority', (select l.authority from public.building_licenses l where l.property_id = v_prop order by l.created_at desc limit 1)
             ) into v_tmp;
    end if;
    v_out := jsonb_set(v_out, '{groups,deed_license}', v_tmp);
  end if;

  -- parcel + plan
  if private.identity_group_allowed(v_actor, _project_id, 'parcel_plan') then
    v_tmp := jsonb_build_object('parcel_no', null, 'plan_no', null);
    if v_prop is not null then
      select jsonb_build_object('parcel_no', p.parcel_no, 'plan_no', p.plan_no)
        into v_tmp from public.properties p where p.id = v_prop;
    end if;
    v_out := jsonb_set(v_out, '{groups,parcel_plan}', coalesce(v_tmp, jsonb_build_object('parcel_no', null, 'plan_no', null)));
  end if;

  -- precise location reference (summary only, never a copy)
  if private.identity_group_allowed(v_actor, _project_id, 'precise_location') then
    if v_prop is not null then
      if private.can_view_exact_location(v_actor, v_prop) then
        select e.exact_address, e.exact_lat, e.exact_lng, e.boundary_geojson
          into v_addr, v_lat, v_lng, v_boundary
          from public.property_exact_locations e where e.property_id = v_prop;
      end if;
    else
      select l.precise_address, l.latitude, l.longitude, l.boundary_geojson
        into v_addr, v_lat, v_lng, v_boundary
        from public.project_locations l where l.project_id = _project_id;
    end if;
    v_out := jsonb_set(v_out, '{groups,precise_location}', jsonb_build_object(
      'address', v_addr,
      'has_point', v_lat is not null and v_lng is not null,
      'has_boundary', v_boundary is not null,
      'complete', private.project_location_complete(_project_id)
    ));
  end if;

  -- contractor
  if private.identity_group_allowed(v_actor, _project_id, 'contractor') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', coalesce(nullif(pp.party_display_name,''), e.name),
             'kind', pp.party_kind,
             'identifier_kind', pp.identifier_kind,
             'identifier_value', case when pp.party_kind = 'entity' then coalesce(pp.cr_number, pp.identifier_last4) else pp.identifier_last4 end,
             'is_full_identifier', pp.party_kind = 'entity' and pp.cr_number is not null,
             'status', pp.status)), '[]'::jsonb)
      into v_tmp
      from public.project_parties pp
      left join public.entities e on e.id = pp.party_entity_id
     where pp.project_id = _project_id and pp.party_role = 'contractor' and pp.status = 'accepted';
    v_out := jsonb_set(v_out, '{groups,contractor}', coalesce(v_tmp, '[]'::jsonb));
  end if;

  -- contracted parties
  if private.identity_group_allowed(v_actor, _project_id, 'contracted_parties') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', pp.id,
             'name', coalesce(nullif(pp.party_display_name,''), e.name),
             'kind', pp.party_kind,
             'role', pp.party_role,
             'identifier_kind', pp.identifier_kind,
             'identifier_value', case when pp.party_kind = 'entity' then coalesce(pp.cr_number, pp.identifier_last4) else pp.identifier_last4 end,
             'is_full_identifier', pp.party_kind = 'entity' and pp.cr_number is not null,
             'status', pp.status,
             'starts_on', pp.starts_on,
             'ends_on', pp.ends_on) order by pp.created_at), '[]'::jsonb)
      into v_tmp
      from public.project_parties pp
      left join public.entities e on e.id = pp.party_entity_id
     where pp.project_id = _project_id and pp.status = 'accepted';
    v_out := jsonb_set(v_out, '{groups,contracted_parties}', coalesce(v_tmp, '[]'::jsonb));
  end if;

  return v_out;
end; $$;

-- ===================== unified property identity =====================
create or replace function public.property_identity(_property_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_projects jsonb := '[]'::jsonb;
  v_primary uuid;
  v_out jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select pp.project_id into v_primary
    from public.property_projects pp
    join public.projects p on p.id = pp.project_id and p.deleted_at is null
   where pp.property_id = _property_id
   order by (pp.relation = 'primary') desc, pp.created_at
   limit 1;

  if not private.can_access_property(v_actor, _property_id)
     and (v_primary is null or private.identity_my_party(v_actor, v_primary) is null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'project_id', p.id, 'name', p.name, 'code', p.code,
           'relation', pp.relation, 'status', p.status) order by pp.created_at), '[]'::jsonb)
    into v_projects
    from public.property_projects pp
    join public.projects p on p.id = pp.project_id and p.deleted_at is null
   where pp.property_id = _property_id
     and (private.can_access_project(v_actor, p.id) or private.identity_my_party(v_actor, p.id) is not null);

  if v_primary is not null then
    v_out := public.project_identity(v_primary);
  else
    v_out := jsonb_build_object('project_id', null, 'can_manage', private.can_manage_property(v_actor, _property_id), 'groups', jsonb_build_object());
  end if;

  return v_out || jsonb_build_object(
    'property_id', _property_id,
    'primary_project_id', v_primary,
    'linked_projects', v_projects
  );
end; $$;

-- ===================== visibility management =====================
create or replace function public.project_identity_visibility_settings(_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_rows jsonb;
begin
  if v_actor is null or not private.identity_is_manager(v_actor, _project_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'field_group', v.field_group,
           'level', v.level,
           'party_ids', coalesce((select jsonb_agg(a.project_party_id) from public.project_identity_audience a where a.visibility_id = v.id), '[]'::jsonb)
         )), '[]'::jsonb)
    into v_rows from public.project_identity_visibility v where v.project_id = _project_id;
  return jsonb_build_object('project_id', _project_id, 'settings', v_rows);
end; $$;

create or replace function public.set_project_identity_visibility(
  _project_id uuid, _field_group text, _level text, _party_ids uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not private.identity_is_manager(v_actor, _project_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if _field_group not in ('ownership','deed_license','parcel_plan','precise_location','contractor','contracted_parties') then
    raise exception 'Invalid field group' using errcode = '22023';
  end if;
  if _level not in ('internal','all_parties','selected_parties') then
    raise exception 'Invalid level' using errcode = '22023';
  end if;

  insert into public.project_identity_visibility (project_id, field_group, level)
  values (_project_id, _field_group, _level)
  on conflict (project_id, field_group) do update set level = excluded.level, updated_at = now()
  returning id into v_id;

  delete from public.project_identity_audience where visibility_id = v_id;
  if _level = 'selected_parties' and _party_ids is not null then
    insert into public.project_identity_audience (visibility_id, project_party_id)
    select v_id, pp.id from public.project_parties pp
     where pp.id = any(_party_ids)
       and pp.project_id = _project_id
       and pp.status = 'accepted';
  end if;

  return jsonb_build_object('ok', true, 'field_group', _field_group, 'level', _level);
end; $$;

-- ===================== grants on functions =====================
revoke execute on function private.identity_is_manager(uuid, uuid) from public, anon;
revoke execute on function private.identity_my_party(uuid, uuid) from public, anon;
revoke execute on function private.identity_group_allowed(uuid, uuid, text) from public, anon;
revoke execute on function public.project_identity(uuid) from public, anon;
revoke execute on function public.property_identity(uuid) from public, anon;
revoke execute on function public.project_identity_visibility_settings(uuid) from public, anon;
revoke execute on function public.set_project_identity_visibility(uuid, text, text, uuid[]) from public, anon;
revoke execute on function public.touch_updated_at_identity_visibility() from public, anon;

grant execute on function private.identity_is_manager(uuid, uuid) to authenticated;
grant execute on function private.identity_my_party(uuid, uuid) to authenticated;
grant execute on function private.identity_group_allowed(uuid, uuid, text) to authenticated;
grant execute on function public.project_identity(uuid) to authenticated;
grant execute on function public.property_identity(uuid) to authenticated;
grant execute on function public.project_identity_visibility_settings(uuid) to authenticated;
grant execute on function public.set_project_identity_visibility(uuid, text, text, uuid[]) to authenticated;