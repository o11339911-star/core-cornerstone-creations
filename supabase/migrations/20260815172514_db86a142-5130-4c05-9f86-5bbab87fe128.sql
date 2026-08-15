-- ============================================================
-- Phase 26 — Legal & privacy readiness
-- ============================================================

-- 1) Legal documents -----------------------------------------------------
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('privacy','terms','ip','complaints')),
  title_ar text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.legal_documents to anon, authenticated;
grant all on public.legal_documents to service_role;
alter table public.legal_documents enable row level security;
create policy legal_documents_public_read on public.legal_documents for select to anon, authenticated using (true);

create table public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  version text not null,
  body_md text not null,
  effective_date date not null,
  published_at timestamptz,
  requires_acceptance boolean not null default true,
  is_current boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version)
);
create unique index legal_document_versions_current_uk
  on public.legal_document_versions (document_id) where is_current;
grant select on public.legal_document_versions to anon, authenticated;
grant all on public.legal_document_versions to service_role;
alter table public.legal_document_versions enable row level security;
create policy legal_versions_public_read on public.legal_document_versions
  for select to anon, authenticated using (published_at is not null);

-- 2) Policy acceptances --------------------------------------------------
create table public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  version_id uuid not null references public.legal_document_versions(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  context text not null default 'login_gate' check (context in ('login_gate','invite_accept','signup')),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  unique (user_id, version_id)
);
grant select on public.policy_acceptances to authenticated;
grant all on public.policy_acceptances to service_role;
alter table public.policy_acceptances enable row level security;
create policy policy_acceptances_read on public.policy_acceptances
  for select to authenticated
  using (user_id = auth.uid() or private.is_platform_staff(auth.uid()));

-- 3) Data processing register -------------------------------------------
create table public.data_processing_register (
  id uuid primary key default gen_random_uuid(),
  activity_code text not null unique,
  module public.app_module not null,
  activity_ar text not null,
  purpose_ar text not null,
  legal_basis_ar text not null,
  data_categories text[] not null default '{}',
  subject_categories text[] not null default '{}',
  recipients text[] not null default '{}',
  retention_period_ar text not null,
  retention_months integer,
  deletion_mechanism_ar text not null,
  backing_objects text[] not null default '{}',
  cross_border boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.data_processing_register to authenticated;
grant all on public.data_processing_register to service_role;
alter table public.data_processing_register enable row level security;
create policy dpr_staff_read on public.data_processing_register
  for select to authenticated
  using (private.can(auth.uid(), 'privacy'::public.app_module, 'view'::public.app_action, null, null));

-- 4) DPIA ----------------------------------------------------------------
create table public.dpia_register (
  id uuid primary key default gen_random_uuid(),
  module public.app_module not null,
  scope_code text not null unique,
  scope_ar text not null,
  risk_level text not null default 'high' check (risk_level in ('high','medium','low')),
  risks jsonb not null default '[]'::jsonb,
  residual_risk_ar text not null,
  assessed_at date not null default current_date,
  review_due_at date,
  assessed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.dpia_register to authenticated;
grant all on public.dpia_register to service_role;
alter table public.dpia_register enable row level security;
create policy dpia_staff_read on public.dpia_register
  for select to authenticated
  using (private.can(auth.uid(), 'privacy'::public.app_module, 'view'::public.app_action, null, null));

create table public.dpia_controls (
  id uuid primary key default gen_random_uuid(),
  dpia_id uuid not null references public.dpia_register(id) on delete cascade,
  control_type text not null check (control_type in ('rls_policy','db_function','constraint','trigger','app_guard','storage_policy')),
  object_name text not null,
  description_ar text not null,
  effectiveness_ar text not null default 'فعّال',
  created_at timestamptz not null default now()
);
grant select on public.dpia_controls to authenticated;
grant all on public.dpia_controls to service_role;
alter table public.dpia_controls enable row level security;
create policy dpia_controls_staff_read on public.dpia_controls
  for select to authenticated
  using (private.can(auth.uid(), 'privacy'::public.app_module, 'view'::public.app_action, null, null));

-- 5) DSR requests --------------------------------------------------------
create table public.dsr_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('access','rectification','erasure','export')),
  status text not null default 'submitted'
    check (status in ('submitted','identity_verification','in_review','fulfilled','partially_fulfilled','rejected','closed')),
  details_ar text not null,
  identity_verified_at timestamptz,
  identity_method text,
  decision_ar text,
  restriction_reasons text[] not null default '{}',
  result_ref jsonb,
  queue_item_id uuid references public.platform_queue_items(id) on delete set null,
  due_at timestamptz not null default (now() + interval '30 days'),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.dsr_requests to authenticated;
grant all on public.dsr_requests to service_role;
alter table public.dsr_requests enable row level security;
create policy dsr_read on public.dsr_requests
  for select to authenticated
  using (user_id = auth.uid()
     or private.can(auth.uid(), 'privacy'::public.app_module, 'view'::public.app_action, null, null));

create table public.dsr_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.dsr_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid,
  note_ar text,
  created_at timestamptz not null default now()
);
grant select on public.dsr_request_events to authenticated;
grant all on public.dsr_request_events to service_role;
alter table public.dsr_request_events enable row level security;
create policy dsr_events_read on public.dsr_request_events
  for select to authenticated
  using (exists (
    select 1 from public.dsr_requests r
    where r.id = request_id
      and (r.user_id = auth.uid()
        or private.can(auth.uid(), 'privacy'::public.app_module, 'view'::public.app_action, null, null))
  ));

-- 6) Data incidents ------------------------------------------------------
create table public.data_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  detected_at timestamptz not null default now(),
  contained_at timestamptz,
  affected_scope_ar text not null,
  data_categories text[] not null default '{}',
  subjects_estimate integer,
  root_cause_ar text,
  notification_required boolean not null default false,
  authority_notified_at timestamptz,
  subjects_notified_at timestamptz,
  status text not null default 'open' check (status in ('open','contained','closed')),
  lessons_ar text,
  reported_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.data_incidents to authenticated;
grant all on public.data_incidents to service_role;
alter table public.data_incidents enable row level security;
create policy data_incidents_staff_read on public.data_incidents
  for select to authenticated
  using (private.can(auth.uid(), 'privacy'::public.app_module, 'view'::public.app_action, null, null));

-- 7) updated_at triggers -------------------------------------------------
create trigger legal_documents_touch before update on public.legal_documents
  for each row execute function public.set_updated_at();
create trigger legal_versions_touch before update on public.legal_document_versions
  for each row execute function public.set_updated_at();
create trigger dpr_touch before update on public.data_processing_register
  for each row execute function public.set_updated_at();
create trigger dpia_touch before update on public.dpia_register
  for each row execute function public.set_updated_at();
create trigger dsr_touch before update on public.dsr_requests
  for each row execute function public.set_updated_at();
create trigger data_incidents_touch before update on public.data_incidents
  for each row execute function public.set_updated_at();

-- 8) DSR status flow guard ----------------------------------------------
create or replace function private.enforce_dsr_status_flow()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    ok := case old.status
      when 'submitted' then new.status in ('identity_verification','rejected','closed')
      when 'identity_verification' then new.status in ('in_review','rejected','closed')
      when 'in_review' then new.status in ('fulfilled','partially_fulfilled','rejected')
      when 'fulfilled' then new.status = 'closed'
      when 'partially_fulfilled' then new.status = 'closed'
      when 'rejected' then new.status = 'closed'
      else false
    end;
    if not ok then
      raise exception 'DSR_INVALID_STATUS_TRANSITION: % -> %', old.status, new.status;
    end if;
    insert into public.dsr_request_events (request_id, from_status, to_status, actor_id, note_ar)
    values (new.id, old.status, new.status, auth.uid(), new.decision_ar);
  end if;
  return new;
end $$;

create trigger dsr_status_flow before update on public.dsr_requests
  for each row execute function private.enforce_dsr_status_flow();

-- 9) Privacy module guard -----------------------------------------------
create or replace function private.require_privacy_staff()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null or not private.is_platform_staff(v) then
    raise exception 'PRIVACY_STAFF_ONLY';
  end if;
  return v;
end $$;

-- can(): privacy module is platform-operations only (module AND action matched)
create or replace function private.can(
  _user_id uuid, _module public.app_module, _action public.app_action,
  _entity_id uuid default null, _project_id uuid default null
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_entity_id uuid := _entity_id;
  v_owner_id uuid;
  v_project_entity_id uuid;
begin
  if _user_id is null then return false; end if;

  -- Phase 26: privacy registers are platform-operations only.
  if _module = 'privacy'::public.app_module then
    return _action = any (array['view','create','update','approve','execute','export']::public.app_action[])
       and private.is_platform_staff(_user_id);
  end if;

  -- Phase 25: the integrations module is platform-operations only.
  if _module = 'integrations'::public.app_module then
    return _action = any (array['view','create','update','execute']::public.app_action[])
       and private.is_platform_staff(_user_id);
  end if;

  if _project_id is not null then
    select p.owner_id, p.entity_id into v_owner_id, v_project_entity_id
    from public.projects p where p.id = _project_id and p.deleted_at is null;
    if v_owner_id is null then return false; end if;
    v_entity_id := coalesce(v_project_entity_id, v_entity_id);
    if v_owner_id = _user_id then return true; end if;
  end if;

  if exists (
    select 1 from public.permission_grants g
    where g.subject_user_id = _user_id and g.module = _module and g.action = _action
      and g.effect = 'deny' and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and ((g.scope_type = 'project' and g.scope_project_id = _project_id)
        or (g.scope_type = 'entity' and g.scope_entity_id = v_entity_id))
  ) then return false; end if;

  if _project_id is not null and _action = 'view'::public.app_action and private.is_platform_staff(_user_id) then
    if exists (
      select 1 from public.platform_case_access ca
      join public.permission_grants g on g.id = ca.grant_id
      where ca.staff_user_id = _user_id and ca.project_id = _project_id
        and ca.revoked_at is null and ca.expires_at > now()
        and g.revoked_at is null and g.effect = 'allow' and g.module = _module and g.action = _action
        and (g.expires_at is null or g.expires_at > now())
    ) then return true; end if;

    if exists (
      select 1 from public.platform_breakglass_requests b
      join public.permission_grants g on g.id = b.grant_id
      where b.requested_by = _user_id and b.project_id = _project_id
        and b.status = 'approved' and b.expires_at > now()
        and g.revoked_at is null and g.effect = 'allow' and g.module = _module and g.action = _action
        and (g.expires_at is null or g.expires_at > now())
    ) then return true; end if;
  end if;

  if _module = any (array['marketing','media']::public.app_module[])
     and _project_id is not null
     and _action = any (array['view','create','update']::public.app_action[])
  then
    if exists (
      select 1
      from public.marketing_contracts mc
      join public.marketing_profiles mp on mp.id = mc.profile_id
      join public.entity_memberships em
        on em.entity_id = mc.marketer_entity_id
       and em.user_id = _user_id and em.status = 'active'
       and (em.expires_at is null or em.expires_at > now())
      where mp.project_id = _project_id and mc.status = 'active'
        and mc.starts_on <= current_date
        and (mc.ends_on is null or mc.ends_on >= current_date)
    ) then return true; end if;
  end if;

  if _module = 'media'::public.app_module
     and _project_id is not null
     and _action = any (array['view','create','update']::public.app_action[])
     and private.is_media_photographer(_user_id, _project_id)
  then
    return true;
  end if;

  if _project_id is not null and private.party_ceiling(_user_id, _module, _action, _project_id) then
    return true;
  end if;

  if v_entity_id is null then return false; end if;

  if exists (
    select 1 from public.entity_memberships em
    join public.role_permissions rp on rp.role = em.role
    where em.user_id = _user_id and em.entity_id = v_entity_id and em.status = 'active'
      and (em.expires_at is null or em.expires_at > now())
      and rp.module = _module and rp.action = _action
      and (_project_id is null or em.role in ('owner'::public.app_role,'admin'::public.app_role,'manager'::public.app_role))
  ) then return true; end if;

  if _project_id is not null and private.has_project_assignment(_user_id, _project_id) then
    if exists (
      select 1 from public.project_assignments a
      join public.entity_memberships em
        on em.user_id = a.user_id and em.entity_id = coalesce(a.entity_id, v_entity_id) and em.status = 'active'
      join public.role_permissions rp on rp.role = em.role
      where a.user_id = _user_id and a.project_id = _project_id and a.status = 'active'
        and a.deleted_at is null and rp.module = _module and rp.action = _action
    ) then return true; end if;
  end if;

  return false;
end $$;

-- 10) Public legal readers ----------------------------------------------
create or replace function public.get_legal_document(_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', d.code,
    'title_ar', d.title_ar,
    'slug', d.slug,
    'version', v.version,
    'effective_date', v.effective_date,
    'published_at', v.published_at,
    'body_md', v.body_md
  )
  from public.legal_documents d
  join public.legal_document_versions v
    on v.document_id = d.id and v.is_current and v.published_at is not null
  where d.code = _code;
$$;

create or replace function public.list_legal_documents()
returns table (code text, title_ar text, slug text, version text, effective_date date)
language sql stable security definer set search_path = public as $$
  select d.code, d.title_ar, d.slug, v.version, v.effective_date
  from public.legal_documents d
  join public.legal_document_versions v
    on v.document_id = d.id and v.is_current and v.published_at is not null
  order by d.code;
$$;

create or replace function public.publish_legal_version(
  _code text, _version text, _body_md text, _effective_date date,
  _requires_acceptance boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_doc uuid; v_id uuid; v_actor uuid := private.require_privacy_staff();
begin
  select id into v_doc from public.legal_documents where code = _code;
  if v_doc is null then raise exception 'LEGAL_DOCUMENT_NOT_FOUND'; end if;
  update public.legal_document_versions set is_current = false
   where document_id = v_doc and is_current;
  insert into public.legal_document_versions
    (document_id, version, body_md, effective_date, published_at, requires_acceptance, is_current, created_by)
  values (v_doc, _version, _body_md, _effective_date, now(), _requires_acceptance, true, v_actor)
  on conflict (document_id, version) do update
    set body_md = excluded.body_md, effective_date = excluded.effective_date,
        published_at = now(), requires_acceptance = excluded.requires_acceptance, is_current = true
  returning id into v_id;
  return v_id;
end $$;

-- 11) Acceptances --------------------------------------------------------
create or replace function public.pending_policy_acceptances()
returns table (document_id uuid, version_id uuid, code text, title_ar text, version text, effective_date date)
language sql stable security definer set search_path = public as $$
  select d.id, v.id, d.code, d.title_ar, v.version, v.effective_date
  from public.legal_documents d
  join public.legal_document_versions v
    on v.document_id = d.id and v.is_current and v.published_at is not null
   and v.requires_acceptance
  where auth.uid() is not null
    and not exists (
      select 1 from public.policy_acceptances a
      where a.user_id = auth.uid() and a.version_id = v.id
    )
  order by d.code;
$$;

create or replace function public.accept_policies(_version_ids uuid[], _context text default 'login_gate')
returns integer language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if _version_ids is null or array_length(_version_ids, 1) is null then
    raise exception 'NO_VERSIONS_SELECTED';
  end if;
  insert into public.policy_acceptances (user_id, document_id, version_id, context)
  select v_user, v.document_id, v.id, coalesce(_context, 'login_gate')
  from public.legal_document_versions v
  where v.id = any (_version_ids) and v.is_current and v.published_at is not null
  on conflict (user_id, version_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.list_my_policy_acceptances()
returns table (code text, title_ar text, version text, accepted_at timestamptz, context text)
language sql stable security definer set search_path = public as $$
  select d.code, d.title_ar, v.version, a.accepted_at, a.context
  from public.policy_acceptances a
  join public.legal_document_versions v on v.id = a.version_id
  join public.legal_documents d on d.id = a.document_id
  where a.user_id = auth.uid()
  order by a.accepted_at desc;
$$;

-- 12) Erasure constraints + export --------------------------------------
create or replace function public.evaluate_erasure_constraints(_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_target uuid := coalesce(_user_id, auth.uid());
  v_reasons text[] := '{}';
  v_memberships int; v_parties int; v_contracts int; v_finance int;
begin
  if v_target is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_target <> auth.uid() and not private.is_platform_staff(auth.uid()) then
    raise exception 'PRIVACY_STAFF_ONLY';
  end if;

  select count(*) into v_memberships from public.entity_memberships em
   where em.user_id = v_target and em.status = 'active';

  select count(*) into v_parties from public.project_assignments a
    join public.projects p on p.id = a.project_id
   where a.user_id = v_target and a.status = 'active' and a.deleted_at is null
     and p.deleted_at is null and coalesce(p.status, '') <> 'closed';

  select count(*) into v_contracts from public.contract_parties cp
    join public.contracts c on c.id = cp.contract_id
   where cp.user_id = v_target and c.status in ('active','suspended');

  select count(*) into v_finance from public.financial_documents fd
   where fd.created_by = v_target and fd.status <> 'cancelled';

  if v_memberships > 0 then
    v_reasons := v_reasons || format('عضويات نشطة في %s كيان — يلزم إنهاؤها أو نقلها أولًا', v_memberships);
  end if;
  if v_parties > 0 then
    v_reasons := v_reasons || format('إسنادات نشطة في %s مشروع قائم — التزام تعاقدي جارٍ', v_parties);
  end if;
  if v_contracts > 0 then
    v_reasons := v_reasons || format('طرف في %s عقد ساري — سجلات تعاقدية لا تُحذف قبل انتهائه', v_contracts);
  end if;
  if v_finance > 0 then
    v_reasons := v_reasons || format('%s مستند مالي مرتبط — سجلات نظامية تُحفظ للمدة النظامية للفواتير', v_finance);
  end if;

  return jsonb_build_object(
    'user_id', v_target,
    'can_fully_erase', array_length(v_reasons, 1) is null,
    'reasons', to_jsonb(v_reasons),
    'counts', jsonb_build_object(
      'active_memberships', v_memberships,
      'active_project_assignments', v_parties,
      'active_contracts', v_contracts,
      'financial_documents', v_finance
    )
  );
end $$;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    '__export_scope', 'self',
    'generated_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(em)), '[]'::jsonb)
                      from public.entity_memberships em where em.user_id = v_user),
    'project_assignments', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                      from public.project_assignments a where a.user_id = v_user),
    'notification_preferences', (select coalesce(jsonb_agg(to_jsonb(np)), '[]'::jsonb)
                      from public.notification_preferences np where np.user_id = v_user),
    'policy_acceptances', (select coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb)
                      from public.policy_acceptances pa where pa.user_id = v_user),
    'dsr_requests', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                      from public.dsr_requests r where r.user_id = v_user)
  );
end $$;

-- 13) DSR lifecycle ------------------------------------------------------
create or replace function public.submit_dsr_request(_kind text, _details_ar text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_queue uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if _kind not in ('access','rectification','erasure','export') then
    raise exception 'DSR_INVALID_KIND';
  end if;
  if coalesce(length(trim(_details_ar)), 0) < 10 then
    raise exception 'DSR_DETAILS_TOO_SHORT';
  end if;
  if exists (select 1 from public.dsr_requests r
              where r.user_id = v_user and r.kind = _kind
                and r.status in ('submitted','identity_verification','in_review')) then
    raise exception 'DSR_DUPLICATE_OPEN_REQUEST';
  end if;

  insert into public.dsr_requests (user_id, kind, details_ar)
  values (v_user, _kind, _details_ar)
  returning id into v_id;

  insert into public.dsr_request_events (request_id, from_status, to_status, actor_id, note_ar)
  values (v_id, null, 'submitted', v_user, 'تقديم الطلب');

  v_queue := private.upsert_queue_item(
    'dsr_request'::public.platform_queue_source, 'dsr_requests', v_id,
    'طلب حقوق صاحب بيانات: ' || _kind, null, null, 2::smallint);

  update public.dsr_requests set queue_item_id = v_queue where id = v_id;

  perform private.timer_start('dsr_request', v_id, null, null, null, now(), now() + interval '30 days');
  return v_id;
end $$;

create or replace function public.verify_dsr_identity(_request_id uuid, _method text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := private.require_privacy_staff();
begin
  update public.dsr_requests
     set status = 'identity_verification', identity_verified_at = now(),
         identity_method = _method, decision_ar = 'تم التحقق من الهوية: ' || _method
   where id = _request_id and status = 'submitted';
  if not found then raise exception 'DSR_NOT_IN_SUBMITTED_STATE'; end if;
end $$;

create or replace function public.start_dsr_review(_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := private.require_privacy_staff();
begin
  update public.dsr_requests
     set status = 'in_review', decision_ar = 'بدء المعالجة'
   where id = _request_id and status = 'identity_verification'
     and identity_verified_at is not null;
  if not found then raise exception 'DSR_IDENTITY_NOT_VERIFIED'; end if;
end $$;

create or replace function public.decide_dsr_request(
  _request_id uuid, _outcome text, _decision_ar text,
  _restrictions text[] default '{}', _result_ref jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := private.require_privacy_staff();
begin
  if _outcome not in ('fulfilled','partially_fulfilled','rejected') then
    raise exception 'DSR_INVALID_OUTCOME';
  end if;
  if coalesce(length(trim(_decision_ar)), 0) < 5 then raise exception 'DSR_DECISION_REQUIRED'; end if;
  if _outcome = 'partially_fulfilled' and coalesce(array_length(_restrictions, 1), 0) = 0 then
    raise exception 'DSR_RESTRICTIONS_REQUIRED';
  end if;
  update public.dsr_requests
     set status = _outcome, decision_ar = _decision_ar,
         restriction_reasons = coalesce(_restrictions, '{}'), result_ref = _result_ref
   where id = _request_id and status = 'in_review';
  if not found then raise exception 'DSR_NOT_IN_REVIEW'; end if;
end $$;

create or replace function public.close_dsr_request(_request_id uuid, _note_ar text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := private.require_privacy_staff();
begin
  update public.dsr_requests
     set status = 'closed', closed_at = now(), decision_ar = coalesce(_note_ar, decision_ar)
   where id = _request_id and status in ('fulfilled','partially_fulfilled','rejected');
  if not found then raise exception 'DSR_NOT_DECIDED'; end if;
  perform private.timer_stop('dsr_request', _request_id);
  perform private.close_queue_for_source('dsr_request'::public.platform_queue_source, _request_id, coalesce(_note_ar, 'أُغلق طلب الخصوصية'));
end $$;

create or replace function public.list_my_dsr_requests()
returns setof public.dsr_requests language sql stable security definer set search_path = public as $$
  select * from public.dsr_requests where user_id = auth.uid() order by created_at desc;
$$;

create or replace function public.list_dsr_requests(_status text default null)
returns setof public.dsr_requests language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_privacy_staff();
  return query
    select * from public.dsr_requests r
     where (_status is null or r.status = _status)
     order by r.created_at desc;
end $$;

create or replace function public.get_dsr_events(_request_id uuid)
returns setof public.dsr_request_events language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.dsr_requests r
     where r.id = _request_id
       and (r.user_id = auth.uid() or private.is_platform_staff(auth.uid()))
  ) then raise exception 'DSR_FORBIDDEN'; end if;
  return query select * from public.dsr_request_events e
                where e.request_id = _request_id order by e.created_at;
end $$;

create or replace function public.get_dsr_timer(_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.dsr_requests r
     where r.id = _request_id
       and (r.user_id = auth.uid() or private.is_platform_staff(auth.uid()))
  ) then raise exception 'DSR_FORBIDDEN'; end if;
  return (select to_jsonb(t) from public.duration_timers t
           where t.subject_kind = 'dsr_request' and t.subject_id = _request_id);
end $$;

-- 14) Registers & incidents readers -------------------------------------
create or replace function public.list_data_processing_register()
returns setof public.data_processing_register language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_privacy_staff();
  return query select * from public.data_processing_register order by module, activity_code;
end $$;

create or replace function public.list_dpia()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_privacy_staff();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'module', d.module, 'scope_code', d.scope_code, 'scope_ar', d.scope_ar,
      'risk_level', d.risk_level, 'risks', d.risks, 'residual_risk_ar', d.residual_risk_ar,
      'assessed_at', d.assessed_at, 'review_due_at', d.review_due_at,
      'controls', (select coalesce(jsonb_agg(jsonb_build_object(
          'control_type', c.control_type, 'object_name', c.object_name,
          'description_ar', c.description_ar, 'effectiveness_ar', c.effectiveness_ar) order by c.object_name), '[]'::jsonb)
        from public.dpia_controls c where c.dpia_id = d.id)
    ) order by d.scope_code), '[]'::jsonb)
    from public.dpia_register d
  );
end $$;

create or replace function public.list_data_incidents()
returns setof public.data_incidents language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_privacy_staff();
  return query select * from public.data_incidents order by detected_at desc;
end $$;

create or replace function public.log_data_incident(
  _title text, _severity text, _affected_scope_ar text,
  _data_categories text[] default '{}', _subjects_estimate integer default null,
  _notification_required boolean default false
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_actor uuid := private.require_privacy_staff(); v_id uuid;
begin
  insert into public.data_incidents
    (title, severity, affected_scope_ar, data_categories, subjects_estimate, notification_required, reported_by)
  values (_title, _severity, _affected_scope_ar, coalesce(_data_categories,'{}'), _subjects_estimate, _notification_required, v_actor)
  returning id into v_id;
  return v_id;
end $$;

-- 15) Hardening: revoke defaults, grant explicitly -----------------------
revoke insert, update, delete, truncate on public.legal_documents from anon, authenticated;
revoke insert, update, delete, truncate on public.legal_document_versions from anon, authenticated;
revoke insert, update, delete, truncate on public.policy_acceptances from anon, authenticated;
revoke select, insert, update, delete, truncate on public.policy_acceptances from anon;
revoke insert, update, delete, truncate on public.data_processing_register from anon, authenticated;
revoke select on public.data_processing_register from anon;
revoke insert, update, delete, truncate on public.dpia_register from anon, authenticated;
revoke select on public.dpia_register from anon;
revoke insert, update, delete, truncate on public.dpia_controls from anon, authenticated;
revoke select on public.dpia_controls from anon;
revoke insert, update, delete, truncate on public.dsr_requests from anon, authenticated;
revoke select on public.dsr_requests from anon;
revoke insert, update, delete, truncate on public.dsr_request_events from anon, authenticated;
revoke select on public.dsr_request_events from anon;
revoke insert, update, delete, truncate on public.data_incidents from anon, authenticated;
revoke select on public.data_incidents from anon;

revoke execute on function private.enforce_dsr_status_flow() from public;
revoke execute on function private.require_privacy_staff() from public;
revoke execute on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) from public;
grant execute on function private.can(uuid, public.app_module, public.app_action, uuid, uuid) to authenticated, anon;

revoke execute on function public.get_legal_document(text) from public;
revoke execute on function public.list_legal_documents() from public;
grant execute on function public.get_legal_document(text) to anon, authenticated;
grant execute on function public.list_legal_documents() to anon, authenticated;

revoke execute on function public.publish_legal_version(text, text, text, date, boolean) from public;
revoke execute on function public.pending_policy_acceptances() from public;
revoke execute on function public.accept_policies(uuid[], text) from public;
revoke execute on function public.list_my_policy_acceptances() from public;
revoke execute on function public.evaluate_erasure_constraints(uuid) from public;
revoke execute on function public.export_my_data() from public;
revoke execute on function public.submit_dsr_request(text, text) from public;
revoke execute on function public.verify_dsr_identity(uuid, text) from public;
revoke execute on function public.start_dsr_review(uuid) from public;
revoke execute on function public.decide_dsr_request(uuid, text, text, text[], jsonb) from public;
revoke execute on function public.close_dsr_request(uuid, text) from public;
revoke execute on function public.list_my_dsr_requests() from public;
revoke execute on function public.list_dsr_requests(text) from public;
revoke execute on function public.get_dsr_events(uuid) from public;
revoke execute on function public.get_dsr_timer(uuid) from public;
revoke execute on function public.list_data_processing_register() from public;
revoke execute on function public.list_dpia() from public;
revoke execute on function public.list_data_incidents() from public;
revoke execute on function public.log_data_incident(text, text, text, text[], integer, boolean) from public;

grant execute on function public.publish_legal_version(text, text, text, date, boolean) to authenticated;
grant execute on function public.pending_policy_acceptances() to authenticated;
grant execute on function public.accept_policies(uuid[], text) to authenticated;
grant execute on function public.list_my_policy_acceptances() to authenticated;
grant execute on function public.evaluate_erasure_constraints(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.submit_dsr_request(text, text) to authenticated;
grant execute on function public.verify_dsr_identity(uuid, text) to authenticated;
grant execute on function public.start_dsr_review(uuid) to authenticated;
grant execute on function public.decide_dsr_request(uuid, text, text, text[], jsonb) to authenticated;
grant execute on function public.close_dsr_request(uuid, text) to authenticated;
grant execute on function public.list_my_dsr_requests() to authenticated;
grant execute on function public.list_dsr_requests(text) to authenticated;
grant execute on function public.get_dsr_events(uuid) to authenticated;
grant execute on function public.get_dsr_timer(uuid) to authenticated;
grant execute on function public.list_data_processing_register() to authenticated;
grant execute on function public.list_dpia() to authenticated;
grant execute on function public.list_data_incidents() to authenticated;
grant execute on function public.log_data_incident(text, text, text, text[], integer, boolean) to authenticated;