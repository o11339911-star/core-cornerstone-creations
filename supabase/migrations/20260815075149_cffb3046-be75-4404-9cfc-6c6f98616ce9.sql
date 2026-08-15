CREATE OR REPLACE FUNCTION public.approve_report(_version_id uuid, _note text DEFAULT NULL::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.report_versions%rowtype; r public.reports%rowtype; lic record; v_seal uuid; v_checksum text;
begin
  select * into v from public.report_versions where id = _version_id;
  if v.id is null then raise exception 'Version not found' using errcode='22023'; end if;
  select * into r from public.reports where id = v.report_id;
  if v.status = 'approved' then raise exception 'Version already approved' using errcode='22023'; end if;
  if v.status <> 'pending_approval' then raise exception 'Version must be submitted for approval first' using errcode='22023'; end if;

  if not private.is_entity_member(auth.uid(), r.entity_id)
     or not private.can(auth.uid(), 'reports'::app_module, 'approve'::app_action, r.entity_id, r.project_id) then
    raise exception 'Not allowed to approve reports' using errcode='42501';
  end if;
  if auth.uid() = v.created_by or auth.uid() = v.last_edited_by then
    raise exception 'SELF_APPROVAL_FORBIDDEN: the author or editor of a version cannot approve it' using errcode='42501';
  end if;

  select * into lic from public.entity_license_state(r.entity_id);
  if not lic.is_valid then
    raise exception 'OFFICE_LICENSE_INVALID (%): the office licence must be valid and verified before official approval', lic.reason
      using errcode = '42501';
  end if;

  select id into v_seal from public.entity_seals where entity_id = r.entity_id and is_active limit 1;
  v_checksum := encode(sha256(convert_to(v.content::text, 'UTF8')), 'hex');

  update public.report_versions
     set status = 'approved', approved_by = auth.uid(), approved_at = now(),
         approval_note = _note, stamp_applied = (v_seal is not null),
         snapshot = private.build_report_snapshot(r.id),
         checksum_sha256 = v_checksum
   where id = _version_id;

  update public.reports
     set status = 'approved', current_version_id = _version_id, is_certified = true
   where id = r.id;

  insert into public.report_audit_log(report_id, version_id, actor_id, action, detail)
  values (r.id, _version_id, auth.uid(), 'approved',
    jsonb_build_object('version_no', v.version_no, 'checksum', v_checksum, 'stamp_applied', v_seal is not null));
  return now();
end; $function$;