-- 1) Engineering entity: design offices, and supervision entities only when their
--    registered economic activity is architectural/engineering (ISIC4 7110*).
create or replace function private.is_engineering_entity(_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.entities e
     where e.id = _entity_id
       and e.deleted_at is null
       and (
         e.type = 'design_office'
         or (
           e.type = 'supervision'
           and exists (
             select 1 from public.entity_activities ea
              where ea.entity_id = e.id
                and ea.activity_code like '7110%'
           )
         )
       )
  );
$$;

-- 2) Inspection / laboratory entity: inspector type, or any entity registered
--    under technical testing & analysis activities (ISIC4 7120*).
create or replace function private.is_inspection_entity(_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.entities e
     where e.id = _entity_id
       and e.deleted_at is null
       and (
         e.type = 'inspector'
         or exists (
           select 1 from public.entity_activities ea
            where ea.entity_id = e.id
              and ea.activity_code like '7120%'
         )
       )
  );
$$;

create or replace function private.inspection_report_block_reason(_user_id uuid, _entity_id uuid, _project_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if _user_id is null then return 'UNAUTHENTICATED'; end if;
  if not private.is_inspection_entity(_entity_id) then return 'ENTITY_NOT_INSPECTION'; end if;
  if not private.is_entity_member(_user_id, _entity_id) then return 'NOT_ENTITY_MEMBER'; end if;
  if not private.entity_linked_to_project(_entity_id, _project_id) then return 'ENTITY_NOT_LINKED_TO_PROJECT'; end if;
  return null;
end; $$;

create or replace function private.assert_can_issue_inspection_report(_user_id uuid, _entity_id uuid, _project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare v_reason text;
begin
  v_reason := private.inspection_report_block_reason(_user_id, _entity_id, _project_id);
  if v_reason is not null then
    raise exception 'INSPECTION_REPORT_FORBIDDEN (%)', v_reason using errcode='42501';
  end if;
end; $$;

create or replace function public.can_issue_inspection_report(_entity_id uuid, _project_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select private.inspection_report_block_reason(auth.uid(), _entity_id, _project_id);
$$;

revoke execute on function private.is_inspection_entity(uuid) from public, anon;
revoke execute on function private.inspection_report_block_reason(uuid, uuid, uuid) from public, anon;
revoke execute on function private.assert_can_issue_inspection_report(uuid, uuid, uuid) from public, anon;
revoke execute on function public.can_issue_inspection_report(uuid, uuid) from public, anon;
grant execute on function public.can_issue_inspection_report(uuid, uuid) to authenticated;

-- 3) Allow the two independent inspection kinds.
alter table public.reports drop constraint if exists reports_report_kind_check;
alter table public.reports add constraint reports_report_kind_check
  check (report_kind = any (array['engineering','administrative','inspection','technical_test']));

-- 4) create_report: validate the new kinds and guard them.
create or replace function public.create_report(_entity_id uuid, _project_id uuid, _title text, _template_id uuid default null::uuid, _language text default 'ar'::text, _stage_id uuid default null::uuid, _visit_id uuid default null::uuid, _property_id uuid default null::uuid, _report_kind text default 'engineering'::text, _request_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_report_id uuid; v_no integer; v_year integer := extract(year from now())::int;
        v_number text; v_content jsonb := '{"blocks":[]}'::jsonb; v_page jsonb;
        t public.report_templates%rowtype; v_dir text; req public.requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if _report_kind not in ('engineering','administrative','inspection','technical_test') then
    raise exception 'Invalid report kind' using errcode='22023';
  end if;
  if not private.is_entity_member(auth.uid(), _entity_id) then
    raise exception 'Not a member of this entity' using errcode='42501';
  end if;
  if not private.can(auth.uid(), 'reports'::app_module, 'create'::app_action, _entity_id, _project_id) then
    raise exception 'Not allowed to create reports' using errcode='42501';
  end if;
  if not private.can_access_project(auth.uid(), _project_id) then
    raise exception 'No access to this project' using errcode='42501';
  end if;
  if _report_kind = 'engineering' then
    perform private.assert_can_issue_engineering_report(auth.uid(), _entity_id, _project_id);
  elsif _report_kind in ('inspection','technical_test') then
    perform private.assert_can_issue_inspection_report(auth.uid(), _entity_id, _project_id);
  end if;
  if _language not in ('ar','en') then raise exception 'Invalid language' using errcode='22023'; end if;
  v_dir := case when _language = 'ar' then 'rtl' else 'ltr' end;

  if _request_id is not null then
    select * into req from public.requests where id = _request_id;
    if req.id is null or req.project_id <> _project_id then
      raise exception 'Request does not belong to this project' using errcode='22023';
    end if;
  end if;

  if _template_id is not null then
    select * into t from public.report_templates where id = _template_id;
    if t.id is null then raise exception 'Template not found' using errcode='22023'; end if;
    v_content := coalesce(t.content, v_content);
    v_page := t.page_setup;
  end if;

  select coalesce(max(seq),0) + 1 into v_no from public.report_number_counters
   where entity_id = _entity_id and year = v_year;
  insert into public.report_number_counters(entity_id, year, seq)
  values (_entity_id, v_year, v_no)
  on conflict (entity_id, year) do update set seq = excluded.seq;
  v_number := 'RPT-' || v_year::text || '-' || lpad(v_no::text, 4, '0');

  insert into public.reports(entity_id, project_id, stage_id, visit_id, property_id, request_id,
                             template_id, title, language, direction, report_number, report_kind,
                             status, created_by)
  values (_entity_id, _project_id, _stage_id, _visit_id, _property_id, _request_id,
          _template_id, _title, _language, v_dir, v_number, _report_kind, 'draft', auth.uid())
  returning id into v_report_id;

  insert into public.report_versions(report_id, version_no, content, page_setup, created_by, last_edited_by)
  values (v_report_id, 1, v_content, coalesce(v_page, '{}'::jsonb), auth.uid(), auth.uid());

  insert into public.report_audit_log(report_id, actor_id, action, detail)
  values (v_report_id, auth.uid(), 'created', jsonb_build_object('report_kind', _report_kind, 'number', v_number));

  return v_report_id;
end; $function$;

-- 5) Version creation and approval guards for the new kinds.
create or replace function public.create_report_version(_report_id uuid, _reason text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r public.reports%rowtype; src public.report_versions%rowtype; v_new uuid; v_no integer;
begin
  select * into r from public.reports where id = _report_id;
  if r.id is null then raise exception 'Report not found' using errcode='22023'; end if;
  if not private.can_access_report(auth.uid(), _report_id, 'update'::app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if r.report_kind = 'engineering' then
    perform private.assert_can_issue_engineering_report(auth.uid(), r.entity_id, r.project_id);
  elsif r.report_kind in ('inspection','technical_test') then
    perform private.assert_can_issue_inspection_report(auth.uid(), r.entity_id, r.project_id);
  end if;
  if exists (select 1 from public.report_versions where report_id = _report_id and status <> 'approved') then
    raise exception 'An unapproved version already exists' using errcode='22023';
  end if;
  select * into src from public.report_versions where report_id = _report_id order by version_no desc limit 1;
  select coalesce(max(version_no),0) + 1 into v_no from public.report_versions where report_id = _report_id;

  insert into public.report_versions(report_id, version_no, content, page_setup, created_by, last_edited_by)
  values (_report_id, v_no, src.content, src.page_setup, auth.uid(), auth.uid())
  returning id into v_new;

  update public.reports set status = 'superseded' where id = _report_id;
  insert into public.report_audit_log(report_id, version_id, actor_id, action, detail)
  values (_report_id, v_new, auth.uid(), 'version_created', jsonb_build_object('version_no', v_no, 'reason', _reason));
  return v_new;
end; $function$;

create or replace function public.approve_report(_version_id uuid, _note text default null::text)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if r.report_kind = 'engineering' then
    perform private.assert_can_issue_engineering_report(auth.uid(), r.entity_id, r.project_id);
  elsif r.report_kind in ('inspection','technical_test') then
    perform private.assert_can_issue_inspection_report(auth.uid(), r.entity_id, r.project_id);
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

revoke execute on function public.create_report(uuid, uuid, text, uuid, text, uuid, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.create_report(uuid, uuid, text, uuid, text, uuid, uuid, uuid, text, uuid) to authenticated;
revoke execute on function public.create_report_version(uuid, text) from public, anon;
grant execute on function public.create_report_version(uuid, text) to authenticated;
revoke execute on function public.approve_report(uuid, text) from public, anon;
grant execute on function public.approve_report(uuid, text) to authenticated;