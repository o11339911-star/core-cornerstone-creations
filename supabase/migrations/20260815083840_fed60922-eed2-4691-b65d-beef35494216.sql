-- ============ 15-B) template imports + Rakeez template administration ============

-- 1) allow imported sources
alter table public.report_templates drop constraint if exists report_templates_source_check;
alter table public.report_templates add constraint report_templates_source_check
  check (source in ('builtin','editor','docx_import','pdf_import'));

-- 2) platform administrators (Rakeez template library only)
create table if not exists public.platform_admins (
  user_id uuid primary key,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
create policy "platform admins can see their own row"
  on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create or replace function private.is_platform_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = _user_id);
$$;
revoke all on function private.is_platform_admin(uuid) from public, anon;
grant execute on function private.is_platform_admin(uuid) to authenticated, service_role;

create or replace function public.am_i_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_platform_admin(auth.uid());
$$;
revoke all on function public.am_i_platform_admin() from public, anon;
grant execute on function public.am_i_platform_admin() to authenticated, service_role;

-- platform admins may also read draft/archived Rakeez templates (never entity templates)
create policy "rakeez library fully readable by platform admins"
  on public.report_templates for select to authenticated
  using (owner_scope = 'rakeez' and private.is_platform_admin(auth.uid()));

-- 3) import records
create table public.report_template_imports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.report_templates(id) on delete set null,
  owner_scope text not null check (owner_scope in ('rakeez','entity')),
  entity_id uuid references public.entities(id) on delete cascade,
  kind text not null check (kind in ('docx','pdf')),
  storage_bucket text not null default 'report-imports',
  storage_path text not null unique,
  file_ext text not null check (file_ext in ('docx','pdf')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  checksum_sha256 text,
  status text not null default 'uploaded' check (status in ('uploaded','parsed','failed','applied')),
  blocks_created integer not null default 0,
  dropped_report jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_text text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_template_imports_scope_ck check (
    (owner_scope = 'rakeez' and entity_id is null) or (owner_scope = 'entity' and entity_id is not null)
  )
);
create index report_template_imports_entity_idx on public.report_template_imports(entity_id);
create index report_template_imports_template_idx on public.report_template_imports(template_id);
grant select on public.report_template_imports to authenticated;
grant all on public.report_template_imports to service_role;
alter table public.report_template_imports enable row level security;

create policy "imports readable inside the owning entity"
  on public.report_template_imports for select to authenticated
  using (
    (entity_id is not null and private.is_entity_member(auth.uid(), entity_id))
    or (owner_scope = 'rakeez' and private.is_platform_admin(auth.uid()))
  );

create trigger report_template_imports_set_updated_at
  before update on public.report_template_imports
  for each row execute function public.set_updated_at();

-- 4) shared authorisation helper for template writes
create or replace function private.can_manage_template_scope(
  _user_id uuid, _owner_scope text, _entity_id uuid, _action public.app_action
) returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if _user_id is null then return false; end if;
  if _owner_scope = 'rakeez' then
    return _entity_id is null and private.is_platform_admin(_user_id);
  end if;
  if _entity_id is null then return false; end if;
  return private.is_entity_member(_user_id, _entity_id)
     and private.can(_user_id, 'reports'::public.app_module, _action, _entity_id, null);
end; $$;
revoke all on function private.can_manage_template_scope(uuid,text,uuid,public.app_action) from public, anon;
grant execute on function private.can_manage_template_scope(uuid,text,uuid,public.app_action) to authenticated, service_role;

-- 5) create an import record (called after server-side extension/MIME/magic-byte checks)
create or replace function public.create_template_import(
  _owner_scope text, _entity_id uuid, _kind text, _mime_type text,
  _size_bytes bigint, _checksum_sha256 text default null
) returns table (import_id uuid, storage_bucket text, storage_path text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_path text; v_prefix text;
begin
  if _kind not in ('docx','pdf') then
    raise exception 'Unsupported import kind' using errcode='22023';
  end if;
  if _mime_type not in (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf') then
    raise exception 'Unsupported MIME type' using errcode='22023';
  end if;
  if (_kind = 'docx') <> (_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    raise exception 'MIME type does not match file kind' using errcode='22023';
  end if;
  if _size_bytes is null or _size_bytes <= 0 or _size_bytes > 15728640 then
    raise exception 'File size out of range' using errcode='22023';
  end if;
  if not private.can_manage_template_scope(auth.uid(), _owner_scope, _entity_id, 'create'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;

  v_id := gen_random_uuid();
  v_prefix := case when _owner_scope = 'rakeez' then 'rakeez' else _entity_id::text end;
  v_path := v_prefix || '/' || v_id::text || '.' || _kind;

  insert into public.report_template_imports(
    id, owner_scope, entity_id, kind, storage_path, file_ext, mime_type, size_bytes,
    checksum_sha256, status, created_by)
  values (v_id, _owner_scope, _entity_id, _kind, v_path, _kind, _mime_type, _size_bytes,
    _checksum_sha256, 'uploaded', auth.uid());

  insert into public.permission_audit_log(actor_id, action, object_type, object_id, entity_id, detail)
  values (auth.uid(), 'create', 'report_template_imports', v_id, _entity_id,
          jsonb_build_object('kind', _kind, 'size_bytes', _size_bytes));

  return query select v_id, 'report-imports'::text, v_path;
end; $$;
revoke all on function public.create_template_import(text,uuid,text,text,bigint,text) from public, anon;
grant execute on function public.create_template_import(text,uuid,text,text,bigint,text) to authenticated, service_role;

-- 6) record the parse outcome
create or replace function public.record_template_import_parse(
  _import_id uuid, _status text, _blocks_created integer,
  _dropped_report jsonb, _warnings jsonb, _error_text text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare i public.report_template_imports%rowtype;
begin
  select * into i from public.report_template_imports where id = _import_id;
  if i.id is null then raise exception 'Import not found' using errcode='42704'; end if;
  if not private.can_manage_template_scope(auth.uid(), i.owner_scope, i.entity_id, 'create'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if _status not in ('parsed','failed') then
    raise exception 'Invalid parse status' using errcode='22023';
  end if;
  update public.report_template_imports
     set status = _status,
         blocks_created = coalesce(_blocks_created, 0),
         dropped_report = coalesce(_dropped_report, '[]'::jsonb),
         warnings = coalesce(_warnings, '[]'::jsonb),
         error_text = _error_text
   where id = _import_id;
  return true;
end; $$;
revoke all on function public.record_template_import_parse(uuid,text,integer,jsonb,jsonb,text) from public, anon;
grant execute on function public.record_template_import_parse(uuid,text,integer,jsonb,jsonb,text) to authenticated, service_role;

-- 7) turn a parsed import into a DRAFT template
create or replace function public.apply_template_import(
  _import_id uuid, _name_ar text, _name_en text, _language text,
  _content jsonb, _page_setup jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare i public.report_template_imports%rowtype; v_id uuid; v_lang text;
begin
  select * into i from public.report_template_imports where id = _import_id;
  if i.id is null then raise exception 'Import not found' using errcode='42704'; end if;
  if not private.can_manage_template_scope(auth.uid(), i.owner_scope, i.entity_id, 'create'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if i.template_id is not null then
    raise exception 'Import already applied' using errcode='22023';
  end if;

  v_lang := coalesce(nullif(_language,''), 'ar');
  insert into public.report_templates(owner_scope, entity_id, name_ar, name_en, language, direction,
    content, page_setup, source, status, created_by)
  values (i.owner_scope, i.entity_id, _name_ar, _name_en, v_lang,
    case when v_lang = 'ar' then 'rtl' else 'ltr' end,
    coalesce(_content, '{"blocks":[]}'::jsonb),
    coalesce(_page_setup, '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb),
    case when i.kind = 'docx' then 'docx_import' else 'pdf_import' end,
    'draft', auth.uid())
  returning id into v_id;

  update public.report_template_imports
     set template_id = v_id, status = 'applied' where id = _import_id;

  insert into public.permission_audit_log(actor_id, action, object_type, object_id, entity_id, detail)
  values (auth.uid(), 'create', 'report_templates', v_id, i.entity_id,
          jsonb_build_object('import_id', _import_id, 'source', i.kind));
  return v_id;
end; $$;
revoke all on function public.apply_template_import(uuid,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.apply_template_import(uuid,text,text,text,jsonb,jsonb) to authenticated, service_role;

-- 8) edit a template that is still a draft (or a Rakeez template)
create or replace function public.update_report_template(
  _template_id uuid, _name_ar text default null, _name_en text default null,
  _content jsonb default null, _page_setup jsonb default null
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare t public.report_templates%rowtype; v_at timestamptz;
begin
  select * into t from public.report_templates where id = _template_id;
  if t.id is null then raise exception 'Template not found' using errcode='42704'; end if;
  if t.source = 'builtin' then
    raise exception 'Built-in templates cannot be edited' using errcode='42501';
  end if;
  if not private.can_manage_template_scope(auth.uid(), t.owner_scope, t.entity_id, 'update'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if t.status = 'archived' then
    raise exception 'Archived templates cannot be edited' using errcode='22023';
  end if;

  update public.report_templates
     set name_ar = coalesce(_name_ar, name_ar),
         name_en = coalesce(_name_en, name_en),
         content = coalesce(_content, content),
         page_setup = coalesce(_page_setup, page_setup)
   where id = _template_id
   returning updated_at into v_at;
  return v_at;
end; $$;
revoke all on function public.update_report_template(uuid,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.update_report_template(uuid,text,text,jsonb,jsonb) to authenticated, service_role;

-- 9) activation: PDF imports require a recorded human review
create or replace function public.activate_report_template(_template_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t public.report_templates%rowtype; v_at timestamptz := now();
begin
  select * into t from public.report_templates where id = _template_id;
  if t.id is null then raise exception 'Template not found' using errcode='42704'; end if;
  if not private.can_manage_template_scope(auth.uid(), t.owner_scope, t.entity_id, 'approve'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if t.status = 'active' then return t.updated_at; end if;
  if t.status = 'archived' then
    raise exception 'Archived templates cannot be activated' using errcode='22023';
  end if;
  if jsonb_array_length(coalesce(t.content->'blocks','[]'::jsonb)) = 0 then
    raise exception 'Template has no content blocks' using errcode='22023';
  end if;
  if t.source = 'pdf_import' and t.reviewed_by is null then
    raise exception 'PDF-imported templates require a recorded human review before activation'
      using errcode='42501';
  end if;

  update public.report_templates
     set status = 'active',
         reviewed_by = coalesce(reviewed_by, auth.uid()),
         reviewed_at = coalesce(reviewed_at, v_at)
   where id = _template_id;

  insert into public.permission_audit_log(actor_id, action, object_type, object_id, entity_id, detail)
  values (auth.uid(), 'approve', 'report_templates', _template_id, t.entity_id,
          jsonb_build_object('source', t.source));
  return v_at;
end; $$;
revoke all on function public.activate_report_template(uuid) from public, anon;
grant execute on function public.activate_report_template(uuid) to authenticated, service_role;

-- 10) mandatory human review of an imported template (segregation-free but recorded)
create or replace function public.review_report_template(_template_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t public.report_templates%rowtype; v_at timestamptz := now();
begin
  select * into t from public.report_templates where id = _template_id;
  if t.id is null then raise exception 'Template not found' using errcode='42704'; end if;
  if not private.can_manage_template_scope(auth.uid(), t.owner_scope, t.entity_id, 'approve'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  update public.report_templates
     set reviewed_by = auth.uid(), reviewed_at = v_at
   where id = _template_id;
  insert into public.permission_audit_log(actor_id, action, object_type, object_id, entity_id, detail)
  values (auth.uid(), 'update', 'report_templates', _template_id, t.entity_id,
          jsonb_build_object('review', true, 'note', _note));
  return v_at;
end; $$;
revoke all on function public.review_report_template(uuid,text) from public, anon;
grant execute on function public.review_report_template(uuid,text) to authenticated, service_role;

-- 11) archive (no hard delete)
create or replace function public.archive_report_template(_template_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare t public.report_templates%rowtype; v_at timestamptz := now();
begin
  select * into t from public.report_templates where id = _template_id;
  if t.id is null then raise exception 'Template not found' using errcode='42704'; end if;
  if not private.can_manage_template_scope(auth.uid(), t.owner_scope, t.entity_id, 'approve'::public.app_action) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  update public.report_templates set status = 'archived' where id = _template_id;
  insert into public.permission_audit_log(actor_id, action, object_type, object_id, entity_id, detail)
  values (auth.uid(), 'soft_delete', 'report_templates', _template_id, t.entity_id, '{}'::jsonb);
  return v_at;
end; $$;
revoke all on function public.archive_report_template(uuid) from public, anon;
grant execute on function public.archive_report_template(uuid) to authenticated, service_role;

-- 12) Rakeez library administration (never touches entity data)
create or replace function public.upsert_rakeez_template(
  _template_id uuid, _code text, _name_ar text, _name_en text,
  _language text, _content jsonb, _page_setup jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_lang text; t public.report_templates%rowtype;
begin
  if not private.is_platform_admin(auth.uid()) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  v_lang := coalesce(nullif(_language,''), 'ar');

  if _template_id is null then
    insert into public.report_templates(owner_scope, entity_id, code, name_ar, name_en, language,
      direction, content, page_setup, source, status, created_by)
    values ('rakeez', null, nullif(_code,''), _name_ar, _name_en, v_lang,
      case when v_lang = 'ar' then 'rtl' else 'ltr' end,
      coalesce(_content, '{"blocks":[]}'::jsonb),
      coalesce(_page_setup, '{"size":"A4","marginMm":{"top":20,"right":18,"bottom":20,"left":18},"header":true,"footer":true,"pageNumbers":true}'::jsonb),
      'editor', 'draft', auth.uid())
    returning id into v_id;
  else
    select * into t from public.report_templates where id = _template_id;
    if t.id is null or t.owner_scope <> 'rakeez' then
      raise exception 'Rakeez template not found' using errcode='42704';
    end if;
    if t.source = 'builtin' then
      raise exception 'Built-in templates cannot be edited' using errcode='42501';
    end if;
    update public.report_templates
       set code = coalesce(nullif(_code,''), code),
           name_ar = coalesce(_name_ar, name_ar),
           name_en = coalesce(_name_en, name_en),
           language = v_lang,
           direction = case when v_lang = 'ar' then 'rtl' else 'ltr' end,
           content = coalesce(_content, content),
           page_setup = coalesce(_page_setup, page_setup)
     where id = _template_id;
    v_id := _template_id;
  end if;

  insert into public.permission_audit_log(actor_id, action, object_type, object_id, entity_id, detail)
  values (auth.uid(), case when _template_id is null then 'create' else 'update' end,
          'report_templates', v_id, null, jsonb_build_object('scope','rakeez'));
  return v_id;
end; $$;
revoke all on function public.upsert_rakeez_template(uuid,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.upsert_rakeez_template(uuid,text,text,text,text,jsonb,jsonb) to authenticated, service_role;

-- 13) audit object types
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions',
    'contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience','reports','report_versions','report_templates','report_assets',
    'report_template_imports','platform_admins']));

-- 14) storage policies for the private report-imports bucket (identifier-only paths)
create or replace function private.import_id_from_object(_name text)
returns uuid language plpgsql immutable set search_path = public as $$
declare parts text[]; base text;
begin
  parts := string_to_array(_name, '/');
  if array_length(parts,1) <> 2 then return null; end if;
  base := split_part(parts[2], '.', 1);
  begin
    return base::uuid;
  exception when others then return null; end;
end; $$;

create or replace function private.can_touch_import_object(_user_id uuid, _name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare i public.report_template_imports%rowtype; v_id uuid;
begin
  v_id := private.import_id_from_object(_name);
  if v_id is null then return false; end if;
  select * into i from public.report_template_imports where id = v_id;
  if i.id is null then return false; end if;
  if i.storage_path <> _name then return false; end if;
  return private.can_manage_template_scope(_user_id, i.owner_scope, i.entity_id, 'create'::public.app_action);
end; $$;
revoke all on function private.can_touch_import_object(uuid,text) from public, anon;
grant execute on function private.can_touch_import_object(uuid,text) to authenticated, service_role;

create policy "report imports read"
  on storage.objects for select to authenticated
  using (bucket_id = 'report-imports' and private.can_touch_import_object(auth.uid(), name));

create policy "report imports write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'report-imports' and private.can_touch_import_object(auth.uid(), name));