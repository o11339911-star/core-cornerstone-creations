
-- =====================================================================
-- Rakeez — Drawings (CAD) module
-- =====================================================================

insert into public.document_categories(code, name_ar, name_en, group_code, allowed_mime, max_size_mb, order_index)
values ('cad_drawing', 'مخطط هندسي (CAD)', 'Engineering drawing (CAD)', 'drawing', '{}'::text[], 200, 50)
on conflict (code) do nothing;

create table if not exists public.drawing_module_settings (
  id boolean primary key default true,
  aps_enabled boolean not null default false,
  aps_client_id_env text not null default 'APS_CLIENT_ID',
  aps_client_secret_env text not null default 'APS_CLIENT_SECRET',
  updated_at timestamptz not null default now(),
  constraint drawing_module_settings_singleton check (id)
);
insert into public.drawing_module_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.drawing_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);
insert into public.drawing_status_transitions(from_status, to_status) values
  ('draft','under_review'),
  ('under_review','returned'),
  ('under_review','approved'),
  ('returned','under_review'),
  ('approved','issued_for_construction'),
  ('approved','superseded'),
  ('issued_for_construction','as_built'),
  ('issued_for_construction','superseded'),
  ('as_built','superseded')
on conflict do nothing;

create table if not exists public.drawing_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  owner_entity_id uuid not null references public.entities(id) on delete restrict,
  document_id uuid not null unique references public.documents(id) on delete restrict,
  drawing_no text not null,
  discipline text not null check (discipline in ('architectural','structural','mechanical','electrical','plumbing','civil','landscape','survey','other')),
  sheet_no text,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','under_review','returned','approved','issued_for_construction','as_built','superseded')),
  superseded_by uuid references public.drawing_records(id),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, drawing_no)
);
create index if not exists drawing_records_project_idx on public.drawing_records(project_id);

create table if not exists public.drawing_version_meta (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawing_records(id) on delete restrict,
  document_version_id uuid not null unique references public.document_versions(id) on delete restrict,
  revision_label text not null,
  format text not null check (format in ('pdf','dwg','dxf','ifc','zip')),
  sheet_count integer,
  scan_notes jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (drawing_id, revision_label)
);
create index if not exists drawing_version_meta_drawing_idx on public.drawing_version_meta(drawing_id);

create table if not exists public.drawing_status_events (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawing_records(id) on delete restrict,
  from_status text,
  to_status text not null,
  note text,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists drawing_status_events_drawing_idx on public.drawing_status_events(drawing_id);

create table if not exists public.drawing_conversion_jobs (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawing_records(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  provider text not null default 'aps' check (provider in ('aps','native_pdf','local')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','disabled')),
  idempotency_key text not null unique,
  attempts integer not null default 0,
  error_code text,
  error_message text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drawing_conversion_jobs_drawing_idx on public.drawing_conversion_jobs(drawing_id);

create table if not exists public.drawing_markups (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawing_records(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  page_no integer not null default 1 check (page_no >= 1),
  anchor jsonb not null default '{}'::jsonb,
  body text not null,
  request_id uuid references public.requests(id),
  resolved_at timestamptz,
  resolved_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists drawing_markups_drawing_idx on public.drawing_markups(drawing_id);

create table if not exists public.drawing_viewer_state (
  drawing_id uuid not null references public.drawing_records(id) on delete cascade,
  user_id uuid not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (drawing_id, user_id)
);

create trigger drawing_version_meta_append_only
  before update or delete on public.drawing_version_meta
  for each row execute function public.prevent_row_mutation();
create trigger drawing_status_events_append_only
  before update or delete on public.drawing_status_events
  for each row execute function public.prevent_row_mutation();

-- =====================================================================
-- Extend document version guard to route CAD originals
-- =====================================================================
create or replace function public.document_version_guard()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_cat public.document_categories%rowtype;
  v_doc public.documents%rowtype;
  v_ext text;
  v_ok_mime text;
  v_is_cad boolean;
  v_project uuid;
begin
  select * into v_doc from public.documents where id = new.document_id;
  if v_doc.id is null then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  select * into v_cat from public.document_categories where code = v_doc.category_code;
  v_is_cad := (v_doc.category_code = 'cad_drawing');

  v_ext := lower(btrim(coalesce(new.file_ext,'')));
  v_ext := regexp_replace(v_ext, '^\.', '');

  if v_is_cad then
    if v_ext not in ('pdf','dwg','dxf','ifc','zip') then
      raise exception 'File extension .% is not allowed for CAD drawings', v_ext using errcode = '42501';
    end if;
    select project_id into v_project from public.drawing_records where document_id = new.document_id;
    if v_project is null then
      raise exception 'CAD document is not linked to a drawing record' using errcode = '22023';
    end if;
  else
    if v_ext in ('exe','dll','bat','cmd','sh','ps1','js','jar','msi','scr','com','vbs','apk','app','iso','html','htm','svg','php','py','zip','rar') then
      raise exception 'File extension .% is not allowed', v_ext using errcode = '42501';
    end if;
    if v_ext not in ('pdf','png','jpg','jpeg','webp','dwg','dxf','docx','xlsx','pptx','txt','csv') then
      raise exception 'File extension .% is not in the allowed list', v_ext using errcode = '42501';
    end if;
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
  if v_ext in ('ifc','zip') and lower(new.mime_type) not in
     ('application/octet-stream','application/zip','application/x-step','model/ifc') then
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

  if v_is_cad then
    new.storage_bucket := 'cad-originals';
    new.storage_path := v_doc.owner_entity_id::text || '/' || v_project::text || '/' ||
                        new.document_id::text || '/' || new.id::text || '.' || v_ext;
  else
    new.storage_bucket := 'documents';
    new.storage_path := v_doc.owner_entity_id::text || '/' || new.document_id::text || '/' || new.id::text || '.' || v_ext;
  end if;
  return new;
end; $function$;

create or replace function public.document_version_path_check()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_cat text;
  v_project uuid;
  v_expected text;
begin
  select owner_entity_id, category_code into v_owner, v_cat from public.documents where id = new.document_id;
  if v_cat = 'cad_drawing' then
    select project_id into v_project from public.drawing_records where document_id = new.document_id;
    v_expected := v_owner::text || '/' || v_project::text || '/' || new.document_id::text || '/' || new.id::text || '.' || new.file_ext;
  else
    v_expected := v_owner::text || '/' || new.document_id::text || '/' || new.id::text || '.' || new.file_ext;
  end if;
  if new.storage_path is distinct from v_expected then
    raise exception 'Storage path must contain identifiers only' using errcode = '42501';
  end if;
  return new;
end; $function$;

-- =====================================================================
-- Permissions matrix
-- =====================================================================
insert into public.role_permissions(role, module, action) values
  ('owner','drawings','view'),('owner','drawings','create'),('owner','drawings','update'),('owner','drawings','approve'),('owner','drawings','export'),
  ('admin','drawings','view'),('admin','drawings','create'),('admin','drawings','update'),('admin','drawings','approve'),('admin','drawings','export'),
  ('manager','drawings','view'),('manager','drawings','create'),('manager','drawings','update'),('manager','drawings','approve'),('manager','drawings','export'),
  ('member','drawings','view'),('member','drawings','create'),('member','drawings','update'),
  ('viewer','drawings','view')
on conflict do nothing;

-- =====================================================================
-- Private helpers
-- =====================================================================
create or replace function private.drawing_scope(_drawing_id uuid)
returns table(project_id uuid, owner_entity_id uuid, document_id uuid, status text)
language sql stable security definer set search_path to 'public'
as $$
  select d.project_id, d.owner_entity_id, d.document_id, d.status
  from public.drawing_records d where d.id = _drawing_id;
$$;

create or replace function private.can_drawing(_user_id uuid, _drawing_id uuid, _action public.app_action)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.drawing_records d
    where d.id = _drawing_id
      and private.can(_user_id, 'drawings'::public.app_module, _action, d.owner_entity_id, d.project_id)
  );
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.drawing_records enable row level security;
alter table public.drawing_version_meta enable row level security;
alter table public.drawing_status_events enable row level security;
alter table public.drawing_conversion_jobs enable row level security;
alter table public.drawing_markups enable row level security;
alter table public.drawing_viewer_state enable row level security;
alter table public.drawing_status_transitions enable row level security;
alter table public.drawing_module_settings enable row level security;

create policy drawing_records_read on public.drawing_records for select to authenticated
  using (private.can(auth.uid(), 'drawings'::public.app_module, 'view'::public.app_action, owner_entity_id, project_id));

create policy drawing_version_meta_read on public.drawing_version_meta for select to authenticated
  using (private.can_drawing(auth.uid(), drawing_id, 'view'::public.app_action));

create policy drawing_status_events_read on public.drawing_status_events for select to authenticated
  using (private.can_drawing(auth.uid(), drawing_id, 'view'::public.app_action));

create policy drawing_conversion_jobs_read on public.drawing_conversion_jobs for select to authenticated
  using (private.can_drawing(auth.uid(), drawing_id, 'view'::public.app_action));

create policy drawing_markups_read on public.drawing_markups for select to authenticated
  using (private.can_drawing(auth.uid(), drawing_id, 'view'::public.app_action));

create policy drawing_viewer_state_own on public.drawing_viewer_state for select to authenticated
  using (user_id = auth.uid());

create policy drawing_status_transitions_read on public.drawing_status_transitions for select to authenticated using (true);
create policy drawing_module_settings_read on public.drawing_module_settings for select to authenticated using (true);

-- =====================================================================
-- Storage policies for cad-originals
-- path = {entity_id}/{project_id}/{document_id}/{version_id}.{ext}
-- =====================================================================
create policy cad_originals_read on storage.objects for select to authenticated
  using (
    bucket_id = 'cad-originals'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and private.can(auth.uid(), 'drawings'::public.app_module, 'view'::public.app_action,
                    ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
  );

create policy cad_originals_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cad-originals'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and private.can(auth.uid(), 'drawings'::public.app_module, 'create'::public.app_action,
                    ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
  );

-- =====================================================================
-- RPC implementations (SECURITY DEFINER in private)
-- =====================================================================
create or replace function private.create_drawing_impl(
  _project_id uuid, _owner_entity_id uuid, _drawing_no text, _discipline text,
  _title text, _sheet_no text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_doc uuid;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.can(v_actor, 'drawings'::public.app_module, 'create'::public.app_action, _owner_entity_id, _project_id) then
    raise exception 'Not allowed to create drawings for this project' using errcode='42501';
  end if;
  if coalesce(btrim(_drawing_no),'') = '' or coalesce(btrim(_title),'') = '' then
    raise exception 'Drawing number and title are required' using errcode='22023';
  end if;

  insert into public.documents(owner_entity_id, category_code, title, description, visibility, created_by)
  values (_owner_entity_id, 'cad_drawing', btrim(_title), null, 'project_wide'::public.doc_visibility, v_actor)
  returning id into v_doc;

  insert into public.drawing_records(project_id, owner_entity_id, document_id, drawing_no, discipline, sheet_no, title, created_by)
  values (_project_id, _owner_entity_id, v_doc, btrim(_drawing_no), _discipline, nullif(btrim(coalesce(_sheet_no,'')),''), btrim(_title), v_actor)
  returning id into v_id;

  insert into public.drawing_status_events(drawing_id, from_status, to_status, note, actor_id)
  values (v_id, null, 'draft', null, v_actor);

  return v_id;
end; $$;

create or replace function private.add_drawing_version_impl(
  _drawing_id uuid, _file_ext text, _mime_type text, _size_bytes bigint,
  _checksum_sha256 text, _revision_label text, _supersede_reason text)
returns table(version_id uuid, storage_bucket text, storage_path text, version_no integer)
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_d public.drawing_records%rowtype;
  v_row public.document_versions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_d from public.drawing_records where id = _drawing_id for update;
  if v_d.id is null then raise exception 'Drawing not found' using errcode='22023'; end if;
  if not private.can(v_actor, 'drawings'::public.app_module, 'update'::public.app_action, v_d.owner_entity_id, v_d.project_id) then
    raise exception 'Not allowed to upload drawing versions' using errcode='42501';
  end if;
  if v_d.status = 'superseded' then
    raise exception 'A superseded drawing cannot receive new versions' using errcode='22023';
  end if;
  if exists (select 1 from public.drawing_version_meta where drawing_id = _drawing_id)
     and coalesce(btrim(_supersede_reason),'') = '' then
    raise exception 'A reason is required when superseding an existing revision' using errcode='22023';
  end if;

  insert into public.document_versions(document_id, file_ext, mime_type, size_bytes, checksum_sha256,
                                       supersede_reason, source, storage_path, created_by)
  values (v_d.document_id, _file_ext, _mime_type, _size_bytes, lower(_checksum_sha256),
          nullif(btrim(coalesce(_supersede_reason,'')),''), 'upload', 'pending', v_actor)
  returning * into v_row;

  insert into public.drawing_version_meta(drawing_id, document_version_id, revision_label, format, created_by)
  values (_drawing_id, v_row.id, btrim(_revision_label), lower(regexp_replace(btrim(_file_ext),'^\.','')), v_actor);

  update public.drawing_records set updated_at = now() where id = _drawing_id;

  return query select v_row.id, v_row.storage_bucket, v_row.storage_path, v_row.version_no;
end; $$;

create or replace function private.set_drawing_status_impl(_drawing_id uuid, _to_status text, _note text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_d public.drawing_records%rowtype;
  v_action public.app_action;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_d from public.drawing_records where id = _drawing_id for update;
  if v_d.id is null then raise exception 'Drawing not found' using errcode='22023'; end if;
  if not exists (select 1 from public.drawing_status_transitions
                 where from_status = v_d.status and to_status = _to_status) then
    raise exception 'Transition from % to % is not allowed', v_d.status, _to_status using errcode='22023';
  end if;

  v_action := case when _to_status in ('approved','issued_for_construction','returned','as_built')
                   then 'approve'::public.app_action else 'update'::public.app_action end;
  if not private.can(v_actor, 'drawings'::public.app_module, v_action, v_d.owner_entity_id, v_d.project_id) then
    raise exception 'Not allowed to change drawing status' using errcode='42501';
  end if;
  if _to_status in ('approved','returned') then
    if exists (select 1 from public.drawing_version_meta m
               where m.drawing_id = _drawing_id
                 and m.created_by = v_actor
                 and m.created_at = (select max(x.created_at) from public.drawing_version_meta x where x.drawing_id = _drawing_id)) then
      raise exception 'The reviewer cannot be the uploader of the current revision' using errcode='42501';
    end if;
  end if;
  if _to_status = 'returned' and coalesce(btrim(_note),'') = '' then
    raise exception 'A note is required when returning a drawing' using errcode='22023';
  end if;

  update public.drawing_records set status = _to_status, updated_at = now() where id = _drawing_id;
  insert into public.drawing_status_events(drawing_id, from_status, to_status, note, actor_id)
  values (_drawing_id, v_d.status, _to_status, nullif(btrim(coalesce(_note,'')),''), v_actor);
end; $$;

create or replace function private.enqueue_drawing_conversion_impl(_document_version_id uuid)
returns table(job_id uuid, status text, provider text)
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_meta public.drawing_version_meta%rowtype;
  v_d public.drawing_records%rowtype;
  v_provider text;
  v_status text;
  v_key text;
  v_job public.drawing_conversion_jobs%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_meta from public.drawing_version_meta where document_version_id = _document_version_id;
  if v_meta.id is null then raise exception 'Drawing revision not found' using errcode='22023'; end if;
  select * into v_d from public.drawing_records where id = v_meta.drawing_id;
  if not private.can(v_actor, 'drawings'::public.app_module, 'update'::public.app_action, v_d.owner_entity_id, v_d.project_id) then
    raise exception 'Not allowed to request conversion' using errcode='42501';
  end if;

  v_provider := case when v_meta.format = 'pdf' then 'native_pdf' else 'aps' end;
  v_status := case
    when v_provider = 'native_pdf' then 'succeeded'
    when (select s.aps_enabled from public.drawing_module_settings s where s.id) then 'queued'
    else 'disabled' end;
  v_key := v_provider || ':' || _document_version_id::text;

  insert into public.drawing_conversion_jobs(drawing_id, document_version_id, provider, status, idempotency_key, created_by)
  values (v_meta.drawing_id, _document_version_id, v_provider, v_status, v_key, v_actor)
  on conflict (idempotency_key) do update set updated_at = now()
  returning * into v_job;

  return query select v_job.id, v_job.status, v_job.provider;
end; $$;

create or replace function private.add_drawing_markup_impl(
  _drawing_id uuid, _document_version_id uuid, _page_no integer, _anchor jsonb, _body text)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_d public.drawing_records%rowtype;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_d from public.drawing_records where id = _drawing_id;
  if v_d.id is null then raise exception 'Drawing not found' using errcode='22023'; end if;
  if not private.can(v_actor, 'drawings'::public.app_module, 'view'::public.app_action, v_d.owner_entity_id, v_d.project_id) then
    raise exception 'Not allowed to comment on this drawing' using errcode='42501';
  end if;
  if coalesce(btrim(_body),'') = '' then
    raise exception 'Comment body is required' using errcode='22023';
  end if;
  if not exists (select 1 from public.drawing_version_meta
                 where drawing_id = _drawing_id and document_version_id = _document_version_id) then
    raise exception 'Revision does not belong to this drawing' using errcode='22023';
  end if;

  insert into public.drawing_markups(drawing_id, document_version_id, page_no, anchor, body, created_by)
  values (_drawing_id, _document_version_id, greatest(coalesce(_page_no,1),1), coalesce(_anchor,'{}'::jsonb), btrim(_body), v_actor)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function private.resolve_drawing_markup_impl(_markup_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_m public.drawing_markups%rowtype;
  v_d public.drawing_records%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_m from public.drawing_markups where id = _markup_id for update;
  if v_m.id is null then raise exception 'Comment not found' using errcode='22023'; end if;
  select * into v_d from public.drawing_records where id = v_m.drawing_id;
  if not (v_m.created_by = v_actor or private.can(v_actor, 'drawings'::public.app_module, 'update'::public.app_action, v_d.owner_entity_id, v_d.project_id)) then
    raise exception 'Not allowed to resolve this comment' using errcode='42501';
  end if;
  update public.drawing_markups set resolved_at = now(), resolved_by = v_actor
  where id = _markup_id and resolved_at is null;
end; $$;

create or replace function private.save_drawing_viewer_state_impl(_drawing_id uuid, _state jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not private.can_drawing(v_actor, _drawing_id, 'view'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  insert into public.drawing_viewer_state(drawing_id, user_id, state)
  values (_drawing_id, v_actor, coalesce(_state,'{}'::jsonb))
  on conflict (drawing_id, user_id) do update set state = excluded.state, updated_at = now();
end; $$;

-- =====================================================================
-- Public thin wrappers (SECURITY INVOKER)
-- =====================================================================
create or replace function public.create_drawing(
  _project_id uuid, _owner_entity_id uuid, _drawing_no text, _discipline text,
  _title text, _sheet_no text default null)
returns uuid language sql security invoker set search_path to 'public'
as $$ select private.create_drawing_impl(_project_id, _owner_entity_id, _drawing_no, _discipline, _title, _sheet_no); $$;

create or replace function public.add_drawing_version(
  _drawing_id uuid, _file_ext text, _mime_type text, _size_bytes bigint,
  _checksum_sha256 text, _revision_label text, _supersede_reason text default null)
returns table(version_id uuid, storage_bucket text, storage_path text, version_no integer)
language sql security invoker set search_path to 'public'
as $$ select * from private.add_drawing_version_impl(_drawing_id, _file_ext, _mime_type, _size_bytes, _checksum_sha256, _revision_label, _supersede_reason); $$;

create or replace function public.set_drawing_status(_drawing_id uuid, _to_status text, _note text default null)
returns void language sql security invoker set search_path to 'public'
as $$ select private.set_drawing_status_impl(_drawing_id, _to_status, _note); $$;

create or replace function public.enqueue_drawing_conversion(_document_version_id uuid)
returns table(job_id uuid, status text, provider text)
language sql security invoker set search_path to 'public'
as $$ select * from private.enqueue_drawing_conversion_impl(_document_version_id); $$;

create or replace function public.add_drawing_markup(
  _drawing_id uuid, _document_version_id uuid, _body text, _page_no integer default 1, _anchor jsonb default '{}'::jsonb)
returns uuid language sql security invoker set search_path to 'public'
as $$ select private.add_drawing_markup_impl(_drawing_id, _document_version_id, _page_no, _anchor, _body); $$;

create or replace function public.resolve_drawing_markup(_markup_id uuid)
returns void language sql security invoker set search_path to 'public'
as $$ select private.resolve_drawing_markup_impl(_markup_id); $$;

create or replace function public.save_drawing_viewer_state(_drawing_id uuid, _state jsonb)
returns void language sql security invoker set search_path to 'public'
as $$ select private.save_drawing_viewer_state_impl(_drawing_id, _state); $$;

-- =====================================================================
-- GRANTS
-- =====================================================================
grant select on public.drawing_records, public.drawing_version_meta, public.drawing_status_events,
                public.drawing_conversion_jobs, public.drawing_markups, public.drawing_viewer_state,
                public.drawing_status_transitions, public.drawing_module_settings to authenticated;
grant all on public.drawing_records, public.drawing_version_meta, public.drawing_status_events,
             public.drawing_conversion_jobs, public.drawing_markups, public.drawing_viewer_state,
             public.drawing_status_transitions, public.drawing_module_settings to service_role;

revoke insert, update, delete, truncate on
  public.drawing_records, public.drawing_version_meta, public.drawing_status_events,
  public.drawing_conversion_jobs, public.drawing_markups, public.drawing_viewer_state,
  public.drawing_status_transitions, public.drawing_module_settings from anon, authenticated;
revoke select on
  public.drawing_records, public.drawing_version_meta, public.drawing_status_events,
  public.drawing_conversion_jobs, public.drawing_markups, public.drawing_viewer_state,
  public.drawing_status_transitions, public.drawing_module_settings from anon;

revoke execute on function
  private.drawing_scope(uuid),
  private.can_drawing(uuid, uuid, public.app_action),
  private.create_drawing_impl(uuid, uuid, text, text, text, text),
  private.add_drawing_version_impl(uuid, text, text, bigint, text, text, text),
  private.set_drawing_status_impl(uuid, text, text),
  private.enqueue_drawing_conversion_impl(uuid),
  private.add_drawing_markup_impl(uuid, uuid, integer, jsonb, text),
  private.resolve_drawing_markup_impl(uuid),
  private.save_drawing_viewer_state_impl(uuid, jsonb)
from public;

revoke execute on function
  public.create_drawing(uuid, uuid, text, text, text, text),
  public.add_drawing_version(uuid, text, text, bigint, text, text, text),
  public.set_drawing_status(uuid, text, text),
  public.enqueue_drawing_conversion(uuid),
  public.add_drawing_markup(uuid, uuid, text, integer, jsonb),
  public.resolve_drawing_markup(uuid),
  public.save_drawing_viewer_state(uuid, jsonb)
from public;

grant execute on function
  private.can_drawing(uuid, uuid, public.app_action),
  private.drawing_scope(uuid),
  private.create_drawing_impl(uuid, uuid, text, text, text, text),
  private.add_drawing_version_impl(uuid, text, text, bigint, text, text, text),
  private.set_drawing_status_impl(uuid, text, text),
  private.enqueue_drawing_conversion_impl(uuid),
  private.add_drawing_markup_impl(uuid, uuid, integer, jsonb, text),
  private.resolve_drawing_markup_impl(uuid),
  private.save_drawing_viewer_state_impl(uuid, jsonb)
to authenticated;

grant execute on function
  public.create_drawing(uuid, uuid, text, text, text, text),
  public.add_drawing_version(uuid, text, text, bigint, text, text, text),
  public.set_drawing_status(uuid, text, text),
  public.enqueue_drawing_conversion(uuid),
  public.add_drawing_markup(uuid, uuid, text, integer, jsonb),
  public.resolve_drawing_markup(uuid),
  public.save_drawing_viewer_state(uuid, jsonb)
to authenticated;
