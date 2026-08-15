alter table public.property_services drop constraint property_services_service_type_check;
alter table public.property_services add constraint property_services_service_type_check
  check (service_type = any (array['electricity','water','sewage','telecom','gas','meter_ops']));
alter table public.property_services drop constraint property_services_status_check;
alter table public.property_services add constraint property_services_status_check
  check (status = any (array['not_started','requested','in_progress','connected','activated']));

create or replace function public.review_and_link_service(
  _request_id uuid,
  _approve boolean,
  _note text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
  v_det public.service_request_details%rowtype;
  v_cat text;
  v_service_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  select * into v_det from public.service_request_details where request_id = _request_id;
  if v_det.request_id is null then
    raise exception 'Not a service request' using errcode = '22023';
  end if;
  if v_req.status <> 'activated' then
    raise exception 'Request must be activated before review (current: %)', v_req.status using errcode = '22023';
  end if;
  if v_req.property_id is null then
    raise exception 'Request has no property to link' using errcode = '22023';
  end if;
  if not private.is_project_insider(v_actor, v_req.project_id)
     or not private.can_manage_property(v_actor, v_req.property_id) then
    raise exception 'Not allowed to link services on this property' using errcode = '42501';
  end if;

  if not _approve then
    update public.requests set status = 'info_needed' where id = _request_id;
    perform public.post_request_message(_request_id,
      coalesce(_note, 'أعيد الطلب لاستكمال البيانات قبل الربط'), 'shared', 'decision');
    return null;
  end if;

  if v_det.meter_no is not null and exists (
      select 1 from public.property_services s
      where s.service_code = v_det.service_code and s.meter_no = v_det.meter_no) then
    raise exception 'Meter number % already linked for this service', v_det.meter_no using errcode = '23505';
  end if;

  select category into v_cat from public.service_catalog where code = v_det.service_code;

  perform set_config('rakeez.service_link', 'on', true);
  insert into public.property_services(
    property_id, property_unit_id, service_type, service_code, status, reference_no,
    provider_name, meter_no, account_no, installed_at, activated_at,
    source_request_id, reviewed_by, reviewed_at, notes)
  values (
    v_req.property_id, v_req.property_unit_id, v_cat, v_det.service_code,
    'activated', v_det.external_ref_no, v_det.provider_name, v_det.meter_no, v_det.account_no,
    v_det.installed_at, coalesce(v_det.activated_at, now()),
    _request_id, v_actor, now(), _note)
  returning id into v_service_id;
  perform set_config('rakeez.service_link', 'off', true);

  update public.requests
    set status = 'closed', closed_at = now(), closure_reason = coalesce(_note, 'تم ربط الخدمة بالعقار')
    where id = _request_id;

  perform public.post_request_message(_request_id,
    coalesce(_note, 'تمت مراجعة الطلب وربط الخدمة بالعقار'), 'shared', 'decision');

  insert into public.permission_audit_log(actor_user_id, object_type, object_id, action, new_value)
  values (v_actor, 'property_services', v_service_id, 'insert',
          jsonb_build_object('source_request_id', _request_id, 'service_code', v_det.service_code,
                             'meter_no', v_det.meter_no, 'property_id', v_req.property_id));

  return v_service_id;
end; $$;