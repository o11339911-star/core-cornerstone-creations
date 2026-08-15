-- =========================================================
-- Phase 21 — Entity public profiles
-- =========================================================

create table public.entity_public_profiles (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  slug text not null unique,
  display_name_ar text not null,
  display_name_en text,
  activity_ar text,
  activity_en text,
  services text[] not null default '{}',
  regions text[] not null default '{}',
  bio_ar text,
  bio_en text,
  logo_url text,
  website_url text,
  public_email text,
  public_phone text,
  is_published boolean not null default false,
  portfolio_opt_in boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_public_profiles_slug_ck check (slug ~ '^[a-z0-9\u0600-\u06FF]+(-[a-z0-9\u0600-\u06FF]+)*$' and char_length(slug) between 2 and 80),
  constraint entity_public_profiles_logo_ck check (logo_url is null or logo_url ~* '^https://'),
  constraint entity_public_profiles_site_ck check (website_url is null or website_url ~* '^https?://')
);

grant select, insert, update on public.entity_public_profiles to authenticated;
grant all on public.entity_public_profiles to service_role;

alter table public.entity_public_profiles enable row level security;

create policy "entity managers read own public profile"
  on public.entity_public_profiles for select to authenticated
  using (private.can(auth.uid(), 'members'::app_module, 'view'::app_action, entity_id, null));

create policy "entity managers write own public profile"
  on public.entity_public_profiles for insert to authenticated
  with check (private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, entity_id, null));

create policy "entity managers update own public profile"
  on public.entity_public_profiles for update to authenticated
  using (private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, entity_id, null))
  with check (private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, entity_id, null));

create trigger update_entity_public_profiles_updated_at
  before update on public.entity_public_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- slug generation
create or replace function private.slugify_entity_name(_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s text;
begin
  s := lower(coalesce(_name, ''));
  s := regexp_replace(s, '[\u064B-\u0652\u0640]', '', 'g');
  s := regexp_replace(s, '[^a-z0-9\u0600-\u06FF]+', '-', 'g');
  s := regexp_replace(s, '(^-+)|(-+$)', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');
  if s is null or char_length(s) < 2 then
    s := 'entity';
  end if;
  return left(s, 70);
end;
$$;

create or replace function private.generate_entity_slug(_name text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  base text := private.slugify_entity_name(_name);
  candidate text := base;
  n int := 1;
begin
  while exists (select 1 from public.entity_public_profiles p where p.slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n::text;
  end loop;
  return candidate;
end;
$$;

-- ---------------------------------------------------- public portfolio json
create or replace function private.public_portfolio_json(_entity_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title_ar', e.title_ar,
        'title_en', e.title_en,
        'summary_ar', e.summary_ar,
        'summary_en', e.summary_en,
        'project_type_code', e.project_type_code,
        'city', e.city,
        'district', e.district,
        'completed_on', e.completed_on
      )
      order by e.completed_on desc nulls last
    ),
    '[]'::jsonb
  )
  from public.portfolio_entries e
  where e.entity_id = _entity_id
    and e.is_public = true;
$$;

-- ------------------------------------------------- the public RPC (anon ok)
create or replace function public.get_public_entity_profile(_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', p.slug,
    'display_name_ar', p.display_name_ar,
    'display_name_en', p.display_name_en,
    'activity_ar', p.activity_ar,
    'activity_en', p.activity_en,
    'services', to_jsonb(p.services),
    'regions', to_jsonb(p.regions),
    'bio_ar', p.bio_ar,
    'bio_en', p.bio_en,
    'logo_url', p.logo_url,
    'website_url', p.website_url,
    'public_email', p.public_email,
    'public_phone', p.public_phone,
    'is_verified', (ep.verified_at is not null),
    'portfolio', case when p.portfolio_opt_in
                      then private.public_portfolio_json(p.entity_id)
                      else '[]'::jsonb end
  )
  from public.entity_public_profiles p
  join public.entities e on e.id = p.entity_id
  left join public.entity_profiles ep on ep.entity_id = p.entity_id
  where p.slug = lower(_slug)
    and p.is_published = true
    and e.deleted_at is null
    and e.status = 'active'
  limit 1;
$$;

-- --------------------------------------------------- management functions
create or replace function public.upsert_entity_public_profile(
  _entity_id uuid,
  _display_name_ar text,
  _display_name_en text default null,
  _activity_ar text default null,
  _activity_en text default null,
  _services text[] default '{}',
  _regions text[] default '{}',
  _bio_ar text default null,
  _bio_en text default null,
  _logo_url text default null,
  _website_url text default null,
  _public_email text default null,
  _public_phone text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _slug text;
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.can(_uid, 'members'::app_module, 'manage_members'::app_action, _entity_id, null) then
    raise exception 'FORBIDDEN';
  end if;
  if coalesce(btrim(_display_name_ar), '') = '' then
    raise exception 'DISPLAY_NAME_REQUIRED';
  end if;

  select p.slug into _slug from public.entity_public_profiles p where p.entity_id = _entity_id;
  if _slug is null then
    _slug := private.generate_entity_slug(_display_name_ar);
  end if;

  insert into public.entity_public_profiles as t (
    entity_id, slug, display_name_ar, display_name_en, activity_ar, activity_en,
    services, regions, bio_ar, bio_en, logo_url, website_url, public_email, public_phone
  ) values (
    _entity_id, _slug, btrim(_display_name_ar), _display_name_en, _activity_ar, _activity_en,
    coalesce(_services, '{}'), coalesce(_regions, '{}'), _bio_ar, _bio_en,
    _logo_url, _website_url, _public_email, _public_phone
  )
  on conflict (entity_id) do update set
    display_name_ar = excluded.display_name_ar,
    display_name_en = excluded.display_name_en,
    activity_ar = excluded.activity_ar,
    activity_en = excluded.activity_en,
    services = excluded.services,
    regions = excluded.regions,
    bio_ar = excluded.bio_ar,
    bio_en = excluded.bio_en,
    logo_url = excluded.logo_url,
    website_url = excluded.website_url,
    public_email = excluded.public_email,
    public_phone = excluded.public_phone;

  return _slug;
end;
$$;

create or replace function public.set_entity_public_publish(
  _entity_id uuid,
  _is_published boolean,
  _portfolio_opt_in boolean default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.can(_uid, 'members'::app_module, 'manage_members'::app_action, _entity_id, null) then
    raise exception 'FORBIDDEN';
  end if;

  update public.entity_public_profiles
     set is_published = _is_published,
         portfolio_opt_in = coalesce(_portfolio_opt_in, portfolio_opt_in),
         published_at = case when _is_published and published_at is null then now() else published_at end
   where entity_id = _entity_id;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  insert into public.permission_audit_log (actor_id, action, object_type, object_id, entity_id, metadata)
  values (_uid, 'status_change', 'entity_public_profiles', _entity_id, _entity_id,
          jsonb_build_object('is_published', _is_published, 'portfolio_opt_in', _portfolio_opt_in));

  return true;
end;
$$;

create or replace function public.set_entity_slug(_entity_id uuid, _slug text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _clean text;
begin
  if _uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.can(_uid, 'members'::app_module, 'manage_members'::app_action, _entity_id, null) then
    raise exception 'FORBIDDEN';
  end if;

  _clean := private.slugify_entity_name(_slug);
  if exists (select 1 from public.entity_public_profiles p
              where p.slug = _clean and p.entity_id <> _entity_id) then
    _clean := private.generate_entity_slug(_clean);
  end if;

  update public.entity_public_profiles set slug = _clean where entity_id = _entity_id;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  return _clean;
end;
$$;

-- extend audit log object types
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions','contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts','project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions','observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results','requests','request_messages','property_services','documents','document_versions','document_links','document_audience','reports','report_versions','report_templates','report_assets','report_template_imports','platform_admins','payment_milestones','disbursement_requests','financial_executions','financial_documents','retention_holds','ledger_entries','projects','project_acceptances','project_closure_items','punch_items','warranties','project_reopen_requests','portfolio_entries','platform_queue_item','platform_staff','platform_case_access','platform_breakglass','entity_public_profiles']));

-- ------------------------------------------------------- privilege hygiene
revoke all on function private.slugify_entity_name(text) from public;
revoke all on function private.generate_entity_slug(text) from public;
revoke all on function private.public_portfolio_json(uuid) from public;
revoke all on function public.get_public_entity_profile(text) from public;
revoke all on function public.upsert_entity_public_profile(uuid,text,text,text,text,text[],text[],text,text,text,text,text,text) from public;
revoke all on function public.set_entity_public_publish(uuid,boolean,boolean) from public;
revoke all on function public.set_entity_slug(uuid,text) from public;

-- intentional public read endpoint (allowlist-only projection)
grant execute on function public.get_public_entity_profile(text) to anon, authenticated;
grant execute on function public.upsert_entity_public_profile(uuid,text,text,text,text,text[],text[],text,text,text,text,text,text) to authenticated;
grant execute on function public.set_entity_public_publish(uuid,boolean,boolean) to authenticated;
grant execute on function public.set_entity_slug(uuid,text) to authenticated;

revoke insert, update, delete, truncate on public.entity_public_profiles from anon;
revoke select on public.entity_public_profiles from anon;
revoke delete, truncate on public.entity_public_profiles from authenticated;