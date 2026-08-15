-- ===== audit =====
create or replace function public.audit_document_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'insert';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  elsif (v_old ? 'status') and (v_old ->> 'status') is distinct from (v_new ->> 'status') then v_action := 'status_change';
  else v_action := 'update';
  end if;

  insert into public.permission_audit_log(
    actor_user_id, object_type, object_id, action, old_value, new_value)
  values (auth.uid(), tg_table_name,
          nullif(coalesce(v_new, v_old) ->> 'id','')::uuid,
          v_action, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function public.audit_document_change();
create trigger document_versions_audit after insert on public.document_versions
  for each row execute function public.audit_document_change();
create trigger document_links_audit after insert or update or delete on public.document_links
  for each row execute function public.audit_document_change();
create trigger document_audience_audit after insert or update or delete on public.document_audience
  for each row execute function public.audit_document_change();

-- ===== create document =====
create or replace function public.create_document(
  _owner_entity_id uuid,
  _category_code text,
  _title text,
  _description text default null,
  _visibility public.doc_visibility default 'entity_private')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.is_entity_member(v_actor, _owner_entity_id) then
    raise exception 'You are not a member of this entity' using errcode = '42501';
  end if;
  if not private.can(v_actor, 'documents'::public.app_module, 'create'::public.app_action, _owner_entity_id, null) then
    raise exception 'Not allowed to create documents in this entity' using errcode = '42501';
  end if;
  if not exists (select 1 from public.document_categories where code = _category_code and is_active) then
    raise exception 'Unknown or inactive document category' using errcode = '22023';
  end if;
  if _visibility = 'public_approved' then
    raise exception 'A document becomes public only through approve_document()' using errcode = '42501';
  end if;

  insert into public.documents(owner_entity_id, category_code, title, description, visibility, created_by)
  values (_owner_entity_id, _category_code, btrim(_title), _description, _visibility, v_actor)
  returning id into v_id;
  return v_id;
end; $$;

-- ===== add version =====
create or replace function public.add_document_version(
  _document_id uuid,
  _file_ext text,
  _mime_type text,
  _size_bytes bigint,
  _checksum_sha256 text,
  _supersede_reason text default null,
  _source text default 'upload')
returns table(version_id uuid, version_no integer, storage_bucket text, storage_path text)
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_doc public.documents%rowtype;
  v_row public.document_versions%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_doc from public.documents where id = _document_id for update;
  if v_doc.id is null or v_doc.is_deleted then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  if not (v_doc.created_by = v_actor or private.can_manage_document(v_actor, _document_id)) then
    raise exception 'Not allowed to add versions to this document' using errcode = '42501';
  end if;
  if not private.can(v_actor, 'documents'::public.app_module, 'update'::public.app_action, v_doc.owner_entity_id, null) then
    raise exception 'Not allowed to upload documents for this entity' using errcode = '42501';
  end if;
  if v_doc.current_version_id is not null and coalesce(btrim(_supersede_reason),'') = '' then
    raise exception 'A reason is required when superseding an existing version' using errcode = '22023';
  end if;

  insert into public.document_versions(
    document_id, file_ext, mime_type, size_bytes, checksum_sha256,
    supersede_reason, source, storage_path, created_by)
  values (_document_id, _file_ext, _mime_type, _size_bytes, lower(_checksum_sha256),
          nullif(btrim(coalesce(_supersede_reason,'')),''), coalesce(_source,'upload'), 'pending', v_actor)
  returning * into v_row;

  return query select v_row.id, v_row.version_no, v_row.storage_bucket, v_row.storage_path;
end; $$;

-- ===== link / unlink =====
create or replace function public.link_document(
  _document_id uuid, _context_type text, _context_id uuid, _relation text default 'attachment')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_ok boolean := false;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.can_manage_document(v_actor, _document_id) then
    raise exception 'Not allowed to manage this document' using errcode = '42501';
  end if;

  v_ok := case _context_type
    when 'project' then private.can_access_project(v_actor, _context_id)
    when 'stage' then private.can_access_stage(v_actor, _context_id, null)
    when 'contract' then private.can_access_contract(v_actor, _context_id)
    when 'request' then private.can_access_request(v_actor, _context_id)
    when 'property' then private.can_access_property(v_actor, _context_id)
    when 'property_unit' then exists (
      select 1 from public.property_units u
      where u.id = _context_id and private.can_access_property(v_actor, u.property_id))
    else false end;
  if not v_ok then
    raise exception 'Not allowed to link a document to this context' using errcode = '42501';
  end if;

  insert into public.document_links(document_id, context_type, context_id, relation, linked_by)
  values (_document_id, _context_type, _context_id, coalesce(_relation,'attachment'), v_actor)
  on conflict (document_id, context_type, context_id) do update set relation = excluded.relation
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.unlink_document(_link_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_doc uuid;
begin
  select document_id into v_doc from public.document_links where id = _link_id;
  if v_doc is null then
    raise exception 'Link not found' using errcode = '22023';
  end if;
  if not private.can_manage_document(v_actor, v_doc) then
    raise exception 'Not allowed to manage this document' using errcode = '42501';
  end if;
  delete from public.document_links where id = _link_id;
  return true;
end; $$;

-- ===== visibility & audience =====
create or replace function public.set_document_visibility(
  _document_id uuid, _visibility public.doc_visibility,
  _audience_entity_ids uuid[] default '{}', _audience_user_ids uuid[] default '{}')
returns public.doc_visibility language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_e uuid; v_u uuid;
begin
  if not private.can_manage_document(v_actor, _document_id) then
    raise exception 'Not allowed to manage this document' using errcode = '42501';
  end if;
  if _visibility = 'public_approved' then
    raise exception 'A document becomes public only through approve_document()' using errcode = '42501';
  end if;

  update public.documents set visibility = _visibility, updated_at = now() where id = _document_id;

  if _visibility = 'party_limited' then
    delete from public.document_audience where document_id = _document_id;
    foreach v_e in array coalesce(_audience_entity_ids, '{}') loop
      insert into public.document_audience(document_id, audience_entity_id) values (_document_id, v_e)
      on conflict do nothing;
    end loop;
    foreach v_u in array coalesce(_audience_user_ids, '{}') loop
      insert into public.document_audience(document_id, audience_user_id) values (_document_id, v_u)
      on conflict do nothing;
    end loop;
    if not exists (select 1 from public.document_audience where document_id = _document_id) then
      raise exception 'Party-limited visibility requires at least one audience member' using errcode = '22023';
    end if;
  end if;

  return _visibility;
end; $$;

-- ===== approve =====
create or replace function public.approve_document(_document_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_doc public.documents%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_doc from public.documents where id = _document_id for update;
  if v_doc.id is null or v_doc.is_deleted then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  if v_doc.current_version_id is null then
    raise exception 'A document with no version cannot be approved' using errcode = '22023';
  end if;
  if v_doc.created_by = v_actor then
    raise exception 'The uploader cannot approve their own document' using errcode = '42501';
  end if;
  if not private.is_entity_member(v_actor, v_doc.owner_entity_id)
     or not private.can(v_actor, 'documents'::public.app_module, 'approve'::public.app_action, v_doc.owner_entity_id, null) then
    raise exception 'Not allowed to approve documents for this entity' using errcode = '42501';
  end if;

  update public.documents
    set approved_by = v_actor, approved_at = now(), approval_note = _note,
        visibility = 'public_approved', status = 'active', updated_at = now()
    where id = _document_id;
  return now();
end; $$;

-- ===== soft delete / restore =====
create or replace function public.soft_delete_document(_document_id uuid, _reason text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_doc public.documents%rowtype;
begin
  if coalesce(btrim(_reason),'') = '' then
    raise exception 'A deletion reason is required' using errcode = '22023';
  end if;
  select * into v_doc from public.documents where id = _document_id for update;
  if v_doc.id is null then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  if not private.is_entity_member(v_actor, v_doc.owner_entity_id)
     or not private.can(v_actor, 'documents'::public.app_module, 'soft_delete'::public.app_action, v_doc.owner_entity_id, null) then
    raise exception 'Not allowed to delete this document' using errcode = '42501';
  end if;

  update public.documents
    set is_deleted = true, deleted_at = now(), deleted_by = v_actor,
        delete_reason = _reason, status = 'archived', updated_at = now()
    where id = _document_id;
  return now();
end; $$;

create or replace function public.restore_document(_document_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = _document_id for update;
  if v_doc.id is null then
    raise exception 'Document not found' using errcode = '22023';
  end if;
  if not private.is_entity_member(v_actor, v_doc.owner_entity_id)
     or not private.can(v_actor, 'documents'::public.app_module, 'soft_delete'::public.app_action, v_doc.owner_entity_id, null) then
    raise exception 'Not allowed to restore this document' using errcode = '42501';
  end if;
  update public.documents
    set is_deleted = false, deleted_at = null, deleted_by = null, delete_reason = null,
        status = case when current_version_id is null then 'draft' else 'active' end, updated_at = now()
    where id = _document_id;
  return true;
end; $$;

revoke execute on function
  public.create_document(uuid,text,text,text,public.doc_visibility),
  public.add_document_version(uuid,text,text,bigint,text,text,text),
  public.link_document(uuid,text,uuid,text),
  public.unlink_document(uuid),
  public.set_document_visibility(uuid,public.doc_visibility,uuid[],uuid[]),
  public.approve_document(uuid,text),
  public.soft_delete_document(uuid,text),
  public.restore_document(uuid)
from anon;