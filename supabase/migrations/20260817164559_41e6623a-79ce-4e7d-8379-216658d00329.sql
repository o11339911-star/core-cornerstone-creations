-- 1) report kind + request linkage -------------------------------------------------
alter table public.reports
  add column if not exists report_kind text not null default 'engineering',
  add column if not exists request_id uuid references public.requests(id) on delete set null;

do $$ begin
  alter table public.reports add constraint reports_report_kind_chk
    check (report_kind in ('engineering','administrative'));
exception when duplicate_object then null; end $$;

alter table public.report_templates
  add column if not exists report_kind text not null default 'engineering';

do $$ begin
  alter table public.report_templates add constraint report_templates_report_kind_chk
    check (report_kind in ('engineering','administrative'));
exception when duplicate_object then null; end $$;

create index if not exists reports_request_id_idx on public.reports(request_id);

-- 2) eligibility helpers ------------------------------------------------------------
create or replace function private.is_engineering_entity(_entity_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.entities e
     where e.id = _entity_id
       and e.deleted_at is null
       and e.type in ('design_office','supervision','inspector')
  );
$$;

create or replace function private.entity_linked_to_project(_entity_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
     where p.id = _project_id and p.entity_id = _entity_id and p.deleted_at is null
  ) or exists (
    select 1 from public.project_parties pp
     where pp.project_id = _project_id
       and pp.party_entity_id = _entity_id
       and pp.status = 'accepted'
  );
$$;

-- returns null when allowed, otherwise a technical reason code
create or replace function private.engineering_report_block_reason(
  _user_id uuid, _entity_id uuid, _project_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if _user_id is null then return 'UNAUTHENTICATED'; end if;
  if not private.is_engineering_entity(_entity_id) then return 'ENTITY_NOT_ENGINEERING'; end if;
  if not private.is_entity_member(_user_id, _entity_id) then return 'NOT_ENTITY_MEMBER'; end if;
  if not private.entity_linked_to_project(_entity_id, _project_id) then return 'ENTITY_NOT_LINKED_TO_PROJECT'; end if;
  return null;
end; $$;

create or replace function private.assert_can_issue_engineering_report(
  _user_id uuid, _entity_id uuid, _project_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare v_reason text;
begin
  v_reason := private.engineering_report_block_reason(_user_id, _entity_id, _project_id);
  if v_reason is not null then
    raise exception 'ENGINEERING_REPORT_FORBIDDEN (%)', v_reason using errcode = '42501';
  end if;
end; $$;

create or replace function public.can_issue_engineering_report(_entity_id uuid, _project_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select private.engineering_report_block_reason(auth.uid(), _entity_id, _project_id);
$$;

-- 3) hard backstop triggers ----------------------------------------------------------
create or replace function public.enforce_engineering_report_issuer()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r public.reports%rowtype;
begin
  if tg_table_name = 'reports' then
    if new.report_kind = 'engineering' then
      perform private.assert_can_issue_engineering_report(auth.uid(), new.entity_id, new.project_id);
    end if;
    return new;
  end if;

  select * into r from public.reports where id = new.report_id;
  if r.id is not null and r.report_kind = 'engineering' then
    perform private.assert_can_issue_engineering_report(auth.uid(), r.entity_id, r.project_id);
  end if;
  return new;
end; $$;

drop trigger if exists trg_reports_engineering_issuer on public.reports;
create trigger trg_reports_engineering_issuer
  before insert on public.reports
  for each row execute function public.enforce_engineering_report_issuer();

drop trigger if exists trg_report_versions_engineering_issuer on public.report_versions;
create trigger trg_report_versions_engineering_issuer
  before insert or update on public.report_versions
  for each row execute function public.enforce_engineering_report_issuer();

-- 4) create_report: kind + request linkage + eligibility ------------------------------
drop function if exists public.create_report(uuid, uuid, text, uuid, text, uuid, uuid, uuid);

create or replace function public.create_report(
  _entity_id uuid, _project_id uuid, _title text,
  _template_id uuid default null, _language text default 'ar',
  _stage_id uuid default null, _visit_id uuid default null, _property_id uuid default null,
  _report_kind text default 'engineering', _request_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_report_id uuid; v_no integer; v_year integer := extract(year from now())::int;
        v_number text; v_content jsonb := '{"blocks":[]}'::jsonb; v_page jsonb;
        t public.report_templates%rowtype; v_dir text; req public.requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if _report_kind not in ('engineering','administrative') then
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
  end if;
  if _language not in ('ar','en') then raise exception 'Invalid language' using errcode='22023'; end if;
  v_dir := case when _language = 'ar' then 'rtl' else 'ltr' end;

  if _request_id is not null then
    select * into req from public.requests where id = _request_id;
    if req.id is null or req.project_id <> _project_id then
      raise exception 'Request does not belong to this project' using errcode='22023';
    end if;
    if req.assigned_entity_id is distinct from _entity_id then
      raise exception 'Request is not assigned to this entity' using errcode='42501';
    end if;
  end if;

  if _template_id is not null then
    select * into t from public.report_templates where id = _template_id;
    if t.id is null then raise exception 'Template not found' using errcode='22023'; end if;
    if t.owner_scope = 'entity' and t.entity_id <> _entity_id then
      raise exception 'Template belongs to another entity' using errcode='42501';
    end if;
    v_content := t.content; v_page := t.page_setup;
  end if;

  insert into public.report_number_counters(entity_id, year, last_no)
  values (_entity_id, v_year, 1)
  on conflict (entity_id, year) do update set last_no = public.report_number_counters.last_no + 1
  returning last_no into v_no;
  v_number := 'RPT-' || v_year::text || '-' || lpad(v_no::text, 4, '0');

  insert into public.reports(entity_id, project_id, stage_id, visit_id, property_id, template_id,
    report_number, title, language, direction, status, created_by, report_kind, request_id)
  values (_entity_id, _project_id, _stage_id, _visit_id, _property_id, _template_id,
    v_number, _title, _language, v_dir, 'draft', auth.uid(), _report_kind, _request_id)
  returning id into v_report_id;

  insert into public.report_versions(report_id, version_no, content, page_setup, snapshot, created_by, last_edited_by)
  values (v_report_id, 1, v_content, coalesce(v_page, '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb),
    private.build_report_snapshot(v_report_id), auth.uid(), auth.uid());

  update public.reports set current_version_id = (select id from public.report_versions where report_id = v_report_id and version_no = 1)
   where id = v_report_id;

  insert into public.report_audit_log(report_id, actor_id, action, detail)
  values (v_report_id, auth.uid(), 'created', jsonb_build_object('report_number', v_number, 'template_id', _template_id, 'report_kind', _report_kind));
  return v_report_id;
end; $function$;

-- 5) guard the remaining lifecycle RPCs ------------------------------------------------
create or replace function public.save_report_draft(_version_id uuid, _content jsonb, _page_setup jsonb default null)
returns timestamp with time zone language plpgsql security definer set search_path to 'public'
as $function$
declare v public.report_versions%rowtype; r public.reports%rowtype;
begin
  select * into v from public.report_versions where id = _version_id;
  if v.id is null then raise exception 'Version not found' using errcode='22023'; end if;
  select * into r from public.reports where id = v.report_id;
  if v.status = 'approved' then raise exception 'Approved version is locked' using errcode='42501'; end if;
  if not private.can_access_report(auth.uid(), v.report_id, 'update'::app_action) then
    raise exception 'Not allowed to edit this report' using errcode='42501';
  end if;
  if r.report_kind = 'engineering' then
    perform private.assert_can_issue_engineering_report(auth.uid(), r.entity_id, r.project_id);
  end if;
  update public.report_versions
     set content = _content,
         page_setup = coalesce(_page_setup, page_setup),
         last_edited_by = auth.uid(),
         status = 'draft'
   where id = _version_id;
  insert into public.report_audit_log(report_id, version_id, actor_id, action)
  values (v.report_id, _version_id, auth.uid(), 'draft_saved');
  return now();
end; $function$;

create or replace function public.submit_report_version(_version_id uuid)
returns timestamp with time zone language plpgsql security definer set search_path to 'public'
as $function$
declare v public.report_versions%rowtype; r public.reports%rowtype;
begin
  select * into v from public.report_versions where id = _version_id;
  if v.id is null then raise exception 'Version not found' using errcode='22023'; end if;
  select * into r from public.reports where id = v.report_id;
  if v.status <> 'draft' then raise exception 'Only drafts can be submitted' using errcode='22023'; end if;
  if not private.can_access_report(auth.uid(), v.report_id, 'update'::app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if r.report_kind = 'engineering' then
    perform private.assert_can_issue_engineering_report(auth.uid(), r.entity_id, r.project_id);
  end if;
  update public.report_versions
     set status = 'pending_approval', submitted_by = auth.uid(), submitted_at = now()
   where id = _version_id;
  update public.reports set status = 'pending_approval' where id = v.report_id;
  insert into public.report_audit_log(report_id, version_id, actor_id, action)
  values (v.report_id, _version_id, auth.uid(), 'submitted');
  return now();
end; $function$;

create or replace function public.approve_report(_version_id uuid, _note text default null)
returns timestamp with time zone language plpgsql security definer set search_path to 'public'
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

create or replace function public.create_report_version(_report_id uuid, _reason text default null)
returns uuid language plpgsql security definer set search_path to 'public'
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

-- 6) requester can open the report produced from their request -------------------------
create or replace function private.can_access_report(_user_id uuid, _report_id uuid, _action app_action default 'view'::app_action)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare r public.reports%rowtype; v_ok boolean := false; v_requester uuid;
begin
  if _user_id is null or _report_id is null then return false; end if;
  select * into r from public.reports where id = _report_id;
  if r.id is null then return false; end if;

  if private.is_entity_member(_user_id, r.entity_id) then
    v_ok := true;
  elsif private.can_access_project(_user_id, r.project_id) then
    v_ok := (r.status = 'approved' or r.current_version_id is not null);
    if _action <> 'view' then v_ok := false; end if;
  end if;

  if not v_ok and r.request_id is not null and _action = 'view' then
    select rq.requested_by into v_requester from public.requests rq where rq.id = r.request_id;
    if v_requester = _user_id then v_ok := true; end if;
  end if;

  if not v_ok then return false; end if;
  if _action = 'view' then return true; end if;

  return private.can(_user_id, 'reports'::public.app_module, _action, r.entity_id, r.project_id);
end; $function$;

-- 7) engineering report request --------------------------------------------------------
insert into public.request_types(code, module, name_ar, name_en, is_active, order_index, requires_stage, requires_unit)
values ('engineering_report', 'reports'::app_module, 'طلب تقرير هندسي', 'Engineering report request', true, 90, false, false)
on conflict (code) do update set name_ar = excluded.name_ar, is_active = true;

create or replace function public.list_project_engineering_offices(_project_id uuid)
returns table(entity_id uuid, name text, entity_type text, party_role text)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not private.can_access_project(auth.uid(), _project_id) then
    raise exception 'No access to this project' using errcode='42501';
  end if;
  return query
    select e.id, e.name, e.type, pp.party_role::text
      from public.project_parties pp
      join public.entities e on e.id = pp.party_entity_id
     where pp.project_id = _project_id
       and pp.status = 'accepted'
       and e.deleted_at is null
       and private.is_engineering_entity(e.id);
end; $function$;

create or replace function public.request_engineering_report(
  _project_id uuid, _to_entity_id uuid, _subject text, _body text default null,
  _stage_id uuid default null, _property_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_request uuid;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if not private.is_engineering_entity(_to_entity_id)
     or not private.entity_linked_to_project(_to_entity_id, _project_id) then
    raise exception 'TARGET_OFFICE_NOT_ELIGIBLE' using errcode='42501';
  end if;
  v_request := public.create_request(
    _project_id := _project_id,
    _request_type_code := 'engineering_report',
    _subject := _subject,
    _body := _body,
    _stage_id := _stage_id,
    _property_id := _property_id,
    _assigned_entity_id := _to_entity_id,
    _submit := true);
  return v_request;
end; $function$;

-- 8) grants ---------------------------------------------------------------------------
revoke all on function private.is_engineering_entity(uuid) from public;
revoke all on function private.entity_linked_to_project(uuid, uuid) from public;
revoke all on function private.engineering_report_block_reason(uuid, uuid, uuid) from public;
revoke all on function private.assert_can_issue_engineering_report(uuid, uuid, uuid) from public;
revoke all on function private.can_access_report(uuid, uuid, app_action) from public;
revoke all on function public.enforce_engineering_report_issuer() from public;
revoke all on function public.can_issue_engineering_report(uuid, uuid) from public;
revoke all on function public.list_project_engineering_offices(uuid) from public;
revoke all on function public.request_engineering_report(uuid, uuid, text, text, uuid, uuid) from public;
revoke all on function public.create_report(uuid, uuid, text, uuid, text, uuid, uuid, uuid, text, uuid) from public;

grant execute on function public.can_issue_engineering_report(uuid, uuid) to authenticated;
grant execute on function public.list_project_engineering_offices(uuid) to authenticated;
grant execute on function public.request_engineering_report(uuid, uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.create_report(uuid, uuid, text, uuid, text, uuid, uuid, uuid, text, uuid) to authenticated;
grant execute on function private.can_access_report(uuid, uuid, app_action) to authenticated;
grant execute on function private.is_engineering_entity(uuid) to authenticated;
grant execute on function private.entity_linked_to_project(uuid, uuid) to authenticated;
grant execute on function private.engineering_report_block_reason(uuid, uuid, uuid) to authenticated;
grant execute on function private.assert_can_issue_engineering_report(uuid, uuid, uuid) to authenticated;