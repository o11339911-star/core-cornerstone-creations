alter table public.document_analyses
  add column if not exists attempt_no int not null default 1,
  add column if not exists original_fields jsonb not null default '{}'::jsonb,
  add column if not exists corrected_fields jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists analysis_confirmed_at timestamptz,
  add column if not exists analysis_confirmed_by uuid references auth.users(id) on delete set null;

alter table public.document_analyses drop constraint if exists document_analyses_detected_type_check;
alter table public.document_analyses add constraint document_analyses_detected_type_check
  check (detected_type is null or detected_type = any (array['deed','building_license','property_doc','identity','plan','other']));

alter table public.document_analyses drop constraint if exists document_analyses_original_object;
alter table public.document_analyses add constraint document_analyses_original_object
  check (jsonb_typeof(original_fields) = 'object' and pg_column_size(original_fields) <= 65536);
alter table public.document_analyses drop constraint if exists document_analyses_corrected_object;
alter table public.document_analyses add constraint document_analyses_corrected_object
  check (jsonb_typeof(corrected_fields) = 'object' and pg_column_size(corrected_fields) <= 65536);

-- keep only the newest analysis row per version, then enforce one row per version
delete from public.document_analyses a
 using public.document_analyses b
 where a.document_version_id = b.document_version_id
   and a.created_at < b.created_at;

create unique index if not exists document_analyses_version_uidx
  on public.document_analyses (document_version_id);

create or replace function public.start_document_analysis(
  _document_version_id uuid,
  _retry boolean default false
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare _uid uuid := auth.uid(); _doc uuid; _row record; _id uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select document_id into _doc from public.document_versions where id = _document_version_id;
  if _doc is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_document(_uid, _doc) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into _row from public.document_analyses
   where document_version_id = _document_version_id for update;

  if _row is null then
    insert into public.document_analyses (
      document_id, document_version_id, status, engine, created_by, started_at
    ) values (_doc, _document_version_id, 'processing', 'manual', _uid, now())
    returning id into _id;
    return _id;
  end if;

  if _row.status = 'confirmed' then
    raise exception 'ALREADY_CONFIRMED' using errcode = '22023';
  end if;

  -- idempotency: no duplicate job for the same version unless retry is explicit
  if not _retry then
    return _row.id;
  end if;

  update public.document_analyses
     set status = 'processing',
         attempt_no = attempt_no + 1,
         engine = 'manual',
         detected_type = null,
         extracted_fields = '{}'::jsonb,
         field_confidence = '{}'::jsonb,
         conflicts = '[]'::jsonb,
         failure_reason = null,
         review_note = null,
         reviewed_by = null,
         reviewed_at = null,
         started_at = now(),
         completed_at = null
   where id = _row.id;
  return _row.id;
end;
$function$;

create or replace function public.complete_document_analysis(
  _analysis_id uuid,
  _engine text,
  _status text,
  _detected_type text default null,
  _extracted_fields jsonb default '{}'::jsonb,
  _field_confidence jsonb default '{}'::jsonb,
  _conflicts jsonb default '[]'::jsonb,
  _failure_reason text default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare _uid uuid := auth.uid(); _row record;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into _row from public.document_analyses where id = _analysis_id for update;
  if _row is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_document(_uid, _row.document_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if _row.status <> 'processing' then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  if _status not in ('review_required','failed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;
  if coalesce(_engine,'') not in ('pdf_text','ocr_tesseract','manual') then
    raise exception 'INVALID_ENGINE' using errcode = '22023';
  end if;
  if _detected_type is not null and _detected_type not in
     ('deed','building_license','property_doc','identity','plan','other') then
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

  update public.document_analyses
     set status = _status,
         engine = _engine,
         detected_type = _detected_type,
         extracted_fields = coalesce(_extracted_fields,'{}'::jsonb),
         original_fields = coalesce(_extracted_fields,'{}'::jsonb),
         field_confidence = coalesce(_field_confidence,'{}'::jsonb),
         conflicts = coalesce(_conflicts,'[]'::jsonb),
         failure_reason = left(coalesce(_failure_reason,''), 300),
         completed_at = now()
   where id = _analysis_id;
  return _status;
end;
$function$;

create or replace function public.confirm_document_analysis(
  _analysis_id uuid, _property_id uuid, _target text, _head_id uuid default null::uuid,
  _number text default null::text, _issuer text default null::text,
  _date_1 date default null::date, _date_2 date default null::date,
  _area numeric default null::numeric, _owner_snapshot text default null::text,
  _scope_text text default null::text, _corrected_fields jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _uid uuid := auth.uid();
  _a record;
  _head uuid := _head_id;
  _version uuid;
  _next int;
  _corr jsonb := coalesce(_corrected_fields, '{}'::jsonb);
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into _a from public.document_analyses where id = _analysis_id for update;
  if _a is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  -- server-side stage gate: analysis must have completed successfully first
  if _a.status <> 'review_required' or _a.completed_at is null then
    raise exception 'ANALYSIS_NOT_COMPLETED' using errcode = '22023';
  end if;
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
  if jsonb_typeof(_corr) <> 'object' or pg_column_size(_corr) > 65536 then
    raise exception 'INVALID_PAYLOAD_SHAPE' using errcode = '22023';
  end if;

  update public.document_analyses
     set status = 'confirmed',
         reviewed_by = _uid,
         reviewed_at = now(),
         analysis_confirmed_by = _uid,
         analysis_confirmed_at = now(),
         corrected_fields = _corr
   where id = _analysis_id and status = 'review_required';
  if not found then raise exception 'ANALYSIS_NOT_COMPLETED' using errcode = '22023'; end if;

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

revoke all on function public.start_document_analysis(uuid, boolean) from public, anon;
revoke all on function public.complete_document_analysis(uuid, text, text, text, jsonb, jsonb, jsonb, text) from public, anon;
revoke all on function public.confirm_document_analysis(uuid, uuid, text, uuid, text, text, date, date, numeric, text, text, jsonb) from public, anon;
grant execute on function public.start_document_analysis(uuid, boolean) to authenticated;
grant execute on function public.complete_document_analysis(uuid, text, text, text, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.confirm_document_analysis(uuid, uuid, text, uuid, text, text, date, date, numeric, text, text, jsonb) to authenticated;