-- ============================================================
-- Original-command closure: entities, deeds/licences, analyses
-- ============================================================

-- ---------- helpers ----------
create or replace function private.is_ascii_digits(_v text, _min int, _max int)
returns boolean language sql immutable set search_path = '' as $$
  select _v is null
      or (_v ~ ('^[0-9]{' || _min::text || ',' || _max::text || '}$'));
$$;

revoke execute on function private.is_ascii_digits(text,int,int) from public;
grant execute on function private.is_ascii_digits(text,int,int) to authenticated;

-- ---------- entities.type allowlist ----------
alter table public.entities drop constraint if exists entities_type_check;
alter table public.entities add constraint entities_type_check
  check (type = any (array['developer','contractor','company','design_office','supervision','inspector']));

-- ---------- entity_profiles expansion ----------
alter table public.entity_profiles
  add column if not exists legal_form text,
  add column if not exists unified_national_number text,
  add column if not exists tax_number text,
  add column if not exists building_no text,
  add column if not exists street text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists additional_no text,
  add column if not exists responsible_name text,
  add column if not exists responsible_title text,
  add column if not exists responsible_email text,
  add column if not exists responsible_phone text,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_note text;

alter table public.entity_profiles drop constraint if exists entity_profiles_legal_form_check;
alter table public.entity_profiles add constraint entity_profiles_legal_form_check
  check (legal_form is null or legal_form = any (array['individual','company','establishment','government','association','fund','partnership']));

alter table public.entity_profiles drop constraint if exists entity_profiles_verification_status_check;
alter table public.entity_profiles add constraint entity_profiles_verification_status_check
  check (verification_status = any (array['pending','verified','rejected']));

alter table public.entity_profiles drop constraint if exists entity_profiles_official_digits_check;
alter table public.entity_profiles add constraint entity_profiles_official_digits_check
  check (
    private.is_ascii_digits(nullif(btrim(coalesce(unified_national_number,'')),''), 10, 15)
    and private.is_ascii_digits(nullif(btrim(coalesce(cr_number,'')),''), 10, 15)
    and private.is_ascii_digits(nullif(btrim(coalesce(tax_number,'')),''), 15, 15)
    and private.is_ascii_digits(nullif(btrim(coalesce(building_no,'')),''), 1, 8)
    and private.is_ascii_digits(nullif(btrim(coalesce(postal_code,'')),''), 5, 5)
    and private.is_ascii_digits(nullif(btrim(coalesce(additional_no,'')),''), 4, 4)
  );

create unique index if not exists entity_profiles_unn_uidx
  on public.entity_profiles (unified_national_number)
  where nullif(btrim(coalesce(unified_national_number,'')),'') is not null;
create unique index if not exists entity_profiles_cr_uidx
  on public.entity_profiles (cr_number)
  where nullif(btrim(coalesce(cr_number,'')),'') is not null;
create unique index if not exists entity_profiles_tax_uidx
  on public.entity_profiles (tax_number)
  where nullif(btrim(coalesce(tax_number,'')),'') is not null;

-- verification fields are never writable by ordinary members
create or replace function private.tg_guard_entity_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.verification_status := 'pending';
    new.verification_note := null;
    new.verified_at := null;
    new.verified_by := null;
    return new;
  end if;

  if not public.am_i_platform_admin() then
    new.verification_status := old.verification_status;
    new.verification_note := old.verification_note;
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
  end if;
  return new;
end;
$$;

revoke execute on function private.tg_guard_entity_verification() from public;

drop trigger if exists guard_entity_verification on public.entity_profiles;
create trigger guard_entity_verification
  before insert or update on public.entity_profiles
  for each row execute function private.tg_guard_entity_verification();

-- ---------- atomic entity creation ----------
create or replace function public.create_entity_with_owner(
  _name text,
  _type text,
  _legal_form text,
  _legal_name_ar text default null,
  _legal_name_en text default null,
  _unified_national_number text default null,
  _cr_number text default null,
  _tax_number text default null,
  _contact_email text default null,
  _contact_phone text default null,
  _building_no text default null,
  _street text default null,
  _district text default null,
  _city text default null,
  _postal_code text default null,
  _additional_no text default null,
  _responsible_name text default null,
  _responsible_title text default null,
  _responsible_email text default null,
  _responsible_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  _uid uuid := auth.uid();
  _entity_id uuid;
  _owned int;
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if _type is null or _type not in ('developer','contractor','company','design_office','supervision','inspector') then
    raise exception 'INVALID_TYPE' using errcode = '22023';
  end if;
  if _legal_form is null or _legal_form not in ('individual','company','establishment','government','association','fund','partnership') then
    raise exception 'INVALID_LEGAL_FORM' using errcode = '22023';
  end if;
  if _name is null or length(btrim(_name)) < 2 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  select count(*) into _owned
  from public.entity_memberships m
  join public.entities e on e.id = m.entity_id and e.deleted_at is null
  where m.user_id = _uid and m.role = 'owner' and m.status = 'active';

  if _owned >= 10 then
    raise exception 'ENTITY_LIMIT_REACHED' using errcode = '42501';
  end if;

  insert into public.entities (name, type, status)
  values (btrim(_name), _type, 'active')
  returning id into _entity_id;

  begin
    insert into public.entity_profiles (
      entity_id, legal_form, legal_name_ar, legal_name_en,
      unified_national_number, cr_number, tax_number,
      contact_email, contact_phone,
      building_no, street, district, city, postal_code, additional_no,
      responsible_name, responsible_title, responsible_email, responsible_phone
    ) values (
      _entity_id, _legal_form, nullif(btrim(coalesce(_legal_name_ar,'')),''), nullif(btrim(coalesce(_legal_name_en,'')),''),
      nullif(btrim(coalesce(_unified_national_number,'')),''), nullif(btrim(coalesce(_cr_number,'')),''), nullif(btrim(coalesce(_tax_number,'')),''),
      nullif(btrim(coalesce(_contact_email,'')),''), nullif(btrim(coalesce(_contact_phone,'')),''),
      nullif(btrim(coalesce(_building_no,'')),''), nullif(btrim(coalesce(_street,'')),''), nullif(btrim(coalesce(_district,'')),''),
      nullif(btrim(coalesce(_city,'')),''), nullif(btrim(coalesce(_postal_code,'')),''), nullif(btrim(coalesce(_additional_no,'')),''),
      nullif(btrim(coalesce(_responsible_name,'')),''), nullif(btrim(coalesce(_responsible_title,'')),''),
      nullif(btrim(coalesce(_responsible_email,'')),''), nullif(btrim(coalesce(_responsible_phone,'')),'')
    );
  exception when unique_violation then
    raise exception 'OFFICIAL_ID_ALREADY_REGISTERED' using errcode = '23505';
  end;

  insert into public.entity_memberships (entity_id, user_id, role, status)
  values (_entity_id, _uid, 'owner', 'active');

  return _entity_id;
end;
$$;

revoke execute on function public.create_entity_with_owner(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.create_entity_with_owner(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- ---------- safe official update ----------
create or replace function public.update_entity_official(
  _entity_id uuid,
  _legal_form text default null,
  _legal_name_ar text default null,
  _legal_name_en text default null,
  _unified_national_number text default null,
  _cr_number text default null,
  _tax_number text default null,
  _contact_email text default null,
  _contact_phone text default null,
  _building_no text default null,
  _street text default null,
  _district text default null,
  _city text default null,
  _postal_code text default null,
  _additional_no text default null,
  _responsible_name text default null,
  _responsible_title text default null,
  _responsible_email text default null,
  _responsible_phone text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = _uid and m.entity_id = _entity_id
      and m.status = 'active' and m.role in ('owner','admin')
      and (m.expires_at is null or m.expires_at > now())
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if _legal_form is not null and _legal_form not in ('individual','company','establishment','government','association','fund','partnership') then
    raise exception 'INVALID_LEGAL_FORM' using errcode = '22023';
  end if;

  begin
    update public.entity_profiles set
      legal_form = coalesce(_legal_form, legal_form),
      legal_name_ar = coalesce(nullif(btrim(coalesce(_legal_name_ar,'')),''), legal_name_ar),
      legal_name_en = coalesce(nullif(btrim(coalesce(_legal_name_en,'')),''), legal_name_en),
      unified_national_number = coalesce(nullif(btrim(coalesce(_unified_national_number,'')),''), unified_national_number),
      cr_number = coalesce(nullif(btrim(coalesce(_cr_number,'')),''), cr_number),
      tax_number = coalesce(nullif(btrim(coalesce(_tax_number,'')),''), tax_number),
      contact_email = coalesce(nullif(btrim(coalesce(_contact_email,'')),''), contact_email),
      contact_phone = coalesce(nullif(btrim(coalesce(_contact_phone,'')),''), contact_phone),
      building_no = coalesce(nullif(btrim(coalesce(_building_no,'')),''), building_no),
      street = coalesce(nullif(btrim(coalesce(_street,'')),''), street),
      district = coalesce(nullif(btrim(coalesce(_district,'')),''), district),
      city = coalesce(nullif(btrim(coalesce(_city,'')),''), city),
      postal_code = coalesce(nullif(btrim(coalesce(_postal_code,'')),''), postal_code),
      additional_no = coalesce(nullif(btrim(coalesce(_additional_no,'')),''), additional_no),
      responsible_name = coalesce(nullif(btrim(coalesce(_responsible_name,'')),''), responsible_name),
      responsible_title = coalesce(nullif(btrim(coalesce(_responsible_title,'')),''), responsible_title),
      responsible_email = coalesce(nullif(btrim(coalesce(_responsible_email,'')),''), responsible_email),
      responsible_phone = coalesce(nullif(btrim(coalesce(_responsible_phone,'')),''), responsible_phone),
      updated_at = now()
    where entity_id = _entity_id;
  exception when unique_violation then
    raise exception 'OFFICIAL_ID_ALREADY_REGISTERED' using errcode = '23505';
  end;

  return true;
end;
$$;

revoke execute on function public.update_entity_official(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_entity_official(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

-- no direct writes to entities / entity_profiles / memberships
revoke insert, update, delete, truncate on public.entities from anon, authenticated;
revoke insert, update, delete, truncate on public.entity_profiles from anon, authenticated;
revoke insert, delete, truncate on public.entity_memberships from anon, authenticated;
revoke select on public.entity_profiles from anon;

-- ---------- entity relationships ----------
create table if not exists public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  source_entity_id uuid not null references public.entities(id) on delete cascade,
  target_entity_id uuid not null references public.entities(id) on delete cascade,
  relationship_type text not null check (relationship_type = any (array['owns','subsidiary_of','branch_of','partner_of','controls'])),
  ownership_percent numeric(5,2) check (ownership_percent is null or (ownership_percent > 0 and ownership_percent <= 100)),
  status text not null default 'pending' check (status = any (array['pending','accepted','rejected'])),
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid not null,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_relationships_distinct check (source_entity_id <> target_entity_id)
);

create unique index if not exists entity_relationships_uidx
  on public.entity_relationships (source_entity_id, target_entity_id, relationship_type)
  where status <> 'rejected';
create index if not exists entity_relationships_target_idx on public.entity_relationships (target_entity_id, status);

grant select on public.entity_relationships to authenticated;
grant all on public.entity_relationships to service_role;
alter table public.entity_relationships enable row level security;

drop policy if exists entity_relationships_select on public.entity_relationships;
create policy entity_relationships_select on public.entity_relationships
  for select to authenticated
  using (
    private.is_entity_member(auth.uid(), source_entity_id)
    or private.is_entity_member(auth.uid(), target_entity_id)
  );

create or replace function public.request_entity_relationship(
  _source_entity_id uuid,
  _target_slug text,
  _relationship_type text,
  _ownership_percent numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  _uid uuid := auth.uid();
  _target uuid;
  _id uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.entity_memberships m
    where m.user_id = _uid and m.entity_id = _source_entity_id
      and m.status = 'active' and m.role in ('owner','admin')
  ) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if _relationship_type not in ('owns','subsidiary_of','branch_of','partner_of','controls') then
    raise exception 'INVALID_TYPE' using errcode = '22023';
  end if;

  select p.entity_id into _target
  from public.entity_public_profiles p
  where p.slug = lower(btrim(_target_slug)) and p.is_published = true;

  -- A private or missing entity is indistinguishable on purpose.
  if _target is null then raise exception 'TARGET_NOT_FOUND' using errcode = 'P0002'; end if;
  if _target = _source_entity_id then raise exception 'INVALID_TARGET' using errcode = '22023'; end if;

  insert into public.entity_relationships (
    source_entity_id, target_entity_id, relationship_type, ownership_percent, created_by
  ) values (_source_entity_id, _target, _relationship_type, _ownership_percent, _uid)
  returning id into _id;

  return _id;
end;
$$;

revoke execute on function public.request_entity_relationship(uuid,text,text,numeric) from public, anon;
grant execute on function public.request_entity_relationship(uuid,text,text,numeric) to authenticated;

create or replace function public.decide_entity_relationship(_relationship_id uuid, _accept boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
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
  ) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  update public.entity_relationships
     set status = case when _accept then 'accepted' else 'rejected' end,
         accepted_by = _uid, accepted_at = now(), updated_at = now()
   where id = _relationship_id;
  return true;
end;
$$;

revoke execute on function public.decide_entity_relationship(uuid,boolean) from public, anon;
grant execute on function public.decide_entity_relationship(uuid,boolean) to authenticated;

-- ---------- property additive fields ----------
alter table public.properties
  add column if not exists region text,
  add column if not exists address text,
  add column if not exists frontage text,
  add column if not exists streets text,
  add column if not exists land_use text;

-- ---------- deed / licence version <-> document version ----------
alter table public.deed_versions
  add column if not exists document_version_id uuid references public.document_versions(id) on delete set null;
alter table public.license_versions
  add column if not exists document_version_id uuid references public.document_versions(id) on delete set null;
create index if not exists deed_versions_docver_idx on public.deed_versions (document_version_id);
create index if not exists license_versions_docver_idx on public.license_versions (document_version_id);

-- ---------- document categories ----------
insert into public.document_categories (code, name_ar, name_en, group_code, allowed_mime, max_size_mb, is_active, order_index)
values
  ('deed', 'صك ملكية', 'Title deed', 'official', array['application/pdf','image/jpeg','image/png'], 20, true, 10),
  ('building_license', 'رخصة بناء', 'Building licence', 'official', array['application/pdf','image/jpeg','image/png'], 20, true, 11),
  ('entity_registration', 'سجل الكيان', 'Entity registration', 'official', array['application/pdf','image/jpeg','image/png'], 20, true, 12),
  ('tax_certificate', 'شهادة ضريبية', 'Tax certificate', 'official', array['application/pdf','image/jpeg','image/png'], 20, true, 13),
  ('national_address', 'العنوان الوطني', 'National address', 'official', array['application/pdf','image/jpeg','image/png'], 20, true, 14)
on conflict (code) do nothing;

-- ---------- document analyses ----------
create table if not exists public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  status text not null default 'processing'
    check (status = any (array['processing','review_required','confirmed','rejected','failed'])),
  engine text not null check (engine = any (array['pdf_text','ocr_tesseract','manual'])),
  detected_type text check (detected_type = any (array['deed','building_license','plan','other'])),
  extracted_fields jsonb not null default '{}'::jsonb,
  field_confidence jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  failure_reason text,
  review_note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);

create index if not exists document_analyses_doc_idx on public.document_analyses (document_id, created_at desc);
create index if not exists document_analyses_version_idx on public.document_analyses (document_version_id);

grant select on public.document_analyses to authenticated;
grant all on public.document_analyses to service_role;
alter table public.document_analyses enable row level security;

drop policy if exists document_analyses_select on public.document_analyses;
create policy document_analyses_select on public.document_analyses
  for select to authenticated
  using (private.can_access_document(auth.uid(), document_id, 'view'::public.app_action));

create or replace function public.record_document_analysis(
  _document_version_id uuid,
  _engine text,
  _status text,
  _detected_type text default null,
  _extracted_fields jsonb default '{}'::jsonb,
  _field_confidence jsonb default '{}'::jsonb,
  _conflicts jsonb default '[]'::jsonb,
  _failure_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
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

  insert into public.document_analyses (
    document_id, document_version_id, status, engine, detected_type,
    extracted_fields, field_confidence, conflicts, failure_reason, created_by
  ) values (
    _doc, _document_version_id, _status, _engine, _detected_type,
    coalesce(_extracted_fields,'{}'::jsonb), coalesce(_field_confidence,'{}'::jsonb),
    coalesce(_conflicts,'[]'::jsonb), _failure_reason, _uid
  ) returning id into _id;

  return _id;
end;
$$;

revoke execute on function public.record_document_analysis(uuid,text,text,text,jsonb,jsonb,jsonb,text) from public, anon;
grant execute on function public.record_document_analysis(uuid,text,text,text,jsonb,jsonb,jsonb,text) to authenticated;

create or replace function public.confirm_document_analysis(
  _analysis_id uuid,
  _property_id uuid,
  _target text,
  _head_id uuid default null,
  _number text default null,
  _issuer text default null,
  _date_1 date default null,
  _date_2 date default null,
  _area numeric default null,
  _owner_snapshot text default null,
  _scope_text text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  _uid uuid := auth.uid();
  _a record;
  _head uuid := _head_id;
  _version uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into _a from public.document_analyses where id = _analysis_id;
  if _a is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if _a.status <> 'review_required' then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  if not private.can_manage_document(_uid, _a.document_id) then
    raise exception 'FORBIDDEN_DOCUMENT' using errcode = '42501';
  end if;
  if not private.can_manage_property(_uid, _property_id) then
    raise exception 'FORBIDDEN_PROPERTY' using errcode = '42501';
  end if;
  if _number is not null and _number !~ '^[0-9A-Za-z/\-]{1,60}$' then
    raise exception 'INVALID_NUMBER' using errcode = '22023';
  end if;

  if _target = 'deed' then
    if _head is null then
      insert into public.deeds (property_id, deed_number, issuer, created_by)
      values (_property_id, _number, _issuer, _uid) returning id into _head;
    else
      update public.deeds
         set deed_number = coalesce(_number, deed_number),
             issuer = coalesce(_issuer, issuer),
             updated_at = now()
       where id = _head and property_id = _property_id;
      if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    end if;

    insert into public.deed_versions (
      deed_id, version_no, deed_date, area, owner_name_snapshot,
      source, document_version_id, created_by
    ) values (_head, 1, _date_1, _area, _owner_snapshot, 'extracted', _a.document_version_id, _uid)
    returning id into _version;

  elsif _target = 'building_license' then
    if _head is null then
      insert into public.building_licenses (property_id, license_number, authority, created_by)
      values (_property_id, _number, _issuer, _uid) returning id into _head;
    else
      update public.building_licenses
         set license_number = coalesce(_number, license_number),
             authority = coalesce(_issuer, authority),
             updated_at = now()
       where id = _head and property_id = _property_id;
      if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
    end if;

    insert into public.license_versions (
      license_id, version_no, issued_on, expires_on, scope_text,
      source, document_version_id, created_by
    ) values (_head, 1, _date_1, _date_2, _scope_text, 'extracted', _a.document_version_id, _uid)
    returning id into _version;
  else
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  insert into public.document_links (document_id, context_type, context_id, relation, linked_by)
  values (_a.document_id, 'property', _property_id, 'attachment', _uid)
  on conflict do nothing;

  update public.document_analyses
     set status = 'confirmed', reviewed_by = _uid, reviewed_at = now()
   where id = _analysis_id;

  return _version;
end;
$$;

revoke execute on function public.confirm_document_analysis(uuid,uuid,text,uuid,text,text,date,date,numeric,text,text) from public, anon;
grant execute on function public.confirm_document_analysis(uuid,uuid,text,uuid,text,text,date,date,numeric,text,text) to authenticated;

create or replace function public.reject_document_analysis(_analysis_id uuid, _reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _doc uuid;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select document_id into _doc from public.document_analyses
   where id = _analysis_id and status = 'review_required';
  if _doc is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_document(_uid, _doc) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.document_analyses
     set status = 'rejected', review_note = left(coalesce(_reason,''), 500),
         reviewed_by = _uid, reviewed_at = now()
   where id = _analysis_id;
  return true;
end;
$$;

revoke execute on function public.reject_document_analysis(uuid,text) from public, anon;
grant execute on function public.reject_document_analysis(uuid,text) to authenticated;

-- ---------- safe team directory ----------
create or replace function public.list_entity_team(_entity_id uuid)
returns table (
  membership_id uuid,
  full_name text,
  email text,
  phone text,
  role public.app_role,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  is_self boolean
)
language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _privileged boolean;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.is_entity_member(_uid, _entity_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.entity_memberships m
    where m.user_id = _uid and m.entity_id = _entity_id
      and m.status = 'active' and m.role in ('owner','admin')
  ) or private.can(_uid, 'members'::public.app_module, 'manage_members'::public.app_action, _entity_id, null)
  into _privileged;

  return query
  select m.id,
         coalesce(p.full_name, 'عضو'),
         case when _privileged or m.user_id = _uid then u.email::text else null end,
         case when _privileged or m.user_id = _uid then p.phone else null end,
         m.role,
         m.status,
         m.expires_at,
         m.created_at,
         (m.user_id = _uid)
    from public.entity_memberships m
    left join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
   where m.entity_id = _entity_id
   order by m.created_at asc;
end;
$$;

revoke execute on function public.list_entity_team(uuid) from public, anon;
grant execute on function public.list_entity_team(uuid) to authenticated;

-- ---------- entity profile read (own entity only) ----------
create or replace function public.get_entity_official(_entity_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare _uid uuid := auth.uid(); _row jsonb;
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.is_entity_member(_uid, _entity_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select to_jsonb(x) into _row from (
    select e.name, e.type, e.status,
           p.legal_form, p.legal_name_ar, p.legal_name_en,
           p.unified_national_number, p.cr_number, p.tax_number,
           p.contact_email, p.contact_phone,
           p.building_no, p.street, p.district, p.city, p.postal_code, p.additional_no,
           p.responsible_name, p.responsible_title, p.responsible_email, p.responsible_phone,
           p.verification_status, p.verification_note, p.verified_at
      from public.entities e
      left join public.entity_profiles p on p.entity_id = e.id
     where e.id = _entity_id
  ) x;

  return _row;
end;
$$;

revoke execute on function public.get_entity_official(uuid) from public, anon;
grant execute on function public.get_entity_official(uuid) to authenticated;

-- ---------- policy-function execute audit fix ----------
grant execute on function private.is_entity_member(uuid,uuid) to authenticated;
grant execute on function private.can_access_document(uuid,uuid,public.app_action) to authenticated;
grant execute on function private.can_manage_document(uuid,uuid) to authenticated;
grant execute on function private.can_manage_property(uuid,uuid) to authenticated;