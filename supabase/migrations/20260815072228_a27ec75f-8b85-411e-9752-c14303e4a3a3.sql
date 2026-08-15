-- ============ 0) enums ============
create type public.report_status as enum ('draft','pending_approval','approved','superseded');
create type public.report_version_status as enum ('draft','pending_approval','approved');

-- ============ 1) trusted entity sources ============
create table public.entity_profiles (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  legal_name_ar text,
  legal_name_en text,
  cr_number text,
  logo_path text,
  address_text text,
  contact_email text,
  contact_phone text,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.entity_profiles to authenticated;
grant all on public.entity_profiles to service_role;
alter table public.entity_profiles enable row level security;
create policy "entity profiles readable by members"
  on public.entity_profiles for select to authenticated
  using (private.is_entity_member(auth.uid(), entity_id));

create table public.entity_licenses (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  license_number text not null,
  authority text not null,
  discipline text,
  issued_on date,
  expires_on date,
  status text not null default 'active' check (status in ('active','revoked')),
  verified_at timestamptz,
  verified_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, license_number)
);
create index entity_licenses_entity_idx on public.entity_licenses(entity_id);
grant select on public.entity_licenses to authenticated;
grant all on public.entity_licenses to service_role;
alter table public.entity_licenses enable row level security;
create policy "entity licenses readable by members"
  on public.entity_licenses for select to authenticated
  using (private.is_entity_member(auth.uid(), entity_id));

-- seals: metadata visible to nobody but service_role; image lives under seals/ prefix
create table public.entity_seals (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  storage_bucket text not null default 'reports',
  storage_path text not null unique,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant all on public.entity_seals to service_role;
alter table public.entity_seals enable row level security;
-- no policy for authenticated/anon on purpose: seals are server-only

create or replace function public.entity_license_state(_entity_id uuid)
returns table (has_license boolean, is_valid boolean, license_number text, expires_on date, reason text)
language plpgsql stable security definer set search_path = public as $$
declare l public.entity_licenses%rowtype;
begin
  select * into l from public.entity_licenses
   where entity_id = _entity_id and status = 'active'
   order by (expires_on is null) desc, expires_on desc nulls last limit 1;
  if l.id is null then
    return query select false, false, null::text, null::date, 'NO_LICENSE'::text; return;
  end if;
  if l.verified_at is null then
    return query select true, false, l.license_number, l.expires_on, 'NOT_VERIFIED'::text; return;
  end if;
  if l.expires_on is not null and l.expires_on < current_date then
    return query select true, false, l.license_number, l.expires_on, 'EXPIRED'::text; return;
  end if;
  return query select true, true, l.license_number, l.expires_on, 'VALID'::text;
end; $$;
revoke all on function public.entity_license_state(uuid) from public, anon;
grant execute on function public.entity_license_state(uuid) to authenticated, service_role;

-- ============ 2) templates ============
create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('rakeez','entity')),
  entity_id uuid references public.entities(id) on delete cascade,
  code text,
  name_ar text not null,
  name_en text not null,
  language text not null default 'ar' check (language in ('ar','en')),
  direction text not null default 'rtl' check (direction in ('rtl','ltr')),
  page_setup jsonb not null default '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb,
  content jsonb not null default '{"blocks":[]}'::jsonb,
  source text not null default 'editor' check (source in ('builtin','editor')),
  status text not null default 'active' check (status in ('draft','active','archived')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_templates_scope_ck check (
    (owner_scope = 'rakeez' and entity_id is null) or (owner_scope = 'entity' and entity_id is not null)
  )
);
create unique index report_templates_rakeez_code_uq on public.report_templates(code) where owner_scope = 'rakeez';
create index report_templates_entity_idx on public.report_templates(entity_id);
grant select on public.report_templates to authenticated;
grant all on public.report_templates to service_role;
alter table public.report_templates enable row level security;
create policy "templates readable: rakeez library or own entity"
  on public.report_templates for select to authenticated
  using (
    (owner_scope = 'rakeez' and status = 'active')
    or (entity_id is not null and private.is_entity_member(auth.uid(), entity_id))
  );

-- ============ 3) reports + versions ============
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  visit_id uuid references public.site_visits(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  template_id uuid references public.report_templates(id) on delete set null,
  report_number text not null,
  title text not null check (length(btrim(title)) > 0),
  language text not null default 'ar' check (language in ('ar','en')),
  direction text not null default 'rtl' check (direction in ('rtl','ltr')),
  status public.report_status not null default 'draft',
  current_version_id uuid,
  is_certified boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, report_number)
);
create index reports_project_idx on public.reports(project_id);
create index reports_entity_idx on public.reports(entity_id);

create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  version_no integer not null,
  content jsonb not null default '{"blocks":[]}'::jsonb,
  snapshot jsonb,
  page_setup jsonb not null default '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb,
  checksum_sha256 text,
  status public.report_version_status not null default 'draft',
  stamp_applied boolean not null default false,
  verify_token text not null unique default encode(gen_random_bytes(16),'hex'),
  export_pdf_path text,
  export_docx_path text,
  exported_at timestamptz,
  created_by uuid not null,
  last_edited_by uuid,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, version_no)
);
alter table public.reports
  add constraint reports_current_version_fkey
  foreign key (current_version_id) references public.report_versions(id) on delete set null;

create table public.report_assets (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  version_id uuid references public.report_versions(id) on delete set null,
  storage_bucket text not null default 'reports',
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  caption text,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);
create index report_assets_report_idx on public.report_assets(report_id);

create table public.report_audit_log (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  version_id uuid,
  actor_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index report_audit_report_idx on public.report_audit_log(report_id);
grant all on public.report_audit_log to service_role;
alter table public.report_audit_log enable row level security;

create table public.report_number_counters (
  entity_id uuid not null references public.entities(id) on delete cascade,
  year integer not null,
  last_no integer not null default 0,
  primary key (entity_id, year)
);
grant all on public.report_number_counters to service_role;
alter table public.report_number_counters enable row level security;

-- ============ 4) append-only guards ============
create or replace function public.report_version_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Report versions are append-only' using errcode = '42501';
  end if;
  if old.status = 'approved' then
    if new.content is distinct from old.content
       or new.snapshot is distinct from old.snapshot
       or new.page_setup is distinct from old.page_setup
       or new.checksum_sha256 is distinct from old.checksum_sha256
       or new.status is distinct from old.status
       or new.version_no is distinct from old.version_no
       or new.report_id is distinct from old.report_id
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.stamp_applied is distinct from old.stamp_applied
       or new.verify_token is distinct from old.verify_token
       or new.created_by is distinct from old.created_by then
      raise exception 'Approved report version is locked (create a new version instead)' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger report_versions_guard
  before update or delete on public.report_versions
  for each row execute function public.report_version_guard();

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create trigger report_templates_set_updated_at
  before update on public.report_templates
  for each row execute function public.set_updated_at();

-- ============ 5) access engine ============
create or replace function private.can_access_report(_user_id uuid, _report_id uuid, _action public.app_action default 'view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r public.reports%rowtype; v_ok boolean := false;
begin
  if _user_id is null or _report_id is null then return false; end if;
  select * into r from public.reports where id = _report_id;
  if r.id is null then return false; end if;

  if private.is_entity_member(_user_id, r.entity_id) then
    v_ok := true;
  elsif private.can_access_project(_user_id, r.project_id) then
    -- other project parties may only see approved content
    v_ok := (r.status = 'approved' or r.current_version_id is not null);
    if _action <> 'view' then v_ok := false; end if;
  end if;

  if not v_ok then return false; end if;
  if _action = 'view' then return true; end if;

  return private.can(_user_id, 'reports'::public.app_module, _action, r.entity_id, r.project_id);
end; $$;
revoke all on function private.can_access_report(uuid, uuid, public.app_action) from public, anon;
grant execute on function private.can_access_report(uuid, uuid, public.app_action) to authenticated, service_role;

create or replace function public.can_access_report_version(_version_id uuid, _action public.app_action default 'view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_report uuid;
begin
  select report_id into v_report from public.report_versions where id = _version_id;
  if v_report is null then return false; end if;
  return private.can_access_report(auth.uid(), v_report, _action);
end; $$;
revoke all on function public.can_access_report_version(uuid, public.app_action) from public, anon;
grant execute on function public.can_access_report_version(uuid, public.app_action) to authenticated, service_role;

-- ============ 6) RLS ============
grant select on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "reports readable by allowed viewers"
  on public.reports for select to authenticated
  using (private.can_access_report(auth.uid(), id, 'view'::public.app_action));

grant select on public.report_versions to authenticated;
grant all on public.report_versions to service_role;
alter table public.report_versions enable row level security;
create policy "report versions readable with the report"
  on public.report_versions for select to authenticated
  using (private.can_access_report(auth.uid(), report_id, 'view'::public.app_action));

grant select on public.report_assets to authenticated;
grant all on public.report_assets to service_role;
alter table public.report_assets enable row level security;
create policy "report assets readable with the report"
  on public.report_assets for select to authenticated
  using (private.can_access_report(auth.uid(), report_id, 'view'::public.app_action));

-- ============ 7) snapshot builder ============
create or replace function private.build_report_snapshot(_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
    'owners', coalesce((select jsonb_agg(jsonb_build_object('owner_name', po.owner_name, 'share_percent', po.share_percent))
                from public.property_owners po where po.property_id = r.property_id), '[]'::jsonb),
    'parties', coalesce((select jsonb_agg(jsonb_build_object('role', pp.party_role, 'entity_name', e2.name))
                from public.project_parties pp join public.entities e2 on e2.id = pp.party_entity_id
                where pp.project_id = r.project_id and pp.status = 'accepted'), '[]'::jsonb),
    'contract', (select jsonb_build_object('contract_number', c.contract_number, 'title', c.title, 'contract_type', c.contract_type)
                 from public.contracts c where c.project_id = r.project_id and c.deleted_at is null
                 order by c.created_at limit 1)
  );
  return snap;
end; $$;
revoke all on function private.build_report_snapshot(uuid) from public, anon;
grant execute on function private.build_report_snapshot(uuid) to authenticated, service_role;

-- ============ 8) lifecycle functions ============
create or replace function public.create_report(
  _entity_id uuid, _project_id uuid, _title text, _template_id uuid default null,
  _language text default 'ar', _stage_id uuid default null, _visit_id uuid default null,
  _property_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_report_id uuid; v_no integer; v_year integer := extract(year from now())::int;
        v_number text; v_content jsonb := '{"blocks":[]}'::jsonb; v_page jsonb;
        t public.report_templates%rowtype; v_dir text;
begin
  if auth.uid() is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  if not private.is_entity_member(auth.uid(), _entity_id) then
    raise exception 'Not a member of this entity' using errcode='42501';
  end if;
  if not private.can(auth.uid(), 'reports'::app_module, 'create'::app_action, _entity_id, _project_id) then
    raise exception 'Not allowed to create reports' using errcode='42501';
  end if;
  if not private.can_access_project(auth.uid(), _project_id) then
    raise exception 'No access to this project' using errcode='42501';
  end if;
  if _language not in ('ar','en') then raise exception 'Invalid language' using errcode='22023'; end if;
  v_dir := case when _language = 'ar' then 'rtl' else 'ltr' end;

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
    report_number, title, language, direction, status, created_by)
  values (_entity_id, _project_id, _stage_id, _visit_id, _property_id, _template_id,
    v_number, _title, _language, v_dir, 'draft', auth.uid())
  returning id into v_report_id;

  insert into public.report_versions(report_id, version_no, content, page_setup, snapshot, created_by, last_edited_by)
  values (v_report_id, 1, v_content, coalesce(v_page, '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb),
    private.build_report_snapshot(v_report_id), auth.uid(), auth.uid());

  update public.reports set current_version_id = (select id from public.report_versions where report_id = v_report_id and version_no = 1)
   where id = v_report_id;

  insert into public.report_audit_log(report_id, actor_id, action, detail)
  values (v_report_id, auth.uid(), 'created', jsonb_build_object('report_number', v_number, 'template_id', _template_id));
  return v_report_id;
end; $$;
revoke all on function public.create_report(uuid,uuid,text,uuid,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.create_report(uuid,uuid,text,uuid,text,uuid,uuid,uuid) to authenticated, service_role;

create or replace function public.save_report_draft(_version_id uuid, _content jsonb, _page_setup jsonb default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v public.report_versions%rowtype;
begin
  select * into v from public.report_versions where id = _version_id;
  if v.id is null then raise exception 'Version not found' using errcode='22023'; end if;
  if v.status = 'approved' then raise exception 'Approved version is locked' using errcode='42501'; end if;
  if not private.can_access_report(auth.uid(), v.report_id, 'update'::app_action) then
    raise exception 'Not allowed to edit this report' using errcode='42501';
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
end; $$;
revoke all on function public.save_report_draft(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.save_report_draft(uuid,jsonb,jsonb) to authenticated, service_role;

create or replace function public.submit_report_version(_version_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v public.report_versions%rowtype;
begin
  select * into v from public.report_versions where id = _version_id;
  if v.id is null then raise exception 'Version not found' using errcode='22023'; end if;
  if v.status <> 'draft' then raise exception 'Only drafts can be submitted' using errcode='22023'; end if;
  if not private.can_access_report(auth.uid(), v.report_id, 'update'::app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  update public.report_versions
     set status = 'pending_approval', submitted_by = auth.uid(), submitted_at = now()
   where id = _version_id;
  update public.reports set status = 'pending_approval' where id = v.report_id;
  insert into public.report_audit_log(report_id, version_id, actor_id, action)
  values (v.report_id, _version_id, auth.uid(), 'submitted');
  return now();
end; $$;
revoke all on function public.submit_report_version(uuid) from public, anon;
grant execute on function public.submit_report_version(uuid) to authenticated, service_role;

create or replace function public.approve_report(_version_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
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
  v_checksum := encode(digest(convert_to(v.content::text, 'UTF8'), 'sha256'), 'hex');

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
end; $$;
revoke all on function public.approve_report(uuid,text) from public, anon;
grant execute on function public.approve_report(uuid,text) to authenticated, service_role;

create or replace function public.create_report_version(_report_id uuid, _reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.reports%rowtype; src public.report_versions%rowtype; v_new uuid; v_no integer;
begin
  select * into r from public.reports where id = _report_id;
  if r.id is null then raise exception 'Report not found' using errcode='22023'; end if;
  if not private.can_access_report(auth.uid(), _report_id, 'update'::app_action) then
    raise exception 'Not allowed' using errcode='42501';
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
end; $$;
revoke all on function public.create_report_version(uuid,text) from public, anon;
grant execute on function public.create_report_version(uuid,text) to authenticated, service_role;

create or replace function public.record_report_export(_version_id uuid, _kind text, _path text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.report_versions%rowtype;
begin
  if _kind not in ('pdf','docx') then raise exception 'Invalid export kind' using errcode='22023'; end if;
  select * into v from public.report_versions where id = _version_id;
  if v.id is null then raise exception 'Version not found' using errcode='22023'; end if;
  if not private.can_access_report(auth.uid(), v.report_id, 'export'::app_action) then
    raise exception 'Not allowed to export' using errcode='42501';
  end if;
  if _kind = 'pdf' then
    update public.report_versions set export_pdf_path = _path, exported_at = now() where id = _version_id;
  else
    update public.report_versions set export_docx_path = _path, exported_at = now() where id = _version_id;
  end if;
  insert into public.report_audit_log(report_id, version_id, actor_id, action, detail)
  values (v.report_id, _version_id, auth.uid(), 'exported', jsonb_build_object('kind', _kind));
  return true;
end; $$;
revoke all on function public.record_report_export(uuid,text,text) from public, anon;
grant execute on function public.record_report_export(uuid,text,text) to authenticated, service_role;

create or replace function public.create_entity_report_template(
  _entity_id uuid, _name_ar text, _name_en text, _language text, _content jsonb, _page_setup jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not private.is_entity_member(auth.uid(), _entity_id)
     or not private.can(auth.uid(), 'reports'::app_module, 'create'::app_action, _entity_id, null) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  insert into public.report_templates(owner_scope, entity_id, name_ar, name_en, language, direction,
    content, page_setup, source, status, created_by)
  values ('entity', _entity_id, _name_ar, _name_en, coalesce(_language,'ar'),
    case when coalesce(_language,'ar') = 'ar' then 'rtl' else 'ltr' end,
    coalesce(_content, '{"blocks":[]}'::jsonb),
    coalesce(_page_setup, '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb),
    'editor', 'active', auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_entity_report_template(uuid,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.create_entity_report_template(uuid,text,text,text,jsonb,jsonb) to authenticated, service_role;

-- ============ 9) public verification (minimal disclosure) ============
create or replace function public.verify_report(_token text)
returns table (report_number text, status text, approved_at timestamptz, entity_name text)
language sql stable security definer set search_path = public as $$
  select r.report_number,
         case when v.status = 'approved' then 'approved' else 'not_approved' end,
         v.approved_at,
         e.name
    from public.report_versions v
    join public.reports r on r.id = v.report_id
    join public.entities e on e.id = r.entity_id
   where v.verify_token = _token
   limit 1;
$$;
revoke all on function public.verify_report(text) from public;
grant execute on function public.verify_report(text) to anon, authenticated, service_role;

-- ============ 10) storage policies ============
create or replace function private.report_id_from_object(_name text)
returns uuid language plpgsql immutable set search_path = public as $$
declare parts text[];
begin
  parts := string_to_array(_name, '/');
  if array_length(parts,1) < 4 then return null; end if;
  if parts[1] not in ('exports','assets') then return null; end if;
  begin
    return parts[3]::uuid;
  exception when others then return null; end;
end; $$;

create policy "reports bucket read"
  on storage.objects for select to authenticated
  using (bucket_id = 'reports'
     and private.report_id_from_object(name) is not null
     and private.can_access_report(auth.uid(), private.report_id_from_object(name), 'view'::public.app_action));

create policy "reports bucket write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'reports'
     and private.report_id_from_object(name) is not null
     and private.can_access_report(auth.uid(), private.report_id_from_object(name), 'update'::public.app_action));

-- ============ 11) audit object types ============
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions',
    'contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience','reports','report_versions','report_templates','report_assets']));

-- ============ 12) built-in Rakeez templates ============
insert into public.report_templates (owner_scope, entity_id, code, name_ar, name_en, language, direction, source, status, content)
values
('rakeez', null, 'site_inspection_ar', 'تقرير فحص موقع (ركيز)', 'Site inspection report (Rakeez)', 'ar', 'rtl', 'builtin', 'active',
 '{"blocks":[
   {"id":"b1","type":"heading","level":1,"text":"تقرير فحص موقع","align":"center"},
   {"id":"b2","type":"field","source":"entity.name","label":"جهة الإصدار"},
   {"id":"b3","type":"field","source":"project.name","label":"المشروع"},
   {"id":"b4","type":"field","source":"property.plan_no","label":"رقم المخطط"},
   {"id":"b5","type":"heading","level":2,"text":"نطاق الفحص"},
   {"id":"b6","type":"paragraph","text":"يوضح هذا التقرير نتائج الفحص الميداني للمرحلة المحددة."},
   {"id":"b7","type":"engineering_item","title":"مطابقة الأعمال للمواصفات","compliance":"compliant","severity":"low","responsible":"","dueDate":null,"note":""},
   {"id":"b8","type":"heading","level":2,"text":"الملاحظات"},
   {"id":"b9","type":"list","ordered":false,"items":["ملاحظة أولى"]},
   {"id":"b10","type":"heading","level":2,"text":"التعهد والاعتماد"},
   {"id":"b11","type":"paragraph","text":"نتعهد بصحة البيانات الواردة في هذا التقرير."}
 ]}'::jsonb),
('rakeez', null, 'site_inspection_en', 'تقرير فحص موقع - إنجليزي (ركيز)', 'Site inspection report (Rakeez, EN)', 'en', 'ltr', 'builtin', 'active',
 '{"blocks":[
   {"id":"b1","type":"heading","level":1,"text":"Site Inspection Report","align":"center"},
   {"id":"b2","type":"field","source":"entity.name","label":"Issuing office"},
   {"id":"b3","type":"field","source":"project.name","label":"Project"},
   {"id":"b4","type":"field","source":"property.plan_no","label":"Plan no."},
   {"id":"b5","type":"heading","level":2,"text":"Scope of inspection"},
   {"id":"b6","type":"paragraph","text":"This report presents the findings of the field inspection for the selected stage."},
   {"id":"b7","type":"engineering_item","title":"Works comply with specifications","compliance":"compliant","severity":"low","responsible":"","dueDate":null,"note":""},
   {"id":"b8","type":"heading","level":2,"text":"Observations"},
   {"id":"b9","type":"list","ordered":false,"items":["First observation"]},
   {"id":"b10","type":"heading","level":2,"text":"Declaration and approval"},
   {"id":"b11","type":"paragraph","text":"We certify the accuracy of the information contained in this report."}
 ]}'::jsonb);