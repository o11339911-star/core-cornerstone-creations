create or replace function public.issue_marketing_package(_version_id uuid, _contract_id uuid, _expires_at timestamptz, _channel_code text default null, _watermark_text text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_uid uuid := auth.uid(); r record; v_lic record; v_no integer; v_token text; v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select v.id vid, v.status vstatus, v.profile_id, mp.project_id, mp.owner_entity_id,
         mc.id cid, mc.status cstatus, mc.marketer_entity_id
    into r
  from public.marketing_versions v
  join public.marketing_profiles mp on mp.id = v.profile_id
  join public.marketing_contracts mc on mc.id = _contract_id and mc.profile_id = v.profile_id
  where v.id = _version_id;
  if r.vid is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not private.can(v_uid, 'marketing'::public.app_module, 'approve'::public.app_action, r.owner_entity_id, r.project_id) then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  if r.vstatus <> 'approved' then raise exception 'MARKETING_VERSION_NOT_APPROVED' using errcode='22023'; end if;
  if r.cstatus <> 'active' then raise exception 'MARKETING_CONTRACT_NOT_ACTIVE' using errcode='22023'; end if;

  select * into v_lic from public.entity_licenses el
   where el.entity_id = r.marketer_entity_id
     and el.status = 'active'
     and el.verified_at is not null
     and lower(coalesce(el.discipline,'')) = 'val'
     and (el.expires_on is null or el.expires_on >= current_date)
   order by el.expires_on desc nulls first limit 1;
  if v_lic.id is null then raise exception 'MARKETER_LICENSE_INVALID' using errcode='22023'; end if;

  select coalesce(max(package_no),0)+1 into v_no from public.marketing_packages where version_id = _version_id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.marketing_packages(version_id, contract_id, package_no, verify_token, license_number_snapshot,
    marketer_entity_id, channel_code, watermark_text, expires_at, issued_by)
  values (_version_id, _contract_id, v_no, v_token, v_lic.license_number, r.marketer_entity_id, _channel_code,
    coalesce(_watermark_text, 'RAKEEZ - ' || to_char(now(),'YYYY-MM-DD')), _expires_at, v_uid)
  returning id into v_id;
  insert into public.permission_audit_log(actor_user_id, target_entity_id, target_project_id, object_type, object_id, action)
  values (v_uid, r.owner_entity_id, r.project_id, 'marketing_packages', v_id, 'insert');
  return jsonb_build_object('package_no', v_no, 'verify_token', v_token, 'expires_at', _expires_at);
end; $function$;

revoke all on function public.issue_marketing_package(uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.issue_marketing_package(uuid, uuid, timestamptz, text, text) to authenticated;