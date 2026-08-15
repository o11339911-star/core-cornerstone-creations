-- =========================================================
-- Phase 16-A — payment milestones + disbursement cycle
-- Contractual/accounting record ONLY. Rakeez does not hold funds,
-- does not process payments, and is not a licensed financial service.
-- =========================================================

-- ---------- helper: finance visibility on a project ----------
create or replace function private.can_view_project_finance(_user_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select private.can_access_project(_user_id, _project_id)
     and private.can(_user_id, 'finance'::public.app_module, 'view'::public.app_action, null, _project_id);
$$;
revoke all on function private.can_view_project_finance(uuid, uuid) from public, anon;
grant execute on function private.can_view_project_finance(uuid, uuid) to authenticated, service_role;

-- ---------- helper: entity active member count (real segregation of duties) ----------
create or replace function private.entity_active_member_count(_entity_id uuid)
returns int language sql stable security definer set search_path to 'public' as $$
  select count(distinct em.user_id)::int
  from public.entity_memberships em
  where em.entity_id = _entity_id
    and em.status = 'active'
    and (em.expires_at is null or em.expires_at > now());
$$;
revoke all on function private.entity_active_member_count(uuid) from public, anon;
grant execute on function private.entity_active_member_count(uuid) to authenticated, service_role;

-- ---------------------------------------------------------
-- 1. payment_milestones (no amount column on purpose)
-- ---------------------------------------------------------
create table public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  contract_version_id uuid references public.contract_versions(id),
  project_id uuid not null references public.projects(id),
  stage_id uuid references public.project_stages(id),
  seq int not null,
  title_ar text not null,
  title_en text,
  basis text not null default 'on_stage_approval'
    check (basis in ('on_stage_approval','on_date','manual')),
  due_date date,
  status text not null default 'planned'
    check (status in ('planned','claimable','claimed','settled','cancelled')),
  supersedes_id uuid references public.payment_milestones(id),
  cancel_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, seq)
);
comment on table public.payment_milestones is
  'Contractual payment schedule. Rakeez holds no funds and executes no transfers.';
create index idx_payment_milestones_project on public.payment_milestones(project_id);
create index idx_payment_milestones_stage on public.payment_milestones(stage_id);

grant select on public.payment_milestones to authenticated;
grant all on public.payment_milestones to service_role;
alter table public.payment_milestones enable row level security;

create policy payment_milestones_select_scope on public.payment_milestones
  for select to authenticated
  using (
    private.can_access_project((select auth.uid()), project_id)
    and (stage_id is null or private.stage_in_scope((select auth.uid()), stage_id, project_id))
  );

create trigger payment_milestones_set_updated_at
  before update on public.payment_milestones
  for each row execute function public.set_updated_at();

-- amounts live apart so RLS can hide the numbers, not the row
create table public.payment_milestone_amounts (
  milestone_id uuid primary key references public.payment_milestones(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'SAR',
  percent_of_contract numeric(6,3) check (percent_of_contract > 0 and percent_of_contract <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.payment_milestone_amounts to authenticated;
grant all on public.payment_milestone_amounts to service_role;
alter table public.payment_milestone_amounts enable row level security;

create policy payment_milestone_amounts_select_finance on public.payment_milestone_amounts
  for select to authenticated
  using (
    exists (
      select 1 from public.payment_milestones m
      where m.id = milestone_id
        and private.can_view_project_finance((select auth.uid()), m.project_id)
    )
  );

-- total planned percentage per contract must stay <= 100
create or replace function public.enforce_milestone_percent_total()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_contract uuid;
  v_total numeric;
begin
  select m.contract_id into v_contract from public.payment_milestones m where m.id = new.milestone_id;
  select coalesce(sum(a.percent_of_contract), 0) into v_total
  from public.payment_milestone_amounts a
  join public.payment_milestones m on m.id = a.milestone_id
  where m.contract_id = v_contract
    and m.status <> 'cancelled'
    and a.milestone_id <> new.milestone_id;
  if coalesce(new.percent_of_contract, 0) + v_total > 100 then
    raise exception 'Planned milestone percentages exceed 100%% for this contract' using errcode = '22023';
  end if;
  return new;
end; $$;
create trigger payment_milestone_amounts_percent_total
  before insert or update on public.payment_milestone_amounts
  for each row execute function public.enforce_milestone_percent_total();

-- ---------------------------------------------------------
-- 2. disbursement_requests
-- ---------------------------------------------------------
create table public.disbursement_requests (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.payment_milestones(id),
  contract_id uuid not null references public.contracts(id),
  project_id uuid not null references public.projects(id),
  stage_id uuid references public.project_stages(id),
  status text not null default 'submitted'
    check (status in ('submitted','under_review','approved','rejected','executed','cancelled')),
  note text,
  reason_text text,
  resubmitted_from uuid references public.disbursement_requests(id),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejected_by uuid references auth.users(id),
  rejected_at timestamptz,
  executed_by uuid references auth.users(id),
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.disbursement_requests is
  'Four-actor disbursement cycle. Approval never settles anything; only execution does.';
create index idx_disb_requests_milestone on public.disbursement_requests(milestone_id);
create index idx_disb_requests_project on public.disbursement_requests(project_id);

grant select on public.disbursement_requests to authenticated;
grant all on public.disbursement_requests to service_role;
alter table public.disbursement_requests enable row level security;

create policy disbursement_requests_select_scope on public.disbursement_requests
  for select to authenticated
  using (
    private.can_access_project((select auth.uid()), project_id)
    and (stage_id is null or private.stage_in_scope((select auth.uid()), stage_id, project_id))
  );

create trigger disbursement_requests_set_updated_at
  before update on public.disbursement_requests
  for each row execute function public.set_updated_at();

create table public.disbursement_request_amounts (
  request_id uuid primary key references public.disbursement_requests(id) on delete cascade,
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  retention_amount numeric(14,2) not null default 0 check (retention_amount >= 0),
  net_amount numeric(14,2) generated always as (gross_amount - retention_amount) stored,
  currency text not null default 'SAR',
  created_at timestamptz not null default now(),
  constraint disb_amount_retention_ck check (retention_amount <= gross_amount)
);
grant select on public.disbursement_request_amounts to authenticated;
grant all on public.disbursement_request_amounts to service_role;
alter table public.disbursement_request_amounts enable row level security;

create policy disbursement_request_amounts_select_finance on public.disbursement_request_amounts
  for select to authenticated
  using (
    exists (
      select 1 from public.disbursement_requests r
      where r.id = request_id
        and private.can_view_project_finance((select auth.uid()), r.project_id)
    )
  );

-- request amounts are frozen once written (correction = new request)
create trigger disbursement_request_amounts_append_only
  before update or delete on public.disbursement_request_amounts
  for each row execute function public.prevent_row_mutation();

-- ---------------------------------------------------------
-- 3. disbursement_evidence (references existing proof only)
-- ---------------------------------------------------------
create table public.disbursement_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.disbursement_requests(id) on delete cascade,
  kind text not null check (kind in ('stage_progress','site_visit','document')),
  stage_progress_id uuid references public.stage_progress(id),
  site_visit_id uuid references public.site_visits(id),
  document_id uuid references public.documents(id),
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint disbursement_evidence_one_ref check (
    num_nonnulls(stage_progress_id, site_visit_id, document_id) = 1
  )
);
create index idx_disb_evidence_request on public.disbursement_evidence(request_id);

grant select on public.disbursement_evidence to authenticated;
grant all on public.disbursement_evidence to service_role;
alter table public.disbursement_evidence enable row level security;

create policy disbursement_evidence_select_scope on public.disbursement_evidence
  for select to authenticated
  using (
    exists (
      select 1 from public.disbursement_requests r
      where r.id = request_id
        and private.can_access_project((select auth.uid()), r.project_id)
    )
  );

create trigger disbursement_evidence_append_only
  before update or delete on public.disbursement_evidence
  for each row execute function public.prevent_row_mutation();

-- ---------------------------------------------------------
-- 4. financial_executions (append-only, idempotent)
-- ---------------------------------------------------------
create table public.financial_executions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.disbursement_requests(id),
  milestone_id uuid not null references public.payment_milestones(id),
  project_id uuid not null references public.projects(id),
  idempotency_key text not null,
  method text not null default 'bank_transfer_offline'
    check (method in ('bank_transfer_offline','cheque','other')),
  external_reference text,
  note text,
  executed_by uuid not null references auth.users(id),
  executed_at timestamptz not null default now()
);
comment on table public.financial_executions is
  'Off-platform settlement acknowledgement. Rakeez performs no transfer; append-only.';
create unique index financial_executions_idem_uk on public.financial_executions(idempotency_key);
create unique index financial_executions_request_idem_uk
  on public.financial_executions(request_id, idempotency_key);
create index idx_financial_executions_request on public.financial_executions(request_id);

grant select on public.financial_executions to authenticated;
grant all on public.financial_executions to service_role;
alter table public.financial_executions enable row level security;

create policy financial_executions_select_finance on public.financial_executions
  for select to authenticated
  using (private.can_view_project_finance((select auth.uid()), project_id));

create trigger financial_executions_append_only
  before update or delete on public.financial_executions
  for each row execute function public.prevent_row_mutation();

-- ---------------------------------------------------------
-- 5. guards
-- ---------------------------------------------------------

-- 5.1 settlement guard: 'settled' requires a matching execution of an executed request.
-- Fires for every writer including service_role and direct SQL.
create or replace function public.guard_milestone_settlement()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'settled' and old.status is distinct from 'settled' then
    if not exists (
      select 1
      from public.financial_executions e
      join public.disbursement_requests r on r.id = e.request_id
      where e.milestone_id = new.id
        and r.milestone_id = new.id
        and r.status = 'executed'
    ) then
      raise exception 'A milestone cannot be settled without a matching executed disbursement'
        using errcode = '42501';
    end if;
  end if;

  if old.status = 'settled' and new.status is distinct from 'settled' then
    raise exception 'A settled milestone is final and cannot change status'
      using errcode = '42501';
  end if;

  return new;
end; $$;
create trigger payment_milestones_settlement_guard
  before update on public.payment_milestones
  for each row execute function public.guard_milestone_settlement();

-- 5.2 disbursement status machine + segregation of duties at row level
create or replace function public.enforce_disbursement_flow()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_ok boolean := false;
begin
  if tg_op = 'UPDATE' then
    if new.milestone_id is distinct from old.milestone_id
       or new.requested_by is distinct from old.requested_by
       or new.contract_id is distinct from old.contract_id
       or new.project_id is distinct from old.project_id then
      raise exception 'Core fields of a disbursement request are immutable' using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      v_ok := (old.status = 'submitted'    and new.status in ('under_review','rejected','cancelled'))
           or (old.status = 'under_review' and new.status in ('approved','rejected','cancelled'))
           or (old.status = 'approved'     and new.status in ('executed','rejected'))
           or (old.status = new.status);
      if not v_ok then
        raise exception 'Illegal disbursement transition % -> %', old.status, new.status
          using errcode = '22023';
      end if;
    elsif old.status in ('executed','rejected','cancelled') then
      raise exception 'A % disbursement request is final', old.status using errcode = '42501';
    end if;
  end if;

  if new.status = 'rejected' and coalesce(length(btrim(new.reason_text)), 0) < 3 then
    raise exception 'A rejection requires an explicit reason' using errcode = '22023';
  end if;

  -- real segregation of duties, enforced on the row itself
  if new.reviewed_by is not null and new.reviewed_by = new.requested_by then
    raise exception 'The requester cannot review their own disbursement request' using errcode = '42501';
  end if;
  if new.approved_by is not null and new.approved_by in (new.requested_by, coalesce(new.reviewed_by, '00000000-0000-0000-0000-000000000000'::uuid)) then
    raise exception 'The requester or reviewer cannot approve the same request' using errcode = '42501';
  end if;
  if new.executed_by is not null and new.executed_by = new.approved_by then
    raise exception 'The approver cannot execute the same request' using errcode = '42501';
  end if;

  if new.status = 'approved' and new.reviewed_by is null then
    raise exception 'A request must be reviewed before approval' using errcode = '22023';
  end if;
  if new.status = 'executed' and new.approved_by is null then
    raise exception 'A request must be approved before execution' using errcode = '22023';
  end if;

  return new;
end; $$;
create trigger disbursement_requests_flow_guard
  before insert or update on public.disbursement_requests
  for each row execute function public.enforce_disbursement_flow();

-- 5.3 milestone amounts freeze once a live request exists
create or replace function public.guard_milestone_amount_lock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_mid uuid := coalesce(new.milestone_id, old.milestone_id);
begin
  if exists (
    select 1 from public.disbursement_requests r
    where r.milestone_id = v_mid and r.status <> 'cancelled'
  ) then
    raise exception 'This milestone already has a disbursement request; cancel it and create a replacement'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end; $$;
create trigger payment_milestone_amounts_lock
  before update or delete on public.payment_milestone_amounts
  for each row execute function public.guard_milestone_amount_lock();

-- 5.4 audit object types
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions',
    'contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience','reports','report_versions','report_templates','report_assets',
    'report_template_imports','platform_admins','payment_milestones','disbursement_requests',
    'financial_executions']));

create or replace function private.log_finance_event(
  _object_type text, _object_id uuid, _action text, _project_id uuid, _new jsonb)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.permission_audit_log
    (actor_user_id, target_project_id, object_type, object_id, action, new_value)
  values (auth.uid(), _project_id, _object_type, _object_id, _action, _new);
$$;
revoke all on function private.log_finance_event(text, uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 6. functions (the only write path)
-- ---------------------------------------------------------

create or replace function private.require_two_actors(_project_id uuid)
returns void language plpgsql stable security definer set search_path to 'public' as $$
declare v_entity uuid;
begin
  select p.entity_id into v_entity from public.projects p where p.id = _project_id;
  if v_entity is null then
    raise exception 'Disbursement requires an entity-owned project with separate actors'
      using errcode = '42501';
  end if;
  if private.entity_active_member_count(v_entity) < 2 then
    raise exception 'Segregation of duties requires at least two active members in the entity; add a second member first'
      using errcode = '42501';
  end if;
end; $$;
revoke all on function private.require_two_actors(uuid) from public, anon, authenticated;

-- 6.1 create_payment_milestone
create or replace function public.create_payment_milestone(
  _contract_id uuid,
  _title_ar text,
  _amount numeric,
  _stage_id uuid default null,
  _title_en text default null,
  _basis text default 'on_stage_approval',
  _due_date date default null,
  _percent_of_contract numeric default null,
  _seq int default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_contract public.contracts%rowtype;
  v_seq int;
  v_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_contract from public.contracts where id = _contract_id and deleted_at is null;
  if v_contract.id is null then raise exception 'Contract not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'create'::public.app_action, null, v_contract.project_id) then
    raise exception 'Not allowed to create payment milestones' using errcode = '42501';
  end if;
  if _stage_id is not null and not exists (
    select 1 from public.project_stages s where s.id = _stage_id and s.project_id = v_contract.project_id and s.deleted_at is null
  ) then
    raise exception 'Stage does not belong to this project' using errcode = '22023';
  end if;

  select coalesce(_seq, coalesce(max(seq), 0) + 1) into v_seq
  from public.payment_milestones where contract_id = _contract_id;

  insert into public.payment_milestones
    (contract_id, contract_version_id, project_id, stage_id, seq, title_ar, title_en, basis, due_date,
     status, created_by)
  values (_contract_id, v_contract.current_version_id, v_contract.project_id, _stage_id, v_seq,
          _title_ar, _title_en, _basis, _due_date,
          case when _stage_id is null then 'claimable' else 'planned' end, v_actor)
  returning id into v_id;

  insert into public.payment_milestone_amounts (milestone_id, amount, currency, percent_of_contract)
  values (v_id, _amount, coalesce(v_contract.currency, 'SAR'), _percent_of_contract);

  perform private.log_finance_event('payment_milestones', v_id, 'insert', v_contract.project_id,
    jsonb_build_object('seq', v_seq, 'stage_id', _stage_id, 'basis', _basis));
  return v_id;
end; $$;

-- 6.2 cancel_payment_milestone
create or replace function public.cancel_payment_milestone(_milestone_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_m public.payment_milestones%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_reason)), 0) < 3 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;
  select * into v_m from public.payment_milestones where id = _milestone_id for update;
  if v_m.id is null then raise exception 'Milestone not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'update'::public.app_action, null, v_m.project_id) then
    raise exception 'Not allowed to cancel this milestone' using errcode = '42501';
  end if;
  if v_m.status = 'settled' then
    raise exception 'A settled milestone cannot be cancelled' using errcode = '42501';
  end if;
  if exists (select 1 from public.disbursement_requests r
             where r.milestone_id = _milestone_id and r.status in ('submitted','under_review','approved')) then
    raise exception 'Cancel or reject the open disbursement request first' using errcode = '42501';
  end if;

  update public.payment_milestones
     set status = 'cancelled', cancel_reason = _reason
   where id = _milestone_id;

  perform private.log_finance_event('payment_milestones', _milestone_id, 'update', v_m.project_id,
    jsonb_build_object('status', 'cancelled', 'reason', _reason));
end; $$;

-- 6.3 submit_disbursement_request
create or replace function public.submit_disbursement_request(
  _milestone_id uuid,
  _gross_amount numeric,
  _evidence jsonb,
  _retention_amount numeric default 0,
  _note text default null,
  _resubmitted_from uuid default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_m public.payment_milestones%rowtype;
  v_stage public.project_stages%rowtype;
  v_req uuid;
  v_item jsonb;
  v_count int := 0;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_m from public.payment_milestones where id = _milestone_id for update;
  if v_m.id is null then raise exception 'Milestone not found' using errcode = '22023'; end if;

  if not private.can(v_actor, 'finance'::public.app_module, 'create'::public.app_action, null, v_m.project_id) then
    raise exception 'Not allowed to request a disbursement' using errcode = '42501';
  end if;
  perform private.require_two_actors(v_m.project_id);

  if v_m.status in ('settled','cancelled','claimed') then
    raise exception 'Milestone is % and cannot be claimed now', v_m.status using errcode = '22023';
  end if;
  if exists (select 1 from public.disbursement_requests r
             where r.milestone_id = _milestone_id and r.status in ('submitted','under_review','approved')) then
    raise exception 'An open disbursement request already exists for this milestone' using errcode = '22023';
  end if;

  if v_m.stage_id is not null then
    select * into v_stage from public.project_stages where id = v_m.stage_id;
    if v_stage.status <> 'approved' then
      raise exception 'Proof of completion is missing: the linked stage is % (must be approved)', v_stage.status
        using errcode = '22023';
    end if;
  end if;

  if _evidence is null or jsonb_typeof(_evidence) <> 'array' or jsonb_array_length(_evidence) = 0 then
    raise exception 'At least one piece of completion evidence is required' using errcode = '22023';
  end if;

  if _resubmitted_from is not null and not exists (
    select 1 from public.disbursement_requests r
    where r.id = _resubmitted_from and r.milestone_id = _milestone_id and r.status = 'rejected'
  ) then
    raise exception 'Resubmission must reference a rejected request on the same milestone' using errcode = '22023';
  end if;

  insert into public.disbursement_requests
    (milestone_id, contract_id, project_id, stage_id, status, note, requested_by, resubmitted_from)
  values (_milestone_id, v_m.contract_id, v_m.project_id, v_m.stage_id, 'submitted', _note, v_actor, _resubmitted_from)
  returning id into v_req;

  insert into public.disbursement_request_amounts (request_id, gross_amount, retention_amount)
  values (v_req, _gross_amount, coalesce(_retention_amount, 0));

  for v_item in select * from jsonb_array_elements(_evidence) loop
    if (v_item->>'kind') = 'stage_progress' then
      if not exists (select 1 from public.stage_progress sp
                     join public.project_stages s on s.id = sp.stage_id
                     where sp.id = (v_item->>'id')::uuid and s.project_id = v_m.project_id) then
        raise exception 'Evidence stage_progress does not belong to this project' using errcode = '22023';
      end if;
      insert into public.disbursement_evidence (request_id, kind, stage_progress_id, note, created_by)
      values (v_req, 'stage_progress', (v_item->>'id')::uuid, v_item->>'note', v_actor);
    elsif (v_item->>'kind') = 'site_visit' then
      if not exists (select 1 from public.site_visits sv
                     where sv.id = (v_item->>'id')::uuid and sv.project_id = v_m.project_id) then
        raise exception 'Evidence site_visit does not belong to this project' using errcode = '22023';
      end if;
      insert into public.disbursement_evidence (request_id, kind, site_visit_id, note, created_by)
      values (v_req, 'site_visit', (v_item->>'id')::uuid, v_item->>'note', v_actor);
    elsif (v_item->>'kind') = 'document' then
      insert into public.disbursement_evidence (request_id, kind, document_id, note, created_by)
      values (v_req, 'document', (v_item->>'id')::uuid, v_item->>'note', v_actor);
    else
      raise exception 'Unknown evidence kind %', v_item->>'kind' using errcode = '22023';
    end if;
    v_count := v_count + 1;
  end loop;

  update public.payment_milestones set status = 'claimed' where id = _milestone_id;

  perform private.log_finance_event('disbursement_requests', v_req, 'insert', v_m.project_id,
    jsonb_build_object('milestone_id', _milestone_id, 'evidence', v_count, 'resubmitted_from', _resubmitted_from));
  return v_req;
end; $$;

-- 6.4 start_disbursement_review
create or replace function public.start_disbursement_review(_request_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_r public.disbursement_requests%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_r from public.disbursement_requests where id = _request_id for update;
  if v_r.id is null then raise exception 'Request not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'update'::public.app_action, null, v_r.project_id) then
    raise exception 'Not allowed to review this request' using errcode = '42501';
  end if;
  if v_r.status <> 'submitted' then
    raise exception 'Only a submitted request can be reviewed (current: %)', v_r.status using errcode = '22023';
  end if;
  if v_r.requested_by = v_actor then
    raise exception 'The requester cannot review their own disbursement request' using errcode = '42501';
  end if;

  update public.disbursement_requests
     set status = 'under_review', reviewed_by = v_actor, reviewed_at = now(),
         note = coalesce(_note, note)
   where id = _request_id;

  perform private.log_finance_event('disbursement_requests', _request_id, 'update', v_r.project_id,
    jsonb_build_object('status', 'under_review'));
  return now();
end; $$;

-- 6.5 reject_disbursement_request (reason mandatory)
create or replace function public.reject_disbursement_request(_request_id uuid, _reason text)
returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_r public.disbursement_requests%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_reason)), 0) < 3 then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  select * into v_r from public.disbursement_requests where id = _request_id for update;
  if v_r.id is null then raise exception 'Request not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'update'::public.app_action, null, v_r.project_id) then
    raise exception 'Not allowed to reject this request' using errcode = '42501';
  end if;
  if v_r.status not in ('submitted','under_review','approved') then
    raise exception 'A % request cannot be rejected', v_r.status using errcode = '22023';
  end if;
  if v_r.requested_by = v_actor then
    raise exception 'The requester cannot decide on their own request' using errcode = '42501';
  end if;

  update public.disbursement_requests
     set status = 'rejected', reason_text = _reason, rejected_by = v_actor, rejected_at = now()
   where id = _request_id;

  update public.payment_milestones
     set status = case when status = 'claimed' then 'claimable' else status end
   where id = v_r.milestone_id;

  perform private.log_finance_event('disbursement_requests', _request_id, 'update', v_r.project_id,
    jsonb_build_object('status', 'rejected', 'reason', _reason));
  return now();
end; $$;

-- 6.6 resubmit_disbursement_request
create or replace function public.resubmit_disbursement_request(
  _rejected_request_id uuid,
  _gross_amount numeric,
  _evidence jsonb,
  _retention_amount numeric default 0,
  _note text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_r public.disbursement_requests%rowtype;
begin
  select * into v_r from public.disbursement_requests where id = _rejected_request_id;
  if v_r.id is null then raise exception 'Request not found' using errcode = '22023'; end if;
  if v_r.status <> 'rejected' then
    raise exception 'Only a rejected request can be resubmitted (current: %)', v_r.status using errcode = '22023';
  end if;
  return public.submit_disbursement_request(
    v_r.milestone_id, _gross_amount, _evidence, _retention_amount, _note, _rejected_request_id);
end; $$;

-- 6.7 approve_disbursement_request — NEVER touches balances or milestone status
create or replace function public.approve_disbursement_request(_request_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_r public.disbursement_requests%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_r from public.disbursement_requests where id = _request_id for update;
  if v_r.id is null then raise exception 'Request not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_r.project_id) then
    raise exception 'Not allowed to approve disbursements' using errcode = '42501';
  end if;
  perform private.require_two_actors(v_r.project_id);
  if v_r.status <> 'under_review' then
    raise exception 'Only a reviewed request can be approved (current: %)', v_r.status using errcode = '22023';
  end if;
  if v_actor in (v_r.requested_by, coalesce(v_r.reviewed_by, '00000000-0000-0000-0000-000000000000'::uuid)) then
    raise exception 'The requester or reviewer cannot approve the same request' using errcode = '42501';
  end if;

  -- approval records a decision only: no execution row, no milestone settlement
  update public.disbursement_requests
     set status = 'approved', approved_by = v_actor, approved_at = now(), note = coalesce(_note, note)
   where id = _request_id;

  perform private.log_finance_event('disbursement_requests', _request_id, 'update', v_r.project_id,
    jsonb_build_object('status', 'approved'));
  return now();
end; $$;

-- 6.8 execute_disbursement — the only step that settles anything; idempotent
create or replace function public.execute_disbursement(
  _request_id uuid,
  _idempotency_key text,
  _method text default 'bank_transfer_offline',
  _external_reference text default null,
  _note text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_r public.disbursement_requests%rowtype;
  v_exec_id uuid;
  v_existing public.financial_executions%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_idempotency_key)), 0) < 8 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into v_r from public.disbursement_requests where id = _request_id for update;
  if v_r.id is null then raise exception 'Request not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'execute'::public.app_action, null, v_r.project_id) then
    raise exception 'Not allowed to execute disbursements' using errcode = '42501';
  end if;

  -- replay of the very same call: return the same result instead of failing
  select * into v_existing from public.financial_executions
   where request_id = _request_id and idempotency_key = _idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object('execution_id', v_existing.id, 'deduplicated', true,
                              'executed_at', v_existing.executed_at);
  end if;

  if v_r.status <> 'approved' then
    raise exception 'Only an approved request can be executed (current: %)', v_r.status using errcode = '22023';
  end if;
  if v_actor = v_r.approved_by then
    raise exception 'The approver cannot execute the same request' using errcode = '42501';
  end if;
  perform private.require_two_actors(v_r.project_id);

  insert into public.financial_executions
    (request_id, milestone_id, project_id, idempotency_key, method, external_reference, note, executed_by)
  values (_request_id, v_r.milestone_id, v_r.project_id, _idempotency_key, _method, _external_reference, _note, v_actor)
  on conflict (idempotency_key) do nothing
  returning id into v_exec_id;

  if v_exec_id is null then
    select * into v_existing from public.financial_executions where idempotency_key = _idempotency_key;
    return jsonb_build_object('execution_id', v_existing.id, 'deduplicated', true,
                              'executed_at', v_existing.executed_at);
  end if;

  update public.disbursement_requests
     set status = 'executed', executed_by = v_actor, executed_at = now()
   where id = _request_id;

  update public.payment_milestones set status = 'settled' where id = v_r.milestone_id;

  perform private.log_finance_event('financial_executions', v_exec_id, 'insert', v_r.project_id,
    jsonb_build_object('request_id', _request_id, 'method', _method));

  return jsonb_build_object('execution_id', v_exec_id, 'deduplicated', false, 'executed_at', now());
end; $$;

-- ---------------------------------------------------------
-- 7. execute grants (functions are the only write path)
-- ---------------------------------------------------------
revoke all on function public.create_payment_milestone(uuid,text,numeric,uuid,text,text,date,numeric,int) from public, anon;
revoke all on function public.cancel_payment_milestone(uuid,text) from public, anon;
revoke all on function public.submit_disbursement_request(uuid,numeric,jsonb,numeric,text,uuid) from public, anon;
revoke all on function public.start_disbursement_review(uuid,text) from public, anon;
revoke all on function public.reject_disbursement_request(uuid,text) from public, anon;
revoke all on function public.resubmit_disbursement_request(uuid,numeric,jsonb,numeric,text) from public, anon;
revoke all on function public.approve_disbursement_request(uuid,text) from public, anon;
revoke all on function public.execute_disbursement(uuid,text,text,text,text) from public, anon;

grant execute on function public.create_payment_milestone(uuid,text,numeric,uuid,text,text,date,numeric,int) to authenticated, service_role;
grant execute on function public.cancel_payment_milestone(uuid,text) to authenticated, service_role;
grant execute on function public.submit_disbursement_request(uuid,numeric,jsonb,numeric,text,uuid) to authenticated, service_role;
grant execute on function public.start_disbursement_review(uuid,text) to authenticated, service_role;
grant execute on function public.reject_disbursement_request(uuid,text) to authenticated, service_role;
grant execute on function public.resubmit_disbursement_request(uuid,numeric,jsonb,numeric,text) to authenticated, service_role;
grant execute on function public.approve_disbursement_request(uuid,text) to authenticated, service_role;
grant execute on function public.execute_disbursement(uuid,text,text,text,text) to authenticated, service_role;