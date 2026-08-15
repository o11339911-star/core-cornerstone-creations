create or replace function public.project_completion(_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _st int := 0; _sd int := 0; _ct int := 0; _cd int := 0;
  _pct numeric := 0;
begin
  if _uid is null then return null; end if;
  if not private.can_access_project(_uid, _project_id) then return null; end if;

  select count(*), count(*) filter (where status in ('approved','done','skipped'))
    into _st, _sd
  from public.project_stages
  where project_id = _project_id and deleted_at is null and is_required;

  select count(*), count(*) filter (where status in ('satisfied','waived'))
    into _ct, _cd
  from public.project_closure_items
  where project_id = _project_id;

  if (_st + _ct) > 0 then
    _pct := round(((_sd + _cd)::numeric / (_st + _ct)::numeric) * 100, 1);
  end if;

  return jsonb_build_object(
    'stages_total', _st, 'stages_done', _sd,
    'closure_total', _ct, 'closure_done', _cd,
    'percent', _pct
  );
end;
$$;

create or replace function public.get_project_overview(_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _p public.projects%rowtype;
  _out jsonb;
  _prop_id uuid;
  _exact boolean := false;
begin
  if _uid is null then return null; end if;
  if not private.can_access_project(_uid, _project_id) then return null; end if;

  select * into _p from public.projects where id = _project_id and deleted_at is null;
  if not found then return null; end if;

  select pp.property_id into _prop_id
  from public.property_projects pp
  where pp.project_id = _project_id
  order by pp.created_at asc
  limit 1;

  if _prop_id is not null then
    _exact := private.can_view_exact_location(_uid, _prop_id);
  end if;

  _out := jsonb_build_object(
    'basics', jsonb_build_object(
      'id', _p.id, 'code', _p.code, 'name', _p.name, 'status', _p.status,
      'start_date', _p.start_date, 'expected_end_date', _p.expected_end_date,
      'land_area', _p.land_area, 'notes', _p.notes,
      'closed_at', _p.closed_at, 'archived_at', _p.archived_at,
      'reopened_count', _p.reopened_count,
      'entity_id', _p.entity_id,
      'entity_name', (select e.name from public.entities e where e.id = _p.entity_id),
      'template_code', (select t.code from public.project_templates t where t.id = _p.project_template_id),
      'template_name_ar', (select t.name_ar from public.project_templates t where t.id = _p.project_template_id)
    ),
    'location', jsonb_build_object(
      'city', _p.city, 'district', _p.district,
      'property_id', _prop_id,
      'plan_no', (select pr.plan_no from public.properties pr where pr.id = _prop_id),
      'parcel_no', (select pr.parcel_no from public.properties pr where pr.id = _prop_id),
      'approx_lat', (select pr.approx_lat from public.properties pr where pr.id = _prop_id),
      'approx_lng', (select pr.approx_lng from public.properties pr where pr.id = _prop_id),
      'exact_visible', _exact,
      'exact', case when _exact and _prop_id is not null then (
        select to_jsonb(x) from (
          select el.exact_lat, el.exact_lng, el.exact_address
          from public.property_exact_locations el where el.property_id = _prop_id
        ) x)
      else null end
    ),
    'ownership', coalesce((
      select jsonb_agg(jsonb_build_object(
        'owner_name', o.owner_name_text,
        'national_id_masked', o.national_id_masked,
        'share_percent', o.share_percent,
        'starts_on', o.starts_on, 'ends_on', o.ends_on)
        order by o.share_percent desc nulls last)
      from public.property_owners o where o.property_id = _prop_id
    ), '[]'::jsonb),
    'deed', (
      select jsonb_build_object('deed_number', d.deed_number, 'issuer', d.issuer,
        'deed_date', dv.deed_date, 'area', dv.area)
      from public.deeds d
      left join public.deed_versions dv on dv.id = d.current_version_id
      where d.property_id = _prop_id
      order by d.created_at desc limit 1
    ),
    'license', (
      select jsonb_build_object('license_number', l.license_number, 'authority', l.authority,
        'issued_on', lv.issued_on, 'expires_on', lv.expires_on)
      from public.building_licenses l
      left join public.license_versions lv on lv.id = l.current_version_id
      where l.property_id = _prop_id
      order by l.created_at desc limit 1
    ),
    'parties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id, 'party_role', pa.party_role, 'status', pa.status,
        'entity_name', (select e.name from public.entities e where e.id = pa.party_entity_id),
        'starts_on', pa.starts_on, 'ends_on', pa.ends_on) order by pa.created_at)
      from public.project_parties pa
      where pa.project_id = _project_id and pa.status in ('invited','accepted')
    ), '[]'::jsonb),
    'supervisors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'job_title_ar', a.job_title_ar, 'job_title_en', a.job_title_en,
        'status', a.status,
        'full_name', (select pf.full_name from public.profiles pf where pf.id = a.user_id))
        order by a.created_at)
      from public.project_assignments a
      where a.project_id = _project_id and a.deleted_at is null and a.status = 'active'
        and private.can_see_assignee(_uid, a.id)
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_object_agg(s.status, s.n) from (
        select d.status, count(*) n
        from public.documents d
        join public.document_links dl on dl.document_id = d.id
        where dl.context_type = 'project' and dl.context_id = _project_id
          and d.is_deleted = false
        group by d.status
      ) s
    ), '{}'::jsonb),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name_ar', s.name_ar, 'name_en', s.name_en,
        'status', s.status, 'is_required', s.is_required,
        'order_index', s.order_index,
        'planned_start', s.planned_start, 'planned_end', s.planned_end)
        order by s.order_index)
      from public.project_stages s
      where s.project_id = _project_id and s.deleted_at is null
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'request_no', r.request_no, 'subject', r.subject,
        'status', r.status, 'priority', r.priority, 'due_at', r.due_at)
        order by r.created_at desc)
      from public.requests r
      where r.project_id = _project_id
        and r.status not in ('closed','cancelled','rejected')
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sv.id, 'service_code', sv.service_code, 'service_type', sv.service_type,
        'status', sv.status, 'provider_name', sv.provider_name)
        order by sv.created_at)
      from public.property_services sv where sv.property_id = _prop_id
    ), '[]'::jsonb),
    'completion', public.project_completion(_project_id)
  );

  -- Finance section is ADDED ONLY for authorized viewers: the key is entirely
  -- absent from the payload otherwise (no UI-level hiding).
  if private.can_view_project_finance(_uid, _project_id) then
    _out := _out || jsonb_build_object('finance', jsonb_build_object(
      'contracts', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'contract_number', c.contract_number,
          'title', c.title, 'status', c.status, 'currency', c.currency) order by c.created_at)
        from public.contracts c
        where c.project_id = _project_id and c.deleted_at is null), '[]'::jsonb),
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'seq', m.seq, 'title_ar', m.title_ar,
          'status', m.status, 'due_date', m.due_date,
          'amount', ma.amount, 'currency', ma.currency,
          'percent_of_contract', ma.percent_of_contract) order by m.seq)
        from public.payment_milestones m
        left join public.payment_milestone_amounts ma on ma.milestone_id = m.id
        where m.project_id = _project_id), '[]'::jsonb)
    ));
  end if;

  return _out;
end;
$$;

create or replace function public.search_projects(_q text, _limit int default 20)
returns table (
  project_id uuid,
  code text,
  name text,
  status text,
  city text,
  district text,
  match_field text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _needle text := '%' || btrim(coalesce(_q, '')) || '%';
begin
  if _uid is null or length(btrim(coalesce(_q,''))) < 2 then return; end if;

  return query
  with candidates as (
    select p.id, p.code, p.name, p.status, p.city, p.district,
           case
             when p.code ilike _needle then 'project_code'
             when p.name ilike _needle then 'project_name'
             when p.district ilike _needle then 'district'
             else 'project'
           end as mf,
           p.created_at
    from public.projects p
    where p.deleted_at is null
      and (p.code ilike _needle or p.name ilike _needle or p.district ilike _needle)
    union
    select p.id, p.code, p.name, p.status, p.city, p.district,
           case
             when pr.parcel_no ilike _needle then 'parcel_no'
             when pr.plan_no ilike _needle then 'plan_no'
             else 'property_district'
           end,
           p.created_at
    from public.projects p
    join public.property_projects pp on pp.project_id = p.id
    join public.properties pr on pr.id = pp.property_id and pr.deleted_at is null
    where p.deleted_at is null
      and (pr.parcel_no ilike _needle or pr.plan_no ilike _needle or pr.district ilike _needle)
    union
    select p.id, p.code, p.name, p.status, p.city, p.district, 'deed_number', p.created_at
    from public.projects p
    join public.property_projects pp on pp.project_id = p.id
    join public.deeds d on d.property_id = pp.property_id
    where p.deleted_at is null and d.deed_number ilike _needle
    union
    select p.id, p.code, p.name, p.status, p.city, p.district, 'license_number', p.created_at
    from public.projects p
    join public.property_projects pp on pp.project_id = p.id
    join public.building_licenses bl on bl.property_id = pp.property_id
    where p.deleted_at is null and bl.license_number ilike _needle
  )
  select c.id, c.code, c.name, c.status, c.city, c.district, min(c.mf)
  from candidates c
  -- Access is re-derived per row at call time; no leakage of existence.
  where private.can_access_project(_uid, c.id)
  group by c.id, c.code, c.name, c.status, c.city, c.district, c.created_at
  order by c.created_at desc
  limit least(greatest(coalesce(_limit, 20), 1), 50);
end;
$$;

revoke all on function public.project_completion(uuid) from public, anon;
revoke all on function public.get_project_overview(uuid) from public, anon;
revoke all on function public.search_projects(text, int) from public, anon;

grant execute on function public.project_completion(uuid) to authenticated;
grant execute on function public.get_project_overview(uuid) to authenticated;
grant execute on function public.search_projects(text, int) to authenticated;