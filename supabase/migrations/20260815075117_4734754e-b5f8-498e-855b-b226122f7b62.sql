CREATE OR REPLACE FUNCTION private.build_report_snapshot(_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.reports%rowtype; snap jsonb; lic record; prof public.entity_profiles%rowtype;
begin
  select * into r from public.reports where id = _report_id;
  if r.id is null then raise exception 'Report not found' using errcode='22023'; end if;
  select * into prof from public.entity_profiles where entity_id = r.entity_id;
  select * into lic from public.entity_license_state(r.entity_id);

  snap := jsonb_build_object(
    'generated_at', now(),
    'entity', (select jsonb_build_object('id', e.id, 'name', e.name, 'type', e.type,
                 'cr_number', prof.cr_number, 'logo_path', prof.logo_path,
                 'legal_name_ar', prof.legal_name_ar, 'legal_name_en', prof.legal_name_en,
                 'verified_at', prof.verified_at)
               from public.entities e where e.id = r.entity_id),
    'license', jsonb_build_object('has_license', lic.has_license, 'is_valid', lic.is_valid,
                 'license_number', lic.license_number, 'expires_on', lic.expires_on, 'reason', lic.reason),
    'project', (select jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'city', p.city, 'district', p.district)
                from public.projects p where p.id = r.project_id),
    'stage', (select jsonb_build_object('id', s.id, 'name_ar', s.name_ar, 'name_en', s.name_en, 'status', s.status)
              from public.project_stages s where s.id = r.stage_id),
    'visit', (select jsonb_build_object('id', v.id, 'visit_start', v.visit_start, 'summary', v.summary)
              from public.site_visits v where v.id = r.visit_id),
    'property', (select jsonb_build_object('id', pr.id, 'name', pr.name, 'kind', pr.kind, 'city', pr.city,
                   'district', pr.district, 'plan_no', pr.plan_no, 'parcel_no', pr.parcel_no, 'land_area', pr.land_area)
                 from public.properties pr where pr.id = r.property_id),
    'deed', (select jsonb_build_object('deed_number', d.deed_number)
             from public.deeds d where d.property_id = r.property_id limit 1),
    'building_license', (select jsonb_build_object('license_number', bl.license_number, 'authority', bl.authority)
             from public.building_licenses bl where bl.property_id = r.property_id limit 1),
    'owners', coalesce((select jsonb_agg(jsonb_build_object(
                  'owner_name', coalesce(po.owner_name_text, oe.name, pf.full_name),
                  'share_percent', po.share_percent))
                from public.property_owners po
                left join public.entities oe on oe.id = po.owner_entity_id
                left join public.profiles pf on pf.id = po.owner_user_id
                where po.property_id = r.property_id), '[]'::jsonb),
    'parties', coalesce((select jsonb_agg(jsonb_build_object('role', pp.party_role, 'entity_name', e2.name))
                from public.project_parties pp join public.entities e2 on e2.id = pp.party_entity_id
                where pp.project_id = r.project_id and pp.status = 'accepted'), '[]'::jsonb),
    'contract', (select jsonb_build_object('contract_number', c.contract_number, 'title', c.title, 'contract_type', c.contract_type)
                 from public.contracts c where c.project_id = r.project_id and c.deleted_at is null
                 order by c.created_at limit 1)
  );
  return snap;
end; $function$;