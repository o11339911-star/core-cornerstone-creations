-- ============ 1) GRANT HYGIENE ============
revoke all on public.document_analyses from public, anon, authenticated;
revoke all on public.entity_relationships from public, anon, authenticated;
grant select on public.document_analyses to authenticated;
grant select on public.entity_relationships to authenticated;
grant all on public.document_analyses to service_role;
grant all on public.entity_relationships to service_role;

-- ============ 2) document_analyses integrity ============
alter table public.document_analyses
  add constraint document_analyses_fields_object
    check (jsonb_typeof(extracted_fields) = 'object' and pg_column_size(extracted_fields) <= 65536),
  add constraint document_analyses_confidence_object
    check (jsonb_typeof(field_confidence) = 'object' and pg_column_size(field_confidence) <= 16384),
  add constraint document_analyses_conflicts_array
    check (jsonb_typeof(conflicts) = 'array' and pg_column_size(conflicts) <= 16384);

alter table public.document_analyses
  add constraint document_analyses_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint document_analyses_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null;

create unique index if not exists document_analyses_one_confirmed
  on public.document_analyses (document_version_id)
  where status = 'confirmed';

-- ============ 3) record_document_analysis: strict validation ============
create or replace function public.record_document_analysis(
  _document_version_id uuid, _engine text, _status text,
  _detected_type text default null, _extracted_fields jsonb default '{}'::jsonb,
  _field_confidence jsonb default '{}'::jsonb, _conflicts jsonb default '[]'::jsonb,
  _failure_reason text default null
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _doc uuid; _id uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select document_id into _doc from public.document_versions where id = _document_version_id;
  if _doc is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_document(_uid, _doc) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if _status not in ('review_required','failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if coalesce(_engine,'') not in ('pdf_text','ocr_tesseract','manual') then
    raise exception 'INVALID_ENGINE' using errcode = '22023';
  end if;
  if _detected_type is not null and _detected_type not in
     ('deed','building_license','property_doc','identity','other') then
    raise exception 'INVALID_DETECTED_TYPE' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(_extracted_fields,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(_field_confidence,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(_conflicts,'[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_PAYLOAD_SHAPE' using errcode = '22023';
  end if;
  if pg_column_size(coalesce(_extracted_fields,'{}'::jsonb)) > 65536
     or pg_column_size(coalesce(_field_confidence,'{}'::jsonb)) > 16384
     or pg_column_size(coalesce(_conflicts,'[]'::jsonb)) > 16384 then
    raise exception 'PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;

  insert into public.document_analyses (
    document_id, document_version_id, status, engine, detected_type,
    extracted_fields, field_confidence, conflicts, failure_reason, created_by
  ) values (
    _doc, _document_version_id, _status, _engine, _detected_type,
    coalesce(_extracted_fields,'{}'::jsonb), coalesce(_field_confidence,'{}'::jsonb),
    coalesce(_conflicts,'[]'::jsonb), left(coalesce(_failure_reason,''), 300), _uid
  ) returning id into _id;
  return _id;
end;
$function$;

-- ============ 4) confirm_document_analysis: race-free ============
create or replace function public.confirm_document_analysis(
  _analysis_id uuid, _property_id uuid, _target text, _head_id uuid default null,
  _number text default null, _issuer text default null, _date_1 date default null,
  _date_2 date default null, _area numeric default null,
  _owner_snapshot text default null, _scope_text text default null
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  _uid uuid := auth.uid();
  _a record;
  _head uuid := _head_id;
  _version uuid;
  _next int;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  -- Row lock: two concurrent confirmations cannot both pass the status gate.
  select * into _a from public.document_analyses where id = _analysis_id for update;
  if _a is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if _a.status <> 'review_required' then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  if not private.can_manage_document(_uid, _a.document_id) then
    raise exception 'FORBIDDEN_DOCUMENT' using errcode = '42501';
  end if;
  if not private.can_manage_property(_uid, _property_id) then
    raise exception 'FORBIDDEN_PROPERTY' using errcode = '42501';
  end if;
  if _target not in ('deed','building_license') then
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_number,'')),'') is null then
    raise exception 'NUMBER_REQUIRED' using errcode = '22023';
  end if;
  if _number !~ '^[0-9A-Za-z/\-]{1,60}$' then
    raise exception 'INVALID_NUMBER' using errcode = '22023';
  end if;

  -- Claim the analysis first; the conditional update is the real mutex.
  update public.document_analyses
     set status = 'confirmed', reviewed_by = _uid, reviewed_at = now()
   where id = _analysis_id and status = 'review_required';
  if not found then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;

  if _target = 'deed' then
    if _head is null then
      insert into public.deeds (property_id, deed_number, issuer, created_by)
      values (_property_id, _number, _issuer, _uid) returning id into _head;
    else
      update public.deeds
         set deed_number = _number,
             issuer = coalesce(_issuer, issuer),
             updated_at = now()
       where id = _head and property_id = _property_id;
      if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    end if;

    select coalesce(max(version_no),0) + 1 into _next
      from public.deed_versions where deed_id = _head;

    insert into public.deed_versions (
      deed_id, version_no, deed_date, area, owner_name_snapshot,
      source, document_version_id, created_by
    ) values (_head, _next, _date_1, _area, _owner_snapshot, 'extracted', _a.document_version_id, _uid)
    returning id into _version;

  else
    if _head is null then
      insert into public.building_licenses (property_id, license_number, authority, created_by)
      values (_property_id, _number, _issuer, _uid) returning id into _head;
    else
      update public.building_licenses
         set license_number = _number,
             authority = coalesce(_issuer, authority),
             updated_at = now()
       where id = _head and property_id = _property_id;
      if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    end if;

    select coalesce(max(version_no),0) + 1 into _next
      from public.license_versions where license_id = _head;

    insert into public.license_versions (
      license_id, version_no, issued_on, expires_on, scope_text,
      source, document_version_id, created_by
    ) values (_head, _next, _date_1, _date_2, _scope_text, 'extracted', _a.document_version_id, _uid)
    returning id into _version;
  end if;

  insert into public.document_links (document_id, context_type, context_id, relation, linked_by)
  values (_a.document_id, 'property', _property_id, 'attachment', _uid)
  on conflict do nothing;

  return _version;
end;
$function$;

-- ============ 5) abort_document_upload ============
create or replace function public.abort_document_upload(_version_id uuid, _reason text default 'upload_failed')
returns boolean language plpgsql security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _doc uuid; _prev uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select document_id into _doc from public.document_versions where id = _version_id;
  if _doc is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_document(_uid, _doc) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- History is never deleted: the version is marked rejected and unopenable.
  update public.document_versions
     set scan_status = 'rejected',
         supersede_reason = left('upload_failed:' || coalesce(_reason,''), 500)
   where id = _version_id;

  select id into _prev from public.document_versions
   where document_id = _doc and id <> _version_id and coalesce(scan_status,'') <> 'rejected'
   order by version_no desc limit 1;

  update public.documents
     set current_version_id = _prev, updated_at = now()
   where id = _doc and current_version_id = _version_id;

  return true;
end;
$function$;

-- ============ 6) project assignment safety ============
create or replace function private.is_assignable_project_member(
  _project_id uuid, _user_id uuid, _entity_id uuid
) returns boolean language sql stable security definer set search_path to '' as $function$
  select exists (
    select 1
      from public.entity_memberships m
     where m.user_id = _user_id
       and m.entity_id = _entity_id
       and m.status = 'active'
       and (m.expires_at is null or m.expires_at > now())
       and (
         exists (select 1 from public.projects p where p.id = _project_id and p.entity_id = _entity_id)
         or exists (
           select 1 from public.project_parties pp
            where pp.project_id = _project_id
              and pp.party_entity_id = _entity_id
              and pp.status = 'accepted'
              and (pp.ends_on is null or pp.ends_on >= current_date)
         )
       )
  );
$function$;

create or replace function public.list_project_assignable_members(_project_id uuid)
returns table(user_id uuid, entity_id uuid, full_name text, entity_name text)
language plpgsql stable security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _entity uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select p.entity_id into _entity from public.projects p where p.id = _project_id;
  if _entity is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can(_uid, 'projects'::public.app_module, 'update'::public.app_action, _entity, _project_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select m.user_id, m.entity_id,
         coalesce(pr.full_name, 'عضو')::text,
         coalesce(e.name, '-')::text
    from public.entity_memberships m
    join public.entities e on e.id = m.entity_id
    left join public.profiles pr on pr.id = m.user_id
   where m.status = 'active'
     and (m.expires_at is null or m.expires_at > now())
     and private.is_assignable_project_member(_project_id, m.user_id, m.entity_id)
   order by 4, 3;
end;
$function$;

create or replace function public.create_project_assignment(
  _project_id uuid, _user_id uuid, _entity_id uuid,
  _job_title_ar text, _job_title_en text,
  _stage_id uuid default null, _starts_on date default null,
  _ends_on date default null, _visibility text default 'internal'
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _entity uuid; _id uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select p.entity_id into _entity from public.projects p where p.id = _project_id;
  if _entity is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can(_uid, 'projects'::public.app_module, 'update'::public.app_action, _entity, _project_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if _entity_id is null then raise exception 'ENTITY_REQUIRED' using errcode = '22023'; end if;
  if not private.is_assignable_project_member(_project_id, _user_id, _entity_id) then
    raise exception 'NOT_ASSIGNABLE' using errcode = '42501';
  end if;
  if _visibility not in ('internal','limited','project_wide') then
    raise exception 'INVALID_VISIBILITY' using errcode = '22023';
  end if;

  insert into public.project_assignments (
    project_id, stage_id, user_id, entity_id, job_title_ar, job_title_en,
    starts_on, ends_on, visibility, created_by
  ) values (
    _project_id, _stage_id, _user_id, _entity_id,
    btrim(_job_title_ar), btrim(_job_title_en),
    coalesce(_starts_on, current_date), _ends_on,
    _visibility::public.visibility_level, _uid
  ) returning id into _id;

  return _id;
end;
$function$;

create or replace function public.update_project_assignment(
  _assignment_id uuid, _job_title_ar text default null, _job_title_en text default null,
  _stage_id uuid default null, _clear_stage boolean default false,
  _starts_on date default null, _ends_on date default null,
  _visibility text default null, _end_now boolean default false
) returns boolean language plpgsql security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _a record; _entity uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into _a from public.project_assignments where id = _assignment_id;
  if _a is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  select p.entity_id into _entity from public.projects p where p.id = _a.project_id;
  if not private.can(_uid, 'projects'::public.app_module, 'update'::public.app_action, _entity, _a.project_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if _visibility is not null and _visibility not in ('internal','limited','project_wide') then
    raise exception 'INVALID_VISIBILITY' using errcode = '22023';
  end if;

  update public.project_assignments set
    job_title_ar = coalesce(nullif(btrim(coalesce(_job_title_ar,'')),''), job_title_ar),
    job_title_en = coalesce(nullif(btrim(coalesce(_job_title_en,'')),''), job_title_en),
    stage_id = case when _clear_stage then null else coalesce(_stage_id, stage_id) end,
    starts_on = coalesce(_starts_on, starts_on),
    ends_on = case when _end_now then current_date else coalesce(_ends_on, ends_on) end,
    status = case when _end_now then 'ended' else status end,
    visibility = coalesce(_visibility::public.visibility_level, visibility),
    updated_at = now()
  where id = _assignment_id;

  return true;
end;
$function$;

-- ============ 7) last active owner guard ============
create or replace function private.enforce_last_active_owner()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare _entity uuid; _owners int;
begin
  _entity := coalesce(old.entity_id, new.entity_id);
  if _entity is null then return coalesce(new, old); end if;

  -- Serialize every membership mutation for this entity so two concurrent
  -- offboards cannot each observe the other's owner as still active.
  perform pg_advisory_xact_lock(hashtextextended('rakeez_entity_owner:' || _entity::text, 0));

  if tg_op = 'DELETE' or old.role = 'owner' then
    select count(*) into _owners
      from public.entity_memberships m
     where m.entity_id = _entity
       and m.role = 'owner'
       and m.status = 'active'
       and (m.expires_at is null or m.expires_at > now());
    if _owners = 0 then
      raise exception 'LAST_OWNER_PROTECTED' using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_entity_memberships_last_owner on public.entity_memberships;
create constraint trigger trg_entity_memberships_last_owner
  after update or delete on public.entity_memberships
  deferrable initially immediate
  for each row execute function private.enforce_last_active_owner();

-- ============ 8) entity relationships hardening ============
create or replace function public.request_entity_relationship(
  _source_entity_id uuid, _target_slug text, _relationship_type text,
  _ownership_percent numeric default null
) returns uuid language plpgsql security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _target uuid; _id uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = _uid and m.entity_id = _source_entity_id
      and m.status = 'active' and m.role in ('owner','admin')
      and (m.expires_at is null or m.expires_at > now())
  ) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if _relationship_type not in ('owns','subsidiary_of','branch_of','partner_of','controls') then
    raise exception 'INVALID_TYPE' using errcode = '22023';
  end if;
  if _relationship_type in ('owns','controls','subsidiary_of') then
    if _ownership_percent is null or _ownership_percent <= 0 or _ownership_percent > 100 then
      raise exception 'OWNERSHIP_PERCENT_REQUIRED' using errcode = '22023';
    end if;
  else
    _ownership_percent := null;
  end if;

  select p.entity_id into _target
  from public.entity_public_profiles p
  where p.slug = lower(btrim(_target_slug)) and p.is_published = true;

  if _target is null then raise exception 'TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
  if _target = _source_entity_id then raise exception 'INVALID_TARGET' using errcode = '22023'; end if;

  insert into public.entity_relationships (
    source_entity_id, target_entity_id, relationship_type, ownership_percent, created_by
  ) values (_source_entity_id, _target, _relationship_type, _ownership_percent, _uid)
  returning id into _id;
  return _id;
end;
$function$;

create or replace function public.decide_entity_relationship(_relationship_id uuid, _accept boolean)
returns boolean language plpgsql security definer set search_path to '' as $function$
declare _uid uuid := auth.uid(); _target uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select target_entity_id into _target from public.entity_relationships
   where id = _relationship_id and status = 'pending';
  if _target is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = _uid and m.entity_id = _target
      and m.status = 'active' and m.role in ('owner','admin')
      and (m.expires_at is null or m.expires_at > now())
  ) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  update public.entity_relationships
     set status = case when _accept then 'accepted' else 'rejected' end,
         accepted_by = _uid, accepted_at = now(), updated_at = now()
   where id = _relationship_id and status = 'pending';
  return true;
end;
$function$;

-- ============ 9) function EXECUTE hygiene ============
revoke execute on function private.is_assignable_project_member(uuid, uuid, uuid) from public, anon;
revoke execute on function private.enforce_last_active_owner() from public, anon;
grant execute on function private.is_assignable_project_member(uuid, uuid, uuid) to authenticated;

revoke execute on function public.record_document_analysis(uuid, text, text, text, jsonb, jsonb, jsonb, text) from public, anon;
revoke execute on function public.confirm_document_analysis(uuid, uuid, text, uuid, text, text, date, date, numeric, text, text) from public, anon;
revoke execute on function public.abort_document_upload(uuid, text) from public, anon;
revoke execute on function public.list_project_assignable_members(uuid) from public, anon;
revoke execute on function public.create_project_assignment(uuid, uuid, uuid, text, text, uuid, date, date, text) from public, anon;
revoke execute on function public.update_project_assignment(uuid, text, text, uuid, boolean, date, date, text, boolean) from public, anon;
revoke execute on function public.request_entity_relationship(uuid, text, text, numeric) from public, anon;
revoke execute on function public.decide_entity_relationship(uuid, boolean) from public, anon;

grant execute on function public.record_document_analysis(uuid, text, text, text, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.confirm_document_analysis(uuid, uuid, text, uuid, text, text, date, date, numeric, text, text) to authenticated;
grant execute on function public.abort_document_upload(uuid, text) to authenticated;
grant execute on function public.list_project_assignable_members(uuid) to authenticated;
grant execute on function public.create_project_assignment(uuid, uuid, uuid, text, text, uuid, date, date, text) to authenticated;
grant execute on function public.update_project_assignment(uuid, text, text, uuid, boolean, date, date, text, boolean) to authenticated;
grant execute on function public.request_entity_relationship(uuid, text, text, numeric) to authenticated;
grant execute on function public.decide_entity_relationship(uuid, boolean) to authenticated;