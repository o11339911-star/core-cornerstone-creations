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

  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (auth.uid(), 'insert', 'report_template_imports', v_id, _entity_id,
          jsonb_build_object('kind', _kind, 'size_bytes', _size_bytes));

  return query select v_id, 'report-imports'::text, v_path;
end; $$;

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

  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (auth.uid(), 'insert', 'report_templates', v_id, i.entity_id,
          jsonb_build_object('import_id', _import_id, 'source', i.kind));
  return v_id;
end; $$;

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

  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (auth.uid(), 'status_change', 'report_templates', _template_id, t.entity_id,
          jsonb_build_object('source', t.source, 'status', 'active'));
  return v_at;
end; $$;

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
  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (auth.uid(), 'update', 'report_templates', _template_id, t.entity_id,
          jsonb_build_object('review', true, 'note', _note));
  return v_at;
end; $$;

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
  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (auth.uid(), 'status_change', 'report_templates', _template_id, t.entity_id,
          jsonb_build_object('status','archived'));
  return v_at;
end; $$;

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

  insert into public.permission_audit_log(actor_user_id, action, object_type, object_id, target_entity_id, new_value)
  values (auth.uid(), case when _template_id is null then 'insert' else 'update' end,
          'report_templates', v_id, null, jsonb_build_object('scope','rakeez'));
  return v_id;
end; $$;