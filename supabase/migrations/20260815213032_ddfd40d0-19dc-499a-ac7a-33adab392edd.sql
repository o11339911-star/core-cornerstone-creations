-- =====================================================================
-- Corrective migration — Drawings (CAD) module hardening
-- =====================================================================

-- 1) Privileges: strip anon completely, strip PUBLIC from RPCs
revoke all privileges on public.drawing_records from anon;
revoke all privileges on public.drawing_version_meta from anon;
revoke all privileges on public.drawing_status_events from anon;
revoke all privileges on public.drawing_conversion_jobs from anon;
revoke all privileges on public.drawing_markups from anon;
revoke all privileges on public.drawing_viewer_state from anon;
revoke all privileges on public.drawing_status_transitions from anon;
revoke all privileges on public.drawing_module_settings from anon;

revoke insert, update, delete, truncate, references, trigger on
  public.drawing_records, public.drawing_version_meta, public.drawing_status_events,
  public.drawing_conversion_jobs, public.drawing_markups, public.drawing_viewer_state,
  public.drawing_status_transitions, public.drawing_module_settings
from authenticated;

grant select on
  public.drawing_records, public.drawing_version_meta, public.drawing_status_events,
  public.drawing_conversion_jobs, public.drawing_markups, public.drawing_viewer_state,
  public.drawing_status_transitions, public.drawing_module_settings
to authenticated;

-- 2) FORCE RLS (definer functions are owned by a bypassrls role, so they keep working)
alter table public.drawing_records force row level security;
alter table public.drawing_version_meta force row level security;
alter table public.drawing_status_events force row level security;
alter table public.drawing_conversion_jobs force row level security;
alter table public.drawing_markups force row level security;
alter table public.drawing_viewer_state force row level security;
alter table public.drawing_status_transitions force row level security;
alter table public.drawing_module_settings force row level security;

-- 3) Missing indexes flagged by the advisor
create index if not exists drawing_conversion_jobs_version_idx on public.drawing_conversion_jobs(document_version_id);
create index if not exists drawing_markups_version_idx on public.drawing_markups(document_version_id);
create index if not exists drawing_markups_request_idx on public.drawing_markups(request_id);
create index if not exists drawing_records_owner_entity_idx on public.drawing_records(owner_entity_id);
create index if not exists drawing_records_superseded_by_idx on public.drawing_records(superseded_by);

-- 4) Status rename: approved -> approved_internal (tables are empty)
alter table public.drawing_records drop constraint if exists drawing_records_status_check;
update public.drawing_records set status = 'approved_internal' where status = 'approved';
alter table public.drawing_records add constraint drawing_records_status_check
  check (status in ('draft','under_review','returned','approved_internal','issued_for_construction','as_built','superseded'));

delete from public.drawing_status_transitions;
insert into public.drawing_status_transitions(from_status, to_status) values
  ('draft','under_review'),
  ('under_review','returned'),
  ('under_review','approved_internal'),
  ('returned','under_review'),
  ('approved_internal','issued_for_construction'),
  ('approved_internal','superseded'),
  ('issued_for_construction','as_built'),
  ('issued_for_construction','superseded'),
  ('as_built','superseded');

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

  v_action := case when _to_status in ('approved_internal','issued_for_construction','returned','as_built')
                   then 'approve'::public.app_action else 'update'::public.app_action end;
  if not private.can(v_actor, 'drawings'::public.app_module, v_action, v_d.owner_entity_id, v_d.project_id) then
    raise exception 'Not allowed to change drawing status' using errcode='42501';
  end if;

  -- Separation of duties: the uploader of the current revision may not review it
  if _to_status in ('approved_internal','returned') then
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

-- 5) Drop ZIP from accepted CAD formats
alter table public.drawing_version_meta drop constraint if exists drawing_version_meta_format_check;
alter table public.drawing_version_meta add constraint drawing_version_meta_format_check
  check (format in ('pdf','dwg','dxf','ifc'));

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
    if v_ext not in ('pdf','dwg','dxf','ifc') then
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
  if v_ext = 'ifc' and lower(new.mime_type) not in
     ('application/octet-stream','application/x-step','model/ifc') then
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

-- 6) Link a markup to an existing RFI (public.requests) — no new request table
create or replace function private.link_drawing_markup_request_impl(_markup_id uuid, _request_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_m public.drawing_markups%rowtype;
  v_d public.drawing_records%rowtype;
  v_req public.requests%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_m from public.drawing_markups where id = _markup_id for update;
  if v_m.id is null then raise exception 'Comment not found' using errcode='22023'; end if;
  select * into v_d from public.drawing_records where id = v_m.drawing_id;
  if not private.can(v_actor, 'drawings'::public.app_module, 'update'::public.app_action, v_d.owner_entity_id, v_d.project_id) then
    raise exception 'Not allowed to link this comment' using errcode='42501';
  end if;
  select * into v_req from public.requests where id = _request_id;
  if v_req.id is null then raise exception 'Request not found' using errcode='22023'; end if;
  if v_req.project_id is distinct from v_d.project_id then
    raise exception 'The request belongs to another project' using errcode='42501';
  end if;
  update public.drawing_markups set request_id = _request_id where id = _markup_id;
end; $$;

create or replace function public.link_drawing_markup_request(_markup_id uuid, _request_id uuid)
returns void language sql security invoker set search_path to 'public'
as $$ select private.link_drawing_markup_request_impl(_markup_id, _request_id); $$;

-- 7) Rewrite policies with (select auth.uid()) to avoid per-row initplan
drop policy if exists drawing_records_read on public.drawing_records;
create policy drawing_records_read on public.drawing_records for select to authenticated
  using (private.can((select auth.uid()), 'drawings'::public.app_module, 'view'::public.app_action, owner_entity_id, project_id));

drop policy if exists drawing_version_meta_read on public.drawing_version_meta;
create policy drawing_version_meta_read on public.drawing_version_meta for select to authenticated
  using (private.can_drawing((select auth.uid()), drawing_id, 'view'::public.app_action));

drop policy if exists drawing_status_events_read on public.drawing_status_events;
create policy drawing_status_events_read on public.drawing_status_events for select to authenticated
  using (private.can_drawing((select auth.uid()), drawing_id, 'view'::public.app_action));

drop policy if exists drawing_conversion_jobs_read on public.drawing_conversion_jobs;
create policy drawing_conversion_jobs_read on public.drawing_conversion_jobs for select to authenticated
  using (private.can_drawing((select auth.uid()), drawing_id, 'view'::public.app_action));

drop policy if exists drawing_markups_read on public.drawing_markups;
create policy drawing_markups_read on public.drawing_markups for select to authenticated
  using (private.can_drawing((select auth.uid()), drawing_id, 'view'::public.app_action));

drop policy if exists drawing_viewer_state_own on public.drawing_viewer_state;
create policy drawing_viewer_state_own on public.drawing_viewer_state for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists cad_originals_read on storage.objects;
create policy cad_originals_read on storage.objects for select to authenticated
  using (
    bucket_id = 'cad-originals'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and private.can((select auth.uid()), 'drawings'::public.app_module, 'view'::public.app_action,
                    ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
  );

drop policy if exists cad_originals_write on storage.objects;
create policy cad_originals_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cad-originals'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and private.can((select auth.uid()), 'drawings'::public.app_module, 'create'::public.app_action,
                    ((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid)
  );

-- 8) Function EXECUTE: revoke from PUBLIC and anon, grant authenticated only
revoke all on function
  public.create_drawing(uuid, uuid, text, text, text, text),
  public.add_drawing_version(uuid, text, text, bigint, text, text, text),
  public.set_drawing_status(uuid, text, text),
  public.enqueue_drawing_conversion(uuid),
  public.add_drawing_markup(uuid, uuid, text, integer, jsonb),
  public.resolve_drawing_markup(uuid),
  public.save_drawing_viewer_state(uuid, jsonb),
  public.link_drawing_markup_request(uuid, uuid)
from public, anon;

revoke all on function
  private.can_drawing(uuid, uuid, public.app_action),
  private.drawing_scope(uuid),
  private.create_drawing_impl(uuid, uuid, text, text, text, text),
  private.add_drawing_version_impl(uuid, text, text, bigint, text, text, text),
  private.set_drawing_status_impl(uuid, text, text),
  private.enqueue_drawing_conversion_impl(uuid),
  private.add_drawing_markup_impl(uuid, uuid, integer, jsonb, text),
  private.resolve_drawing_markup_impl(uuid),
  private.save_drawing_viewer_state_impl(uuid, jsonb),
  private.link_drawing_markup_request_impl(uuid, uuid)
from public, anon;

grant execute on function
  public.create_drawing(uuid, uuid, text, text, text, text),
  public.add_drawing_version(uuid, text, text, bigint, text, text, text),
  public.set_drawing_status(uuid, text, text),
  public.enqueue_drawing_conversion(uuid),
  public.add_drawing_markup(uuid, uuid, text, integer, jsonb),
  public.resolve_drawing_markup(uuid),
  public.save_drawing_viewer_state(uuid, jsonb),
  public.link_drawing_markup_request(uuid, uuid)
to authenticated;

grant execute on function
  private.can_drawing(uuid, uuid, public.app_action),
  private.drawing_scope(uuid),
  private.create_drawing_impl(uuid, uuid, text, text, text, text),
  private.add_drawing_version_impl(uuid, text, text, bigint, text, text, text),
  private.set_drawing_status_impl(uuid, text, text),
  private.enqueue_drawing_conversion_impl(uuid),
  private.add_drawing_markup_impl(uuid, uuid, integer, jsonb, text),
  private.resolve_drawing_markup_impl(uuid),
  private.save_drawing_viewer_state_impl(uuid, jsonb),
  private.link_drawing_markup_request_impl(uuid, uuid)
to authenticated;