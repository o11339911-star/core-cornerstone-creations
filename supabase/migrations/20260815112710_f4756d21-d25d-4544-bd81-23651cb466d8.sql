-- =========================================================
-- Phase 18 — Acceptance, Closure, Warranty, Archive
-- =========================================================

-- ---------- 1) projects closure columns ----------
alter table public.projects
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid,
  add column if not exists closure_note text,
  add column if not exists archived_at timestamptz,
  add column if not exists reopened_count integer not null default 0;

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status = any (array['draft','active','on_hold','completed','cancelled','closed','archived']));

-- ---------- 2) document categories ----------
insert into public.document_categories(code, name_ar, name_en, group_code, is_active, order_index)
values
  ('occupancy_certificate','شهادة إشغال','Occupancy Certificate','certificate', true, 910),
  ('om_manual','كتيب تشغيل وصيانة','O&M Manual','other', true, 920),
  ('warranty_certificate','شهادة ضمان','Warranty Certificate','certificate', true, 930),
  ('as_built','مخططات كما نُفّذت','As-Built Drawings','drawing', true, 940)
on conflict (code) do nothing;

-- ---------- 3) closure checklist ----------
create table public.closure_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  phase text not null check (phase in ('provisional','final')),
  is_required boolean not null default true,
  requires_document_category text references public.document_categories(code),
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_template_id, code)
);
grant select on public.closure_checklist_templates to authenticated;
grant all on public.closure_checklist_templates to service_role;
alter table public.closure_checklist_templates enable row level security;
create policy "checklist templates readable" on public.closure_checklist_templates
  for select to authenticated using (is_active);
create trigger trg_cct_updated before update on public.closure_checklist_templates
  for each row execute function public.set_updated_at();

insert into public.closure_checklist_templates
  (project_template_id, code, name_ar, name_en, phase, is_required, requires_document_category, order_index)
select t.id, v.code, v.name_ar, v.name_en, v.phase, v.is_required, v.cat, v.ord
from public.project_templates t
cross join (values
  ('as_built','المخططات كما نُفّذت','As-built drawings','provisional', true, 'as_built', 10),
  ('site_clearance','إخلاء الموقع ونظافته','Site clearance','provisional', true, null, 20),
  ('punch_list_agreed','اعتماد قائمة النواقص','Punch list agreed','provisional', true, null, 30),
  ('occupancy_certificate','شهادة الإشغال','Occupancy certificate','final', true, 'occupancy_certificate', 40),
  ('om_manuals','كتيبات التشغيل والصيانة','O&M manuals','final', true, 'om_manual', 50),
  ('warranties_registered','تسجيل الضمانات','Warranties registered','final', true, null, 60),
  ('final_settlement','إقرار التسوية النهائية','Final settlement acknowledgement','final', true, null, 70)
) as v(code,name_ar,name_en,phase,is_required,cat,ord)
on conflict do nothing;

create table public.project_closure_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  template_item_id uuid references public.closure_checklist_templates(id),
  code text not null,
  name_ar text not null,
  name_en text not null,
  phase text not null check (phase in ('provisional','final')),
  is_required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','satisfied','waived')),
  document_id uuid references public.documents(id),
  satisfied_by uuid,
  satisfied_at timestamptz,
  waiver_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, phase, code)
);
grant select on public.project_closure_items to authenticated;
grant all on public.project_closure_items to service_role;
alter table public.project_closure_items enable row level security;
create policy "closure items readable by project access" on public.project_closure_items
  for select to authenticated using (private.can_access_project(auth.uid(), project_id));
create trigger trg_pci_updated before update on public.project_closure_items
  for each row execute function public.set_updated_at();

-- ---------- 4) acceptances ----------
create table public.acceptance_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);
grant select on public.acceptance_status_transitions to authenticated;
grant all on public.acceptance_status_transitions to service_role;
alter table public.acceptance_status_transitions enable row level security;
create policy "transitions readable" on public.acceptance_status_transitions
  for select to authenticated using (true);
insert into public.acceptance_status_transitions(from_status,to_status) values
  ('requested','inspected'),
  ('requested','rejected'),
  ('inspected','accepted'),
  ('inspected','accepted_with_defects'),
  ('inspected','rejected'),
  ('accepted_with_defects','accepted');

create table public.project_acceptances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  phase text not null check (phase in ('provisional','final')),
  status text not null default 'requested'
    check (status in ('requested','inspected','accepted_with_defects','accepted','rejected')),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  inspected_by uuid,
  inspected_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  certificate_document_id uuid references public.documents(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index project_acceptances_open_uq on public.project_acceptances(project_id, phase)
  where status not in ('accepted','rejected');
grant select on public.project_acceptances to authenticated;
grant all on public.project_acceptances to service_role;
alter table public.project_acceptances enable row level security;
create policy "acceptances readable by project access" on public.project_acceptances
  for select to authenticated using (private.can_access_project(auth.uid(), project_id));
create trigger trg_pa_updated before update on public.project_acceptances
  for each row execute function public.set_updated_at();

create or replace function public.enforce_acceptance_flow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if not exists (select 1 from public.acceptance_status_transitions t
                    where t.from_status = old.status and t.to_status = new.status) then
      raise exception 'ACCEPTANCE_INVALID_TRANSITION: % -> %', old.status, new.status using errcode='22023';
    end if;
    if new.status in ('accepted','accepted_with_defects','rejected') then
      if new.decided_by is null then
        raise exception 'ACCEPTANCE_DECIDER_REQUIRED' using errcode='22023';
      end if;
      if new.decided_by = new.requested_by then
        raise exception 'ACCEPTANCE_SOD_VIOLATION' using errcode='22023';
      end if;
    end if;
  end if;
  return new;
end; $$;
create trigger trg_acceptance_flow before update on public.project_acceptances
  for each row execute function public.enforce_acceptance_flow();

-- ---------- 5) punch list ----------
create table public.punch_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  acceptance_id uuid references public.project_acceptances(id) on delete set null,
  stage_id uuid references public.project_stages(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'minor' check (severity in ('minor','major','critical')),
  raised_by uuid not null,
  raised_at timestamptz not null default now(),
  assigned_party_id uuid references public.project_parties(id),
  assigned_user_id uuid,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open','in_progress','submitted','verified','rejected','closed')),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.punch_items to authenticated;
grant all on public.punch_items to service_role;
alter table public.punch_items enable row level security;
create policy "punch items readable by project access" on public.punch_items
  for select to authenticated using (private.can_access_project(auth.uid(), project_id));
create trigger trg_punch_updated before update on public.punch_items
  for each row execute function public.set_updated_at();

create table public.punch_item_evidence (
  id uuid primary key default gen_random_uuid(),
  punch_item_id uuid not null references public.punch_items(id) on delete cascade,
  kind text not null check (kind in ('before','after')),
  document_id uuid not null references public.documents(id),
  note text,
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);
grant select on public.punch_item_evidence to authenticated;
grant all on public.punch_item_evidence to service_role;
alter table public.punch_item_evidence enable row level security;
create policy "punch evidence readable by project access" on public.punch_item_evidence
  for select to authenticated using (
    exists (select 1 from public.punch_items p
             where p.id = punch_item_id and private.can_access_project(auth.uid(), p.project_id))
  );
create trigger trg_punch_evidence_immutable before update or delete on public.punch_item_evidence
  for each row execute function public.prevent_row_mutation();

create or replace function public.enforce_punch_flow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    if not exists (select 1 from public.punch_item_evidence e where e.punch_item_id = new.id and e.kind='before')
       or not exists (select 1 from public.punch_item_evidence e where e.punch_item_id = new.id and e.kind='after') then
      raise exception 'PUNCH_EVIDENCE_REQUIRED' using errcode='22023';
    end if;
  end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then
    if new.closed_by is null then
      raise exception 'PUNCH_CLOSER_REQUIRED' using errcode='22023';
    end if;
    if new.assigned_user_id is not null and new.closed_by = new.assigned_user_id then
      raise exception 'PUNCH_SOD_VIOLATION' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_punch_flow before update on public.punch_items
  for each row execute function public.enforce_punch_flow();

-- ---------- 6) warranties ----------
create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_id uuid not null references public.entities(id),
  scope_kind text not null default 'system' check (scope_kind in ('system','component','whole_project')),
  title text not null,
  system_code text,
  provider_kind text not null default 'contractor' check (provider_kind in ('contractor','supplier')),
  provider_party_id uuid references public.project_parties(id),
  provider_name text,
  warranty_type text not null default 'workmanship'
    check (warranty_type in ('workmanship','material','equipment','structural')),
  starts_on date not null,
  ends_on date not null,
  document_id uuid references public.documents(id),
  status text not null default 'active' check (status in ('active','expired','void')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.warranties to authenticated;
grant all on public.warranties to service_role;
alter table public.warranties enable row level security;
create policy "warranties readable by project access" on public.warranties
  for select to authenticated using (private.can_access_project(auth.uid(), project_id));
create trigger trg_warranty_updated before update on public.warranties
  for each row execute function public.set_updated_at();

create or replace function public.validate_warranty_dates()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ends_on <= new.starts_on then
    raise exception 'WARRANTY_INVALID_PERIOD' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger trg_warranty_dates before insert or update on public.warranties
  for each row execute function public.validate_warranty_dates();

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  warranty_id uuid not null references public.warranties(id) on delete cascade,
  raised_by uuid not null,
  description text not null,
  status text not null default 'open' check (status in ('open','accepted','rejected','resolved')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.warranty_claims to authenticated;
grant all on public.warranty_claims to service_role;
alter table public.warranty_claims enable row level security;
create policy "warranty claims readable by project access" on public.warranty_claims
  for select to authenticated using (
    exists (select 1 from public.warranties w
             where w.id = warranty_id and private.can_access_project(auth.uid(), w.project_id))
  );
create trigger trg_wclaim_updated before update on public.warranty_claims
  for each row execute function public.set_updated_at();

-- reuse existing duration/escalation infrastructure for warranty expiry
alter table public.duration_timers drop constraint duration_timers_kind_ck;
alter table public.duration_timers add constraint duration_timers_kind_ck
  check (subject_kind = any (array['request','stage','milestone','retention','warranty']));
alter table public.escalation_policies drop constraint escalation_policies_kind_ck;
alter table public.escalation_policies add constraint escalation_policies_kind_ck
  check (subject_kind = any (array['request','stage','milestone','retention','warranty']));

create or replace function public.sync_warranty_timer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_due timestamptz;
begin
  select b.day_end into v_due
    from private.riyadh_day_bounds((new.ends_on::timestamp at time zone 'Asia/Riyadh')) b;

  if tg_op = 'INSERT' then
    insert into public.duration_timers(subject_kind, subject_id, project_id, entity_id, started_at, due_at, state)
    values ('warranty', new.id, new.project_id, new.entity_id, now(), v_due,
            case when new.status = 'active' then 'running' else 'stopped' end)
    on conflict (subject_kind, subject_id) do update
      set due_at = excluded.due_at, state = excluded.state, updated_at = now();
  else
    update public.duration_timers
       set due_at = v_due,
           state = case when new.status = 'active' then 'running' else 'stopped' end,
           stopped_at = case when new.status = 'active' then null else now() end,
           updated_at = now()
     where subject_kind = 'warranty' and subject_id = new.id;
  end if;
  return new;
end; $$;
create trigger trg_warranty_timer after insert or update on public.warranties
  for each row execute function public.sync_warranty_timer();

alter table public.notification_types drop constraint if exists notification_types_target_kind_check;
alter table public.notification_types add constraint notification_types_target_kind_check
  check (target_kind = any (array['request','stage','contract','document','disbursement','financial_document','milestone','retention','membership','warranty']));

insert into public.notification_types(code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind)
values
  ('warranty.pre_expiry','reminder','in_app', false, false,'notif.warranty.preExpiry.subject','notif.warranty.preExpiry.body','warranty'),
  ('warranty.expired','overdue','in_app', true, false,'notif.warranty.expired.subject','notif.warranty.expired.body','warranty')
on conflict (code) do nothing;

-- ---------- 7) extend the existing scan (no parallel engine) ----------
create or replace function public.run_duration_scan()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.duration_timers%rowtype; eff timestamptz; bucket text; overdue_hours numeric;
        rcpt uuid; pol public.escalation_policies%rowtype; stp public.escalation_steps%rowtype; nid uuid;
        v_pre int := 0; v_over int := 0; v_esc int := 0; v_skipped int := 0;
        pre_code text; over_code text;
begin
  for t in select * from public.duration_timers where state = 'running' and due_at is not null loop
    eff := private.timer_effective_now(t);
    if t.subject_kind = 'warranty' then
      pre_code := 'warranty.pre_expiry'; over_code := 'warranty.expired';
    else
      pre_code := 'duration.pre_due'; over_code := 'duration.overdue';
    end if;

    if eff < t.due_at then
      if t.subject_kind = 'warranty' then
        bucket := case
          when eff >= t.due_at - interval '7 days' then 'due-7d'
          when eff >= t.due_at - interval '30 days' then 'due-30d'
          when eff >= t.due_at - interval '90 days' then 'due-90d'
          else null end;
      else
        bucket := case
          when eff >= t.due_at - interval '1 day' then 'due-1d'
          when eff >= t.due_at - interval '3 days' then 'due-3d'
          else null end;
      end if;
      if bucket is not null and coalesce(t.last_pre_due_bucket,'') is distinct from bucket then
        for rcpt in select * from private.timer_recipients(t) loop
          if private.emit_notification(rcpt, pre_code, t.project_id, t.entity_id,
               t.subject_kind, t.subject_id,
               jsonb_build_object('subject_kind', t.subject_kind, 'bucket', bucket),
               bucket, 'warning') is not null then
            v_pre := v_pre + 1;
          end if;
        end loop;
        update public.duration_timers set last_pre_due_bucket = bucket where id = t.id;
      end if;
    else
      overdue_hours := extract(epoch from (eff - t.due_at)) / 3600.0;
      bucket := case
        when overdue_hours >= 168 then 'overdue-d7'
        when overdue_hours >= 72 then 'overdue-d3'
        when overdue_hours >= 24 then 'overdue-d1'
        else 'overdue-d0' end;
      if coalesce(t.last_overdue_bucket,'') is distinct from bucket then
        for rcpt in select * from private.timer_recipients(t) loop
          if private.emit_notification(rcpt, over_code, t.project_id, t.entity_id,
               t.subject_kind, t.subject_id,
               jsonb_build_object('subject_kind', t.subject_kind, 'bucket', bucket),
               bucket, 'critical') is not null then
            v_over := v_over + 1;
          end if;
        end loop;
        update public.duration_timers set last_overdue_bucket = bucket where id = t.id;
      end if;

      for pol in
        select * from public.escalation_policies p
         where p.is_active
           and p.subject_kind = t.subject_kind
           and (p.project_id is null or p.project_id = t.project_id)
           and (p.contract_id is null or p.contract_id = t.contract_id)
           and (t.entity_id is null or p.entity_id = t.entity_id)
      loop
        for stp in select * from public.escalation_steps s where s.policy_id = pol.id order by s.step_no loop
          continue when overdue_hours < (pol.trigger_after_hours + stp.delay_hours);
          continue when exists (select 1 from public.escalation_events e
                                 where e.timer_id = t.id and e.policy_id = pol.id and e.step_no = stp.step_no);
          rcpt := private.resolve_escalation_recipient(t, stp);
          if rcpt is null then
            insert into public.escalation_events(timer_id, policy_id, step_no, project_id, reason)
            values (t.id, pol.id, stp.step_no, t.project_id, 'recipient_unresolved')
            on conflict do nothing;
            v_skipped := v_skipped + 1;
          else
            nid := private.emit_notification(rcpt, 'escalation.raised', t.project_id, t.entity_id,
                     t.subject_kind, t.subject_id,
                     jsonb_build_object('subject_kind', t.subject_kind, 'policy_id', pol.id, 'step_no', stp.step_no),
                     pol.id::text || ':' || stp.step_no::text, 'critical');
            insert into public.escalation_events(timer_id, policy_id, step_no, project_id, resolved_recipient_user_id, notification_id, reason)
            values (t.id, pol.id, stp.step_no, t.project_id, rcpt, nid, 'policy_step')
            on conflict do nothing;
            v_esc := v_esc + 1;
          end if;
        end loop;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('pre_due', v_pre, 'overdue', v_over, 'escalations', v_esc, 'unresolved', v_skipped);
end; $$;

-- warranty target resolution at click time
create or replace function public.resolve_notification_target(_notification_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n record; ok boolean := false; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
  select * into n from public.notifications where id = _notification_id and recipient_user_id = uid;
  if n is null or private.user_is_suspended(uid) then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  if n.target_kind = 'request' then
    ok := exists (select 1 from public.requests r where r.id = n.target_id)
          and private.can_access_request(uid, n.target_id);
  elsif n.target_kind = 'stage' then
    ok := exists (select 1 from public.project_stages s where s.id = n.target_id)
          and private.can_access_stage(uid, n.target_id, n.project_id);
  elsif n.target_kind = 'contract' then
    ok := exists (select 1 from public.contracts c where c.id = n.target_id)
          and private.can_access_contract(uid, n.target_id);
  elsif n.target_kind = 'document' then
    ok := exists (select 1 from public.documents d where d.id = n.target_id)
          and private.can_access_document(uid, n.target_id, 'view');
  elsif n.target_kind = 'warranty' then
    ok := exists (select 1 from public.warranties w where w.id = n.target_id)
          and n.project_id is not null and private.can_access_project(uid, n.project_id);
  elsif n.target_kind in ('disbursement','financial_document','milestone','retention') then
    ok := n.project_id is not null and private.can_view_project_finance(uid, n.project_id)
          and case n.target_kind
                when 'disbursement' then exists (select 1 from public.disbursement_requests x where x.id = n.target_id)
                when 'financial_document' then exists (select 1 from public.financial_documents x where x.id = n.target_id)
                when 'milestone' then exists (select 1 from public.payment_milestones x where x.id = n.target_id)
                else exists (select 1 from public.retention_holds x where x.id = n.target_id)
              end;
  elsif n.target_kind = 'membership' then
    ok := exists (select 1 from public.entity_memberships m where m.id = n.target_id and m.user_id = uid);
  end if;

  if not ok then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
  return jsonb_build_object('target_kind', n.target_kind, 'target_id', n.target_id, 'project_id', n.project_id);
end; $$;

-- ---------- 8) reopen requests ----------
create table public.project_reopen_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requested_by uuid not null,
  reason text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.project_reopen_requests to authenticated;
grant all on public.project_reopen_requests to service_role;
alter table public.project_reopen_requests enable row level security;
create policy "reopen requests readable by project access" on public.project_reopen_requests
  for select to authenticated using (private.can_access_project(auth.uid(), project_id));
create trigger trg_reopen_updated before update on public.project_reopen_requests
  for each row execute function public.set_updated_at();

create or replace function public.enforce_reopen_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.reason is null or length(btrim(new.reason)) < 10 then
      raise exception 'REOPEN_REASON_REQUIRED' using errcode='22023';
    end if;
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'REOPEN_DECISION_IMMUTABLE' using errcode='22023';
  end if;
  if new.status <> 'pending' then
    if new.decided_by is null then
      raise exception 'REOPEN_DECIDER_REQUIRED' using errcode='22023';
    end if;
    if new.decided_by = new.requested_by then
      raise exception 'REOPEN_SOD_VIOLATION' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_reopen_rules before insert or update on public.project_reopen_requests
  for each row execute function public.enforce_reopen_rules();

-- ---------- 9) read-only archive guards ----------
create or replace function private.assert_project_open(_pid uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if _pid is null then return; end if;
  if exists (select 1 from public.projects p where p.id = _pid and p.status in ('closed','archived')) then
    raise exception 'PROJECT_CLOSED_READ_ONLY: %', _pid using errcode='22023';
  end if;
end; $$;

create or replace function public.guard_closed_project()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if tg_op = 'DELETE' then
    execute format('select ($1).%I', 'project_id') into pid using old;
    perform private.assert_project_open(pid);
    return old;
  else
    execute format('select ($1).%I', 'project_id') into pid using new;
    perform private.assert_project_open(pid);
    return new;
  end if;
end; $$;

create trigger trg_guard_closed before insert or update or delete on public.project_stages
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.requests
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.site_visits
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.reports
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.contracts
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.payment_milestones
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.disbursement_requests
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.project_parties
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.punch_items
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.warranties
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.project_closure_items
  for each row execute function public.guard_closed_project();
create trigger trg_guard_closed before insert or update or delete on public.project_acceptances
  for each row execute function public.guard_closed_project();

create or replace function public.guard_closed_project_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if r.context_type = 'project' then
    perform private.assert_project_open(r.context_id);
  end if;
  return r;
end; $$;
create trigger trg_guard_closed before insert or update or delete on public.document_links
  for each row execute function public.guard_closed_project_link();

-- the projects row itself: the ONLY permitted write on a closed project is the
-- reopen transition performed inside the same transaction that approved it.
create or replace function public.guard_closed_project_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('closed','archived') then
      raise exception 'PROJECT_CLOSED_READ_ONLY: %', old.id using errcode='22023';
    end if;
    return old;
  end if;
  if old.status in ('closed','archived') then
    if not (new.status = 'active'
            and new.closed_at is null
            and new.archived_at is null
            and exists (select 1 from public.project_reopen_requests rr
                         where rr.project_id = old.id
                           and rr.status = 'approved'
                           and rr.decided_at = transaction_timestamp())) then
      raise exception 'PROJECT_CLOSED_READ_ONLY: %', old.id using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_guard_closed_project_row before update or delete on public.projects
  for each row execute function public.guard_closed_project_row();

-- ---------- 10) closure / acceptance RPCs ----------
create or replace function public.request_acceptance(_project_id uuid, _phase text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_id uuid; v_tpl uuid;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if _phase not in ('provisional','final') then raise exception 'INVALID_PHASE' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'update', null, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if _phase = 'final' and not exists (
      select 1 from public.project_acceptances a
       where a.project_id = _project_id and a.phase = 'provisional'
         and a.status in ('accepted','accepted_with_defects')) then
    raise exception 'PROVISIONAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;

  insert into public.project_acceptances(project_id, phase, requested_by)
  values (_project_id, _phase, uid) returning id into v_id;

  select p.project_template_id into v_tpl from public.projects p where p.id = _project_id;
  insert into public.project_closure_items(project_id, template_item_id, code, name_ar, name_en, phase, is_required)
  select _project_id, t.id, t.code, t.name_ar, t.name_en, t.phase, t.is_required
    from public.closure_checklist_templates t
   where t.project_template_id = v_tpl and t.is_active and t.phase = _phase
  on conflict (project_id, phase, code) do nothing;

  return v_id;
end; $$;

create or replace function public.record_acceptance_inspection(_acceptance_id uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a public.project_acceptances%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into a from public.project_acceptances where id = _acceptance_id;
  if a is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'update', null, a.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  update public.project_acceptances
     set status = 'inspected', inspected_by = uid, inspected_at = now(),
         decision_note = coalesce(_note, decision_note)
   where id = _acceptance_id;
end; $$;

create or replace function public.decide_acceptance(_acceptance_id uuid, _decision text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a public.project_acceptances%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if _decision not in ('accepted','accepted_with_defects','rejected') then
    raise exception 'INVALID_DECISION' using errcode='22023';
  end if;
  select * into a from public.project_acceptances where id = _acceptance_id;
  if a is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'approve', null, a.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  update public.project_acceptances
     set status = _decision, decided_by = uid, decided_at = now(),
         decision_note = coalesce(_note, decision_note)
   where id = _acceptance_id;
end; $$;

create or replace function public.set_closure_item_status(
  _item_id uuid, _status text, _document_id uuid default null, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it public.project_closure_items%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if _status not in ('pending','satisfied','waived') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  select * into it from public.project_closure_items where id = _item_id;
  if it is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'update', null, it.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if _status = 'waived' and (_reason is null or length(btrim(_reason)) < 10) then
    raise exception 'WAIVER_REASON_REQUIRED' using errcode='22023';
  end if;

  update public.project_closure_items
     set status = _status,
         document_id = coalesce(_document_id, document_id),
         waiver_reason = case when _status = 'waived' then _reason else waiver_reason end,
         satisfied_by = case when _status = 'pending' then null else uid end,
         satisfied_at = case when _status = 'pending' then null else now() end
   where id = _item_id;

  if _status = 'waived' then
    insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, new_value)
    values (uid, it.project_id, 'closure_item', _item_id, 'waived', jsonb_build_object('reason', _reason));
  end if;
end; $$;

-- ---------- 11) punch RPCs ----------
create or replace function public.raise_punch_item(
  _project_id uuid, _title text, _description text default null, _severity text default 'minor',
  _acceptance_id uuid default null, _assigned_user_id uuid default null, _due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_id uuid;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not private.can(uid, 'projects', 'update', null, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  insert into public.punch_items(project_id, acceptance_id, title, description, severity, raised_by, assigned_user_id, due_at)
  values (_project_id, _acceptance_id, _title, _description, coalesce(_severity,'minor'), uid, _assigned_user_id, _due_at)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.add_punch_evidence(
  _item_id uuid, _kind text, _document_id uuid, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it public.punch_items%rowtype; v_id uuid;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if _kind not in ('before','after') then raise exception 'INVALID_KIND' using errcode='22023'; end if;
  select * into it from public.punch_items where id = _item_id;
  if it is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'update', null, it.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  insert into public.punch_item_evidence(punch_item_id, kind, document_id, note, uploaded_by)
  values (_item_id, _kind, _document_id, _note, uid) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.set_punch_item_status(_item_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it public.punch_items%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if _status not in ('open','in_progress','submitted','verified','rejected','closed') then
    raise exception 'INVALID_STATUS' using errcode='22023';
  end if;
  select * into it from public.punch_items where id = _item_id;
  if it is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'update', null, it.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  update public.punch_items
     set status = _status,
         closed_by = case when _status = 'closed' then uid else closed_by end,
         closed_at = case when _status = 'closed' then now() else closed_at end
   where id = _item_id;
end; $$;

-- ---------- 12) warranty RPC ----------
create or replace function public.register_warranty(
  _project_id uuid, _title text, _warranty_type text, _starts_on date, _ends_on date,
  _scope_kind text default 'system', _system_code text default null,
  _provider_kind text default 'contractor', _provider_party_id uuid default null,
  _provider_name text default null, _document_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_entity uuid; v_id uuid;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not private.can(uid, 'projects', 'update', null, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  select entity_id into v_entity from public.projects where id = _project_id;
  insert into public.warranties(project_id, entity_id, scope_kind, title, system_code, provider_kind,
                                provider_party_id, provider_name, warranty_type, starts_on, ends_on,
                                document_id, created_by)
  values (_project_id, v_entity, coalesce(_scope_kind,'system'), _title, _system_code,
          coalesce(_provider_kind,'contractor'), _provider_party_id, _provider_name,
          coalesce(_warranty_type,'workmanship'), _starts_on, _ends_on, _document_id, uid)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- 13) close project ----------
create or replace function public.close_project(_project_id uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_open int; v_pending int;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not private.can(uid, 'projects', 'approve', null, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists (select 1 from public.project_acceptances a
                  where a.project_id = _project_id and a.phase = 'final' and a.status = 'accepted') then
    raise exception 'FINAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select count(*) into v_open from public.punch_items p
   where p.project_id = _project_id and p.status not in ('closed','rejected');
  if v_open > 0 then
    raise exception 'OPEN_PUNCH_ITEMS: %', v_open using errcode='22023';
  end if;
  select count(*) into v_pending from public.project_closure_items i
   where i.project_id = _project_id and i.is_required and i.status = 'pending';
  if v_pending > 0 then
    raise exception 'PENDING_CLOSURE_ITEMS: %', v_pending using errcode='22023';
  end if;

  update public.projects
     set status = 'closed', closed_at = now(), closed_by = uid,
         closure_note = _note, archived_at = now()
   where id = _project_id;

  insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, new_value)
  values (uid, _project_id, 'project', _project_id, 'closed', jsonb_build_object('note', _note));
end; $$;

-- ---------- 14) reopen RPCs ----------
create or replace function public.request_project_reopen(_project_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_id uuid;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not private.can(uid, 'projects', 'update', null, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists (select 1 from public.projects p where p.id = _project_id and p.status in ('closed','archived')) then
    raise exception 'PROJECT_NOT_CLOSED' using errcode='22023';
  end if;
  insert into public.project_reopen_requests(project_id, requested_by, reason)
  values (_project_id, uid, _reason) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.decide_project_reopen(_request_id uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.project_reopen_requests%rowtype; p public.projects%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into r from public.project_reopen_requests where id = _request_id;
  if r is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'approve', null, r.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if uid = r.requested_by then
    raise exception 'REOPEN_SOD_VIOLATION' using errcode='22023';
  end if;

  select * into p from public.projects where id = r.project_id;

  update public.project_reopen_requests
     set status = case when _approve then 'approved' else 'rejected' end,
         decided_by = uid,
         decided_at = transaction_timestamp(),
         decision_note = _note
   where id = _request_id;

  if _approve then
    update public.projects
       set status = 'active', closed_at = null, archived_at = null,
           reopened_count = reopened_count + 1
     where id = r.project_id;
  end if;

  insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (uid, r.project_id, 'project_reopen', _request_id,
          case when _approve then 'reopen_approved' else 'reopen_rejected' end,
          jsonb_build_object('status', p.status, 'closed_at', p.closed_at, 'requested_by', r.requested_by),
          jsonb_build_object('status', case when _approve then 'active' else p.status end,
                             'reason', r.reason, 'decided_by', uid, 'note', _note));
end; $$;

-- ---------- 15) portfolio (track record) ----------
create table public.portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  title_ar text not null,
  title_en text not null,
  summary_ar text,
  summary_en text,
  project_type_code text,
  city text,
  district text,
  completed_on date,
  is_public boolean not null default false,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.portfolio_entries to authenticated;
grant select on public.portfolio_entries to anon;
grant all on public.portfolio_entries to service_role;
alter table public.portfolio_entries enable row level security;
create policy "portfolio public read" on public.portfolio_entries
  for select to anon, authenticated using (is_public);
create policy "portfolio entity read" on public.portfolio_entries
  for select to authenticated using (
    exists (select 1 from public.entity_memberships m
             where m.entity_id = portfolio_entries.entity_id and m.user_id = auth.uid() and m.status = 'active')
  );
create trigger trg_portfolio_updated before update on public.portfolio_entries
  for each row execute function public.set_updated_at();

create table public.portfolio_assets (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.portfolio_entries(id) on delete cascade,
  document_id uuid not null references public.documents(id),
  created_at timestamptz not null default now(),
  unique (entry_id, document_id)
);
grant select on public.portfolio_assets to authenticated;
grant select on public.portfolio_assets to anon;
grant all on public.portfolio_assets to service_role;
alter table public.portfolio_assets enable row level security;
create policy "portfolio assets follow entry" on public.portfolio_assets
  for select to anon, authenticated using (
    exists (select 1 from public.portfolio_entries e where e.id = entry_id and e.is_public)
  );

create or replace function public.enforce_portfolio_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.projects p
                  where p.id = new.project_id and p.status in ('closed','archived')) then
    raise exception 'PORTFOLIO_PROJECT_NOT_CLOSED' using errcode='22023';
  end if;
  if not exists (select 1 from public.project_acceptances a
                  where a.project_id = new.project_id and a.phase = 'final' and a.status = 'accepted') then
    raise exception 'PORTFOLIO_FINAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger trg_portfolio_source before insert or update on public.portfolio_entries
  for each row execute function public.enforce_portfolio_source();

create or replace function public.enforce_portfolio_no_financial_leak()
returns trigger language plpgsql security definer set search_path = public as $$
declare blob text;
begin
  blob := lower(concat_ws(' ', new.title_ar, new.title_en, new.summary_ar, new.summary_en));
  if blob ~ '[0-9][0-9,\.]{3,}' then
    raise exception 'PORTFOLIO_FINANCIAL_VALUE_FORBIDDEN' using errcode='22023';
  end if;
  if blob ~ '(ريال|ر\.س|﷼|sar|usd|\$|قيمة العقد|مبلغ|تكلفة)' then
    raise exception 'PORTFOLIO_FINANCIAL_TERM_FORBIDDEN' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger trg_portfolio_no_finance before insert or update on public.portfolio_entries
  for each row execute function public.enforce_portfolio_no_financial_leak();

create or replace function public.enforce_portfolio_asset_public()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.documents d
                  where d.id = new.document_id
                    and d.status = 'approved'
                    and d.visibility = 'public_approved'
                    and coalesce(d.is_deleted,false) = false) then
    raise exception 'PORTFOLIO_ASSET_NOT_PUBLIC' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger trg_portfolio_asset_public before insert or update on public.portfolio_assets
  for each row execute function public.enforce_portfolio_asset_public();

create or replace function public.publish_portfolio_entry(
  _project_id uuid, _title_ar text, _title_en text,
  _summary_ar text default null, _summary_en text default null, _is_public boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.projects%rowtype; v_id uuid; v_type text; v_done date;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into p from public.projects where id = _project_id;
  if p is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'share', p.entity_id, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  select t.code into v_type from public.project_templates t where t.id = p.project_template_id;
  select max(a.decided_at)::date into v_done from public.project_acceptances a
   where a.project_id = _project_id and a.phase = 'final' and a.status = 'accepted';

  insert into public.portfolio_entries(entity_id, project_id, title_ar, title_en, summary_ar, summary_en,
                                       project_type_code, city, district, completed_on, is_public, published_by)
  values (p.entity_id, _project_id, _title_ar, _title_en, _summary_ar, _summary_en,
          v_type, p.city, p.district, v_done, coalesce(_is_public,true), uid)
  on conflict (project_id) do update
    set title_ar = excluded.title_ar, title_en = excluded.title_en,
        summary_ar = excluded.summary_ar, summary_en = excluded.summary_en,
        is_public = excluded.is_public, updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- 16) minimal privileges ----------
revoke insert, update, delete, truncate on public.closure_checklist_templates from anon, authenticated;
revoke insert, update, delete, truncate on public.project_closure_items from anon, authenticated;
revoke insert, update, delete, truncate on public.acceptance_status_transitions from anon, authenticated;
revoke insert, update, delete, truncate on public.project_acceptances from anon, authenticated;
revoke insert, update, delete, truncate on public.punch_items from anon, authenticated;
revoke insert, update, delete, truncate on public.punch_item_evidence from anon, authenticated;
revoke insert, update, delete, truncate on public.warranties from anon, authenticated;
revoke insert, update, delete, truncate on public.warranty_claims from anon, authenticated;
revoke insert, update, delete, truncate on public.project_reopen_requests from anon, authenticated;
revoke insert, update, delete, truncate on public.portfolio_entries from anon, authenticated;
revoke insert, update, delete, truncate on public.portfolio_assets from anon, authenticated;
revoke select on public.closure_checklist_templates from anon;
revoke select on public.project_closure_items from anon;
revoke select on public.acceptance_status_transitions from anon;
revoke select on public.project_acceptances from anon;
revoke select on public.punch_items from anon;
revoke select on public.punch_item_evidence from anon;
revoke select on public.warranties from anon;
revoke select on public.warranty_claims from anon;
revoke select on public.project_reopen_requests from anon;

revoke execute on function private.assert_project_open(uuid) from anon, authenticated;
revoke execute on function public.guard_closed_project() from anon, authenticated;
revoke execute on function public.guard_closed_project_link() from anon, authenticated;
revoke execute on function public.guard_closed_project_row() from anon, authenticated;
revoke execute on function public.enforce_acceptance_flow() from anon, authenticated;
revoke execute on function public.enforce_punch_flow() from anon, authenticated;
revoke execute on function public.enforce_reopen_rules() from anon, authenticated;
revoke execute on function public.sync_warranty_timer() from anon, authenticated;
revoke execute on function public.validate_warranty_dates() from anon, authenticated;
revoke execute on function public.enforce_portfolio_source() from anon, authenticated;
revoke execute on function public.enforce_portfolio_no_financial_leak() from anon, authenticated;
revoke execute on function public.enforce_portfolio_asset_public() from anon, authenticated;

revoke execute on function public.request_acceptance(uuid, text) from anon;
revoke execute on function public.record_acceptance_inspection(uuid, text) from anon;
revoke execute on function public.decide_acceptance(uuid, text, text) from anon;
revoke execute on function public.set_closure_item_status(uuid, text, uuid, text) from anon;
revoke execute on function public.raise_punch_item(uuid, text, text, text, uuid, uuid, timestamptz) from anon;
revoke execute on function public.add_punch_evidence(uuid, text, uuid, text) from anon;
revoke execute on function public.set_punch_item_status(uuid, text) from anon;
revoke execute on function public.register_warranty(uuid, text, text, date, date, text, text, text, uuid, text, uuid) from anon;
revoke execute on function public.close_project(uuid, text) from anon;
revoke execute on function public.request_project_reopen(uuid, text) from anon;
revoke execute on function public.decide_project_reopen(uuid, boolean, text) from anon;
revoke execute on function public.publish_portfolio_entry(uuid, text, text, text, text, boolean) from anon;