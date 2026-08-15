alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck check (object_type = any (array[
 'membership','grant','project_party','contracts','contract_versions','contract_version_amounts',
 'contract_parties','contract_extensions','change_orders','change_order_amounts','project_stages',
 'stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
 'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
 'requests','request_messages','property_services']));

create or replace function public.guard_property_service_write()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('rakeez.service_link', true), '') <> 'on' then
    raise exception 'property_services can only be written through review_and_link_service()' using errcode = '42501';
  end if;
  return new;
end; $$;

create or replace function public.create_service_request(
  _project_id uuid,
  _service_code text,
  _subject text,
  _body text default '',
  _property_id uuid default null,
  _property_unit_id uuid default null,
  _stage_id uuid default null,
  _assigned_entity_id uuid default null,
  _assigned_user_id uuid default null,
  _provider_name text default null,
  _external_ref_no text default null,
  _requirements_note text default null,
  _due_at timestamptz default null,
  _submit boolean default true
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_svc public.service_catalog%rowtype;
  v_request uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_svc from public.service_catalog where code = _service_code and is_active;
  if v_svc.code is null then
    raise exception 'Unknown or inactive service' using errcode = '22023';
  end if;
  if _property_id is null then
    raise exception 'A property is required for service requests' using errcode = '22023';
  end if;
  if not private.can_access_property(v_actor, _property_id) then
    raise exception 'Not allowed to use this property' using errcode = '42501';
  end if;
  if _property_unit_id is not null and not exists (
      select 1 from public.property_units u
      where u.id = _property_unit_id and u.property_id = _property_id) then
    raise exception 'Unit does not belong to this property' using errcode = '22023';
  end if;

  v_request := public.create_request(
    _project_id := _project_id,
    _request_type_code := 'service_' || _service_code,
    _subject := _subject,
    _body := coalesce(_body, ''),
    _stage_id := _stage_id,
    _property_id := _property_id,
    _property_unit_id := _property_unit_id,
    _assigned_entity_id := _assigned_entity_id,
    _assigned_user_id := _assigned_user_id,
    _due_at := _due_at,
    _submit := _submit);

  insert into public.service_request_details(
    request_id, service_code, provider_name, external_ref_no, requirements_note)
  values (v_request, _service_code, coalesce(_provider_name, v_svc.default_provider_ar),
          _external_ref_no, _requirements_note);

  return v_request;
end; $$;

create or replace function public.update_service_request_details(
  _request_id uuid,
  _provider_name text default null,
  _external_ref_no text default null,
  _requirements_note text default null,
  _payment_status text default null,
  _payment_amount numeric default null,
  _payment_ref text default null,
  _appointment_at timestamptz default null,
  _meter_no text default null,
  _account_no text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not private.can_access_request_ctx(v_actor, v_req.project_id, v_req.requested_by,
                                        v_req.assigned_user_id, v_req.assigned_entity_id) then
    raise exception 'Not allowed to update this request' using errcode = '42501';
  end if;
  if v_req.status in ('closed','cancelled') then
    raise exception 'Request is % and cannot be edited', v_req.status using errcode = '22023';
  end if;
  if _payment_status is not null and _payment_status not in ('not_required','pending','paid') then
    raise exception 'Invalid payment status' using errcode = '22023';
  end if;

  update public.service_request_details d set
    provider_name = coalesce(_provider_name, d.provider_name),
    external_ref_no = coalesce(_external_ref_no, d.external_ref_no),
    requirements_note = coalesce(_requirements_note, d.requirements_note),
    payment_status = coalesce(_payment_status, d.payment_status),
    payment_amount = coalesce(_payment_amount, d.payment_amount),
    payment_ref = coalesce(_payment_ref, d.payment_ref),
    paid_at = case when _payment_status = 'paid' then coalesce(d.paid_at, now()) else d.paid_at end,
    appointment_at = coalesce(_appointment_at, d.appointment_at),
    meter_no = coalesce(_meter_no, d.meter_no),
    account_no = coalesce(_account_no, d.account_no)
  where d.request_id = _request_id;

  return _request_id;
end; $$;

create or replace function public.advance_service_request(
  _request_id uuid,
  _to_status text,
  _note text default null
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_request_details d where d.request_id = _request_id) then
    raise exception 'Not a service request' using errcode = '22023';
  end if;
  if not private.can_access_request_ctx(v_actor, v_req.project_id, v_req.requested_by,
                                        v_req.assigned_user_id, v_req.assigned_entity_id) then
    raise exception 'Not allowed to advance this request' using errcode = '42501';
  end if;

  update public.requests set status = _to_status where id = _request_id;

  update public.service_request_details set
    installed_at = case when _to_status = 'installed' then coalesce(installed_at, now()) else installed_at end,
    activated_at = case when _to_status = 'activated' then coalesce(activated_at, now()) else activated_at end
  where request_id = _request_id;

  perform public.post_request_message(_request_id, coalesce(_note, 'تحديث حالة الطلب: ' || _to_status), 'shared', 'system');
  return _to_status;
end; $$;

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

  perform set_config('rakeez.service_link', 'on', true);
  insert into public.property_services(
    property_id, property_unit_id, service_type, service_code, status, reference_no,
    provider_name, meter_no, account_no, installed_at, activated_at,
    source_request_id, reviewed_by, reviewed_at, notes)
  values (
    v_req.property_id, v_req.property_unit_id, v_det.service_code, v_det.service_code,
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

revoke all on function public.create_service_request(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,boolean) from public, anon;
revoke all on function public.update_service_request_details(uuid,text,text,text,text,numeric,text,timestamptz,text,text) from public, anon;
revoke all on function public.advance_service_request(uuid,text,text) from public, anon;
revoke all on function public.review_and_link_service(uuid,boolean,text) from public, anon;
grant execute on function public.create_service_request(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,timestamptz,boolean) to authenticated;
grant execute on function public.update_service_request_details(uuid,text,text,text,text,numeric,text,timestamptz,text,text) to authenticated;
grant execute on function public.advance_service_request(uuid,text,text) to authenticated;
grant execute on function public.review_and_link_service(uuid,boolean,text) to authenticated;