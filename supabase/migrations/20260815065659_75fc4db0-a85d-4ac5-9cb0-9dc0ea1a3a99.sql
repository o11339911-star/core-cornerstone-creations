-- ============ 1) enum + categories ============
create type public.doc_visibility as enum
  ('entity_private','requester_private','party_limited','project_wide','public_approved');

create table public.document_categories (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  group_code text not null check (group_code in ('report','drawing','certificate','study','official','other')),
  allowed_mime text[] not null default '{}',
  max_size_mb integer not null default 25 check (max_size_mb between 1 and 500),
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.document_categories to authenticated;
grant all on public.document_categories to service_role;
alter table public.document_categories enable row level security;
create policy "categories readable by authenticated"
  on public.document_categories for select to authenticated using (true);

insert into public.document_categories (code,name_ar,name_en,group_code,allowed_mime,max_size_mb,order_index) values
 ('technical_report','تقرير فني','Technical report','report',array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],25,1),
 ('soil_study','دراسة تربة','Soil study','study',array['application/pdf','image/png','image/jpeg'],50,2),
 ('architectural_drawing','مخطط معماري','Architectural drawing','drawing',array['application/pdf','image/png','image/jpeg','image/vnd.dwg','image/vnd.dxf','application/acad'],100,3),
 ('structural_drawing','مخطط إنشائي','Structural drawing','drawing',array['application/pdf','image/png','image/jpeg','image/vnd.dwg','image/vnd.dxf','application/acad'],100,4),
 ('as_built','مخطط تنفيذي (As-Built)','As-built drawing','drawing',array['application/pdf','image/png','image/jpeg','image/vnd.dwg','image/vnd.dxf','application/acad'],100,5),
 ('safety_certificate','شهادة سلامة','Safety certificate','certificate',array['application/pdf','image/png','image/jpeg'],25,6),
 ('test_certificate','شهادة فحص','Test certificate','certificate',array['application/pdf','image/png','image/jpeg'],25,7),
 ('insurance_doc','وثيقة تأمين','Insurance document','official',array['application/pdf','image/png','image/jpeg'],25,8),
 ('official_letter','خطاب رسمي','Official letter','official',array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],25,9),
 ('other','أخرى','Other','other',array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation'],25,10);

-- ============ 2) documents ============
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_entity_id uuid not null references public.entities(id) on delete restrict,
  category_code text not null references public.document_categories(code),
  title text not null check (length(btrim(title)) > 0),
  description text,
  visibility public.doc_visibility not null default 'entity_private',
  status text not null default 'draft' check (status in ('draft','active','superseded','archived')),
  current_version_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  approval_note text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_owner_idx on public.documents(owner_entity_id);
create index documents_visibility_idx on public.documents(visibility);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_no integer not null,
  storage_bucket text not null default 'documents',
  storage_path text not null,
  file_ext text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','rejected')),
  scan_note text,
  supersede_reason text,
  source text not null default 'upload' check (source in ('upload','derived','external')),
  original_name_hint text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no),
  unique (document_id, checksum_sha256)
);
alter table public.documents
  add constraint documents_current_version_fkey
  foreign key (current_version_id) references public.document_versions(id) on delete set null;

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  context_type text not null check (context_type in ('project','property','property_unit','stage','contract','request')),
  context_id uuid not null,
  relation text not null default 'attachment' check (relation in ('attachment','reference','deliverable')),
  linked_by uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, context_type, context_id)
);
create index document_links_ctx_idx on public.document_links(context_type, context_id);

create table public.document_audience (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  audience_entity_id uuid references public.entities(id) on delete cascade,
  audience_user_id uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(audience_entity_id, audience_user_id) = 1)
);
create unique index document_audience_entity_uq on public.document_audience(document_id, audience_entity_id) where audience_entity_id is not null;
create unique index document_audience_user_uq on public.document_audience(document_id, audience_user_id) where audience_user_id is not null;

-- ============ 3) file validation + append-only + path ============
create or replace function public.document_version_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_cat public.document_categories%rowtype;
  v_doc public.documents%rowtype;
  v_ext text;
  v_ok_mime text;
begin
  select * into v_doc from public.documents where id = new.document_id;
  if v_doc.id is null then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  select * into v_cat from public.document_categories where code = v_doc.category_code;

  v_ext := lower(btrim(coalesce(new.file_ext,'')));
  v_ext := regexp_replace(v_ext, '^\.', '');
  if v_ext in ('exe','dll','bat','cmd','sh','ps1','js','jar','msi','scr','com','vbs','apk','app','iso','html','htm','svg','php','py','zip','rar') then
    raise exception 'File extension .% is not allowed', v_ext using errcode = '42501';
  end if;
  if v_ext not in ('pdf','png','jpg','jpeg','webp','dwg','dxf','docx','xlsx','pptx','txt','csv') then
    raise exception 'File extension .% is not in the allowed list', v_ext using errcode = '42501';
  end if;
  new.file_ext := v_ext;

  v_ok_mime := case v_ext
    when 'pdf' then 'application/pdf'
    when 'png' then 'image/png'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'webp' then 'image/webp'
    when 'txt' then 'text/plain'
    when 'csv' then 'text/csv'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    else null end;
  if v_ok_mime is not null and lower(new.mime_type) <> v_ok_mime then
    raise exception 'Declared MIME % does not match extension .%', new.mime_type, v_ext using errcode = '22023';
  end if;
  if v_ext in ('dwg','dxf') and lower(new.mime_type) not in
     ('image/vnd.dwg','image/vnd.dxf','application/acad','application/dxf','application/octet-stream') then
    raise exception 'Declared MIME % does not match extension .%', new.mime_type, v_ext using errcode = '22023';
  end if;

  if v_cat.code is not null then
    if array_length(v_cat.allowed_mime,1) is not null
       and not (lower(new.mime_type) = any (select lower(m) from unnest(v_cat.allowed_mime) m)) then
      raise exception 'MIME % is not allowed for category %', new.mime_type, v_cat.code using errcode = '22023';
    end if;
    if new.size_bytes > v_cat.max_size_mb::bigint * 1024 * 1024 then
      raise exception 'File exceeds the % MB limit for category %', v_cat.max_size_mb, v_cat.code using errcode = '22023';
    end if;
  end if;

  select coalesce(max(version_no),0) + 1 into new.version_no
  from public.document_versions where document_id = new.document_id;

  new.storage_bucket := 'documents';
  new.storage_path := v_doc.owner_entity_id::text || '/' || new.document_id::text || '/' || new.id::text || '.' || v_ext;
  return new;
end; $$;

create trigger document_versions_guard
  before insert on public.document_versions
  for each row execute function public.document_version_guard();

create or replace function public.document_version_path_check()
returns trigger language plpgsql set search_path = public as $$
declare v_owner uuid;
begin
  select owner_entity_id into v_owner from public.documents where id = new.document_id;
  if new.storage_path is distinct from
     (v_owner::text || '/' || new.document_id::text || '/' || new.id::text || '.' || new.file_ext) then
    raise exception 'Storage path must contain identifiers only' using errcode = '42501';
  end if;
  return new;
end; $$;

create constraint trigger document_versions_path_check
  after insert on public.document_versions
  deferrable initially immediate
  for each row execute function public.document_version_path_check();

create trigger document_versions_append_only
  before update or delete on public.document_versions
  for each row execute function public.prevent_row_mutation();

create or replace function public.sync_document_current_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.documents
    set current_version_id = new.id,
        status = case when status = 'draft' then 'active' else status end,
        updated_at = now()
    where id = new.document_id;
  return new;
end; $$;

create trigger document_versions_sync_current
  after insert on public.document_versions
  for each row execute function public.sync_document_current_version();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ============ 4) access helper ============
create or replace function private.can_access_document(_user_id uuid, _doc_id uuid, _action public.app_action default 'view')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  d public.documents%rowtype;
  v_ok boolean := false;
begin
  if _user_id is null then return false; end if;
  select * into d from public.documents where id = _doc_id;
  if d.id is null then return false; end if;

  if d.is_deleted then
    return private.is_entity_member(_user_id, d.owner_entity_id)
       and private.can(_user_id, 'documents'::public.app_module, 'soft_delete'::public.app_action, d.owner_entity_id, null);
  end if;

  if d.created_by = _user_id then
    v_ok := true;
  elsif d.visibility = 'entity_private' then
    v_ok := private.is_entity_member(_user_id, d.owner_entity_id);
  elsif d.visibility = 'requester_private' then
    v_ok := private.is_entity_member(_user_id, d.owner_entity_id)
            and private.can(_user_id, 'documents'::public.app_module, 'update'::public.app_action, d.owner_entity_id, null);
  elsif d.visibility = 'party_limited' then
    v_ok := exists (
      select 1 from public.document_audience a
      where a.document_id = d.id
        and (a.audience_user_id = _user_id
             or (a.audience_entity_id is not null and private.is_entity_member(_user_id, a.audience_entity_id))));
  elsif d.visibility = 'project_wide' then
    v_ok := exists (
      select 1 from public.document_links l
      where l.document_id = d.id
        and (
          (l.context_type = 'project' and private.can_access_project(_user_id, l.context_id))
          or (l.context_type = 'stage' and private.can_access_stage(_user_id, l.context_id, null))
          or (l.context_type = 'contract' and private.can_access_contract(_user_id, l.context_id))
          or (l.context_type = 'request' and private.can_access_request(_user_id, l.context_id))
          or (l.context_type = 'property' and private.can_access_property(_user_id, l.context_id))
          or (l.context_type = 'property_unit' and exists (
                select 1 from public.property_units u
                where u.id = l.context_id and private.can_access_property(_user_id, u.property_id)))
        ));
  elsif d.visibility = 'public_approved' then
    v_ok := d.approved_at is not null;
  end if;

  if not v_ok then
    -- entity managers of the owning entity always retain oversight
    v_ok := private.is_entity_member(_user_id, d.owner_entity_id)
            and private.can(_user_id, 'documents'::public.app_module, 'update'::public.app_action, d.owner_entity_id, null);
  end if;

  if not v_ok then return false; end if;

  if _action = 'view' then
    return true;
  end if;

  return private.can(_user_id, 'documents'::public.app_module, _action, d.owner_entity_id, null);
end; $$;

create or replace function private.can_manage_document(_user_id uuid, _doc_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.can_access_document(_user_id, _doc_id, 'update'::public.app_action);
$$;

-- ============ 5) RLS + grants ============
grant select on public.documents to authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "documents readable by allowed viewers"
  on public.documents for select to authenticated
  using (private.can_access_document(auth.uid(), id, 'view'::public.app_action));

grant select on public.document_versions to authenticated;
grant all on public.document_versions to service_role;
alter table public.document_versions enable row level security;
create policy "document versions readable with the document"
  on public.document_versions for select to authenticated
  using (private.can_access_document(auth.uid(), document_id, 'view'::public.app_action));

grant select on public.document_links to authenticated;
grant all on public.document_links to service_role;
alter table public.document_links enable row level security;
create policy "document links readable with the document"
  on public.document_links for select to authenticated
  using (private.can_access_document(auth.uid(), document_id, 'view'::public.app_action));

grant select on public.document_audience to authenticated;
grant all on public.document_audience to service_role;
alter table public.document_audience enable row level security;
create policy "document audience readable by managers"
  on public.document_audience for select to authenticated
  using (private.can_manage_document(auth.uid(), document_id));

-- ============ 6) storage policies ============
create or replace function private.doc_id_from_object(_name text)
returns uuid language plpgsql immutable set search_path = public as $$
declare parts text[];
begin
  parts := string_to_array(_name, '/');
  if array_length(parts,1) < 3 then return null; end if;
  begin
    return parts[2]::uuid;
  exception when others then
    return null;
  end;
end; $$;

create policy "documents bucket read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents'
     and private.can_access_document(auth.uid(), private.doc_id_from_object(name), 'view'::public.app_action));

create policy "documents bucket write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
     and private.can_manage_document(auth.uid(), private.doc_id_from_object(name)));

-- ============ 7) audit object types ============
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions',
    'contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience']));