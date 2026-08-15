-- =====================================================================
-- Phase 17-B — duration timers, escalation, digest
-- =====================================================================

-- 1) Single time source ------------------------------------------------
create or replace function private.riyadh_now()
returns timestamptz language sql stable security definer set search_path = public as $$
  select now();
$$;

create or replace function private.riyadh_day_bounds(_at timestamptz default now())
returns table(day_start timestamptz, day_end timestamptz)
language sql stable security definer set search_path = public as $$
  select
    (date_trunc('day', _at at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'),
    (date_trunc('day', _at at time zone 'Asia/Riyadh') + interval '1 day') at time zone 'Asia/Riyadh';
$$;

revoke execute on function private.riyadh_now() from public;
revoke execute on function private.riyadh_day_bounds(timestamptz) from public;

-- 2) Duration timers ---------------------------------------------------
create table public.duration_timers (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null,
  subject_id uuid not null,
  project_id uuid references public.projects(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  started_at timestamptz not null default now(),
  due_at timestamptz,
  paused_at timestamptz,
  total_paused_seconds integer not null default 0,
  stopped_at timestamptz,
  state text not null default 'running',
  last_pre_due_bucket text,
  last_overdue_bucket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duration_timers_kind_ck check (subject_kind in ('request','stage','milestone','retention')),
  constraint duration_timers_state_ck check (state in ('running','paused','stopped')),
  constraint duration_timers_subject_uk unique (subject_kind, subject_id)
);
create index duration_timers_scan_idx on public.duration_timers(state, due_at);
create index duration_timers_project_idx on public.duration_timers(project_id);

grant select on public.duration_timers to authenticated;
grant all on public.duration_timers to service_role;
alter table public.duration_timers enable row level security;

create policy "timers readable by project members"
  on public.duration_timers for select to authenticated
  using (project_id is not null and private.can_access_project(auth.uid(), project_id));

create trigger duration_timers_updated_at before update on public.duration_timers
  for each row execute function public.set_updated_at();

-- effective elapsed seconds, excluding paused windows
create or replace function private.timer_effective_now(_t public.duration_timers)
returns timestamptz language sql stable security definer set search_path = public as $$
  select now()
    - make_interval(secs => _t.total_paused_seconds)
    - case when _t.state = 'paused' and _t.paused_at is not null
           then (now() - _t.paused_at) else interval '0' end;
$$;

-- timer maintenance helpers (called from triggers only)
create or replace function private.timer_start(
  _kind text, _subject uuid, _project uuid, _entity uuid, _contract uuid,
  _started timestamptz, _due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.duration_timers(subject_kind, subject_id, project_id, entity_id, contract_id, started_at, due_at, state)
  values (_kind, _subject, _project, _entity, _contract, coalesce(_started, now()), _due, 'running')
  on conflict (subject_kind, subject_id) do update
    set due_at = coalesce(excluded.due_at, public.duration_timers.due_at),
        state = case when public.duration_timers.state = 'stopped' then 'stopped' else 'running' end;
end; $$;

create or replace function private.timer_pause(_kind text, _subject uuid)
returns void language sql security definer set search_path = public as $$
  update public.duration_timers
     set state = 'paused', paused_at = now()
   where subject_kind = _kind and subject_id = _subject and state = 'running';
$$;

create or replace function private.timer_resume(_kind text, _subject uuid)
returns void language sql security definer set search_path = public as $$
  update public.duration_timers
     set state = 'running',
         total_paused_seconds = total_paused_seconds
           + greatest(0, extract(epoch from (now() - coalesce(paused_at, now())))::int),
         paused_at = null
   where subject_kind = _kind and subject_id = _subject and state = 'paused';
$$;

create or replace function private.timer_stop(_kind text, _subject uuid)
returns void language sql security definer set search_path = public as $$
  update public.duration_timers
     set state = 'stopped',
         stopped_at = now(),
         total_paused_seconds = total_paused_seconds
           + case when state = 'paused'
                  then greatest(0, extract(epoch from (now() - coalesce(paused_at, now())))::int)
                  else 0 end,
         paused_at = null
   where subject_kind = _kind and subject_id = _subject and state <> 'stopped';
$$;

create or replace function private.timer_set_due(_kind text, _subject uuid, _due timestamptz)
returns void language sql security definer set search_path = public as $$
  update public.duration_timers set due_at = _due
   where subject_kind = _kind and subject_id = _subject and state <> 'stopped';
$$;

-- 3) Subject triggers --------------------------------------------------
create or replace function public.sync_request_timer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  select entity_id into v_entity from public.projects where id = new.project_id;

  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    perform private.timer_start('request', new.id, new.project_id, v_entity, new.contract_id, now(), new.due_at);
  elsif new.status = 'info_needed' and old.status is distinct from 'info_needed' then
    perform private.timer_pause('request', new.id);
  elsif new.status = 'in_review' and old.status is distinct from 'in_review' then
    perform private.timer_resume('request', new.id);
  elsif new.status in ('approved','rejected','cancelled','closed') then
    perform private.timer_stop('request', new.id);
  end if;

  if tg_op = 'UPDATE' and new.due_at is distinct from old.due_at then
    perform private.timer_set_due('request', new.id, new.due_at);
  end if;
  return null;
end; $$;

create trigger sync_request_timer_trg after insert or update on public.requests
  for each row execute function public.sync_request_timer();

create or replace function public.sync_stage_timer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entity uuid; v_due timestamptz;
begin
  select entity_id into v_entity from public.projects where id = new.project_id;
  v_due := case when new.planned_end is not null then new.planned_end::timestamptz + interval '1 day' - interval '1 second' end;

  if new.status = 'in_progress' and (tg_op = 'INSERT' or old.status is distinct from 'in_progress') then
    if exists (select 1 from public.duration_timers where subject_kind='stage' and subject_id=new.id and state='paused') then
      perform private.timer_resume('stage', new.id);
    else
      perform private.timer_start('stage', new.id, new.project_id, v_entity, null,
                                  coalesce(new.actual_start::timestamptz, now()), v_due);
    end if;
  elsif new.status = 'submitted' and old.status is distinct from 'submitted' then
    perform private.timer_pause('stage', new.id);
  elsif new.status = 'rework' and old.status is distinct from 'rework' then
    perform private.timer_resume('stage', new.id);
  elsif new.status in ('approved','done','skipped') then
    perform private.timer_stop('stage', new.id);
  end if;

  if tg_op = 'UPDATE' and new.planned_end is distinct from old.planned_end then
    perform private.timer_set_due('stage', new.id, v_due);
  end if;
  return null;
end; $$;

create trigger sync_stage_timer_trg after insert or update on public.project_stages
  for each row execute function public.sync_stage_timer();

create or replace function public.sync_milestone_timer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  select entity_id into v_entity from public.projects where id = new.project_id;
  if new.status in ('settled','cancelled') then
    perform private.timer_stop('milestone', new.id);
  elsif new.due_date is not null then
    perform private.timer_start('milestone', new.id, new.project_id, v_entity, new.contract_id, now(),
                                new.due_date::timestamptz + interval '1 day' - interval '1 second');
  end if;
  return null;
end; $$;

create trigger sync_milestone_timer_trg after insert or update on public.payment_milestones
  for each row execute function public.sync_milestone_timer();

create or replace function public.sync_retention_timer()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  select entity_id into v_entity from public.projects where id = new.project_id;
  if new.status in ('active','partially_released') and new.expected_release_date is not null then
    perform private.timer_start('retention', new.id, new.project_id, v_entity, new.contract_id, now(),
                                new.expected_release_date::timestamptz + interval '1 day' - interval '1 second');
  else
    perform private.timer_stop('retention', new.id);
  end if;
  return null;
end; $$;

create trigger sync_retention_timer_trg after insert or update on public.retention_holds
  for each row execute function public.sync_retention_timer();

-- contract suspension pauses every timer of its project
create or replace function public.sync_contract_suspension_timers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'suspended' and old.status is distinct from 'suspended' then
    update public.duration_timers set state='paused', paused_at=now()
     where project_id = new.project_id and state='running';
  elsif old.status = 'suspended' and new.status is distinct from 'suspended' then
    update public.duration_timers
       set state='running',
           total_paused_seconds = total_paused_seconds
             + greatest(0, extract(epoch from (now() - coalesce(paused_at, now())))::int),
           paused_at = null
     where project_id = new.project_id and state='paused';
  end if;
  return null;
end; $$;

create trigger sync_contract_suspension_timers_trg after update on public.contracts
  for each row execute function public.sync_contract_suspension_timers();

-- 4) Escalation --------------------------------------------------------
create table public.escalation_policies (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete set null,
  subject_kind text not null,
  name_ar text not null,
  name_en text not null,
  trigger_after_hours integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint escalation_policies_kind_ck check (subject_kind in ('request','stage','milestone','retention')),
  constraint escalation_policies_hours_ck check (trigger_after_hours >= 0)
);
create index escalation_policies_match_idx on public.escalation_policies(subject_kind, project_id, entity_id) where is_active;

create table public.escalation_steps (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.escalation_policies(id) on delete cascade,
  step_no integer not null,
  delay_hours integer not null default 0,
  target_kind text not null,
  target_role text,
  target_user_id uuid,
  created_at timestamptz not null default now(),
  constraint escalation_steps_uk unique (policy_id, step_no),
  constraint escalation_steps_target_ck check (target_kind in ('stage_role','project_party_role','user')),
  constraint escalation_steps_shape_ck check (
    (target_kind = 'user' and target_user_id is not null)
    or (target_kind <> 'user' and target_role is not null)
  ),
  constraint escalation_steps_delay_ck check (delay_hours >= 0)
);

create table public.escalation_events (
  id uuid primary key default gen_random_uuid(),
  timer_id uuid not null references public.duration_timers(id) on delete cascade,
  policy_id uuid not null references public.escalation_policies(id) on delete cascade,
  step_no integer not null,
  project_id uuid,
  resolved_recipient_user_id uuid,
  notification_id uuid references public.notifications(id) on delete set null,
  reason text,
  raised_at timestamptz not null default now(),
  constraint escalation_events_uk unique (timer_id, policy_id, step_no)
);
create index escalation_events_project_idx on public.escalation_events(project_id);

grant select on public.escalation_policies to authenticated;
grant select on public.escalation_steps to authenticated;
grant select on public.escalation_events to authenticated;
grant all on public.escalation_policies to service_role;
grant all on public.escalation_steps to service_role;
grant all on public.escalation_events to service_role;

alter table public.escalation_policies enable row level security;
alter table public.escalation_steps enable row level security;
alter table public.escalation_events enable row level security;

create policy "policies readable by project members"
  on public.escalation_policies for select to authenticated
  using (
    (project_id is not null and private.can_access_project(auth.uid(), project_id))
    or private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, entity_id, null)
  );

create policy "steps readable with their policy"
  on public.escalation_steps for select to authenticated
  using (exists (
    select 1 from public.escalation_policies p
    where p.id = policy_id
      and ((p.project_id is not null and private.can_access_project(auth.uid(), p.project_id))
           or private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, p.entity_id, null))
  ));

create policy "events readable by recipient or project members"
  on public.escalation_events for select to authenticated
  using (
    resolved_recipient_user_id = auth.uid()
    or (project_id is not null and private.can_access_project(auth.uid(), project_id))
  );

create trigger escalation_events_immutable before update or delete on public.escalation_events
  for each row execute function public.prevent_row_mutation();

create trigger escalation_policies_updated_at before update on public.escalation_policies
  for each row execute function public.set_updated_at();

-- managed writes: policies are created only through a checked definer function
create or replace function public.upsert_escalation_policy(
  _entity_id uuid, _project_id uuid, _subject_kind text,
  _name_ar text, _name_en text, _trigger_after_hours integer,
  _steps jsonb, _contract_id uuid default null, _policy_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; s jsonb; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='28000'; end if;
  if not (private.can(v_uid, 'members'::app_module, 'manage_members'::app_action, _entity_id, _project_id)
          or (_project_id is not null and private.can(v_uid, 'projects'::app_module, 'update'::app_action, _entity_id, _project_id))) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;

  if _policy_id is null then
    insert into public.escalation_policies(entity_id, project_id, contract_id, subject_kind, name_ar, name_en, trigger_after_hours, created_by)
    values (_entity_id, _project_id, _contract_id, _subject_kind, _name_ar, _name_en, coalesce(_trigger_after_hours,0), v_uid)
    returning id into v_id;
  else
    update public.escalation_policies
       set name_ar=_name_ar, name_en=_name_en, trigger_after_hours=coalesce(_trigger_after_hours,0),
           subject_kind=_subject_kind, project_id=_project_id, contract_id=_contract_id
     where id=_policy_id and entity_id=_entity_id
     returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND' using errcode='42704'; end if;
    delete from public.escalation_steps where policy_id = v_id;
  end if;

  for s in select * from jsonb_array_elements(coalesce(_steps,'[]'::jsonb)) loop
    insert into public.escalation_steps(policy_id, step_no, delay_hours, target_kind, target_role, target_user_id)
    values (v_id,
            (s->>'step_no')::int,
            coalesce((s->>'delay_hours')::int, 0),
            s->>'target_kind',
            nullif(s->>'target_role',''),
            nullif(s->>'target_user_id','')::uuid);
  end loop;

  return v_id;
end; $$;

revoke execute on function public.upsert_escalation_policy(uuid,uuid,text,text,text,integer,jsonb,uuid,uuid) from public, anon;
grant execute on function public.upsert_escalation_policy(uuid,uuid,text,text,text,integer,jsonb,uuid,uuid) to authenticated;

-- 5) Notification types for this batch --------------------------------
insert into public.notification_types(code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind)
values
  ('duration.pre_due','reminder','in_app',false,false,'notif.duration.pre_due.subject','notif.duration.pre_due.body','request'),
  ('duration.overdue','overdue','in_app',true,false,'notif.duration.overdue.subject','notif.duration.overdue.body','request'),
  ('duration.completion_requested','action_required','in_app',true,false,'notif.duration.completion_requested.subject','notif.duration.completion_requested.body','request'),
  ('escalation.raised','escalation','in_app',true,false,'notif.escalation.raised.subject','notif.escalation.raised.body','request')
on conflict (code) do nothing;

-- 6) Digest ------------------------------------------------------------
create table public.notification_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  digest_mode text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  item_count integer not null default 0,
  built_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_digests_mode_ck check (digest_mode in ('daily','weekly')),
  constraint notification_digests_uk unique (user_id, digest_mode, period_start)
);

create table public.notification_digest_items (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references public.notification_digests(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint notification_digest_items_uk unique (digest_id, notification_id)
);

grant select on public.notification_digests to authenticated;
grant select on public.notification_digest_items to authenticated;
grant all on public.notification_digests to service_role;
grant all on public.notification_digest_items to service_role;

alter table public.notification_digests enable row level security;
alter table public.notification_digest_items enable row level security;

create policy "own digests" on public.notification_digests for select to authenticated
  using (user_id = auth.uid());
create policy "own digest items" on public.notification_digest_items for select to authenticated
  using (exists (select 1 from public.notification_digests d where d.id = digest_id and d.user_id = auth.uid()));

-- emit_notification: optional types with a batched digest mode are deferred,
-- mandatory/security types always send immediately regardless of preference.
create or replace function private.emit_notification(
  _recipient uuid, _type_code text, _project_id uuid, _entity_id uuid,
  _target_kind text, _target_id uuid, _payload jsonb, _discriminator text,
  _severity text default 'info')
returns uuid language plpgsql security definer set search_path = public as $$
declare t record; pref record; v_id uuid; v_key text; v_suspended boolean;
        v_always boolean; v_defer boolean := false;
begin
  if _recipient is null then return null; end if;
  select * into t from public.notification_types where code = _type_code;
  if t is null then return null; end if;

  v_always := (t.is_mandatory or t.is_security);

  select * into pref from public.notification_preferences p
   where p.user_id = _recipient and p.type_code = _type_code;

  if pref is not null and not v_always then
    if pref.in_app = false or pref.digest_mode = 'off' then
      return null;
    end if;
    if pref.digest_mode in ('daily','weekly') then
      v_defer := true;
    end if;
  end if;

  v_key := _type_code || ':' || coalesce(_target_id::text,'-') || ':' || coalesce(_discriminator,'-') || ':' || _recipient::text;

  insert into public.notifications(
    recipient_user_id, type_code, project_id, entity_id, target_kind, target_id, payload, severity, dedupe_key)
  values (_recipient, _type_code, _project_id, _entity_id, _target_kind, _target_id,
          coalesce(_payload,'{}'::jsonb), _severity, v_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then return null; end if;

  v_suspended := private.user_is_suspended(_recipient);

  insert into public.notification_deliveries(notification_id, channel, status, deferred_reason, sent_at)
  values (v_id, 'in_app',
          case when v_suspended then 'deferred'
               when v_defer then 'deferred'
               else 'sent' end,
          case when v_suspended then 'user_suspended'
               when v_defer then 'digest_batched'
               else null end,
          case when v_suspended or v_defer then null else now() end);

  return v_id;
end; $$;

-- access re-check at digest build time
create or replace function private.can_see_notification_now(_user uuid, _n public.notifications)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if _n.recipient_user_id <> _user then return false; end if;
  if _n.project_id is null then return true; end if;
  return private.can_access_project(_user, _n.project_id);
end; $$;

create or replace function public.build_notification_digest(_mode text default 'daily')
returns table(digest_id uuid, item_count integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_start timestamptz; v_end timestamptz;
        v_digest uuid; v_count integer := 0; r record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='28000'; end if;
  if _mode not in ('daily','weekly') then raise exception 'INVALID_MODE' using errcode='22023'; end if;

  select b.day_start, b.day_end into v_start, v_end from private.riyadh_day_bounds(now()) b;
  if _mode = 'weekly' then v_start := v_end - interval '7 days'; end if;

  insert into public.notification_digests(user_id, digest_mode, period_start, period_end)
  values (v_uid, _mode, v_start, v_end)
  on conflict (user_id, digest_mode, period_start) do update set built_at = now()
  returning id into v_digest;

  for r in
    select n.*, d.id as delivery_id
      from public.notifications n
      join public.notification_deliveries d on d.notification_id = n.id
      join public.notification_types t on t.code = n.type_code
     where n.recipient_user_id = v_uid
       and d.status = 'deferred'
       and d.deferred_reason = 'digest_batched'
       and not (t.is_mandatory or t.is_security)   -- security exception enforced here too
       and n.created_at >= v_start and n.created_at < v_end
  loop
    if private.can_see_notification_now(v_uid, r::public.notifications) then
      insert into public.notification_digest_items(digest_id, notification_id)
      values (v_digest, r.id) on conflict do nothing;
      update public.notification_deliveries
         set status = 'sent', sent_at = now(), deferred_reason = null
       where id = r.delivery_id;
      v_count := v_count + 1;
    end if;
  end loop;

  update public.notification_digests
     set item_count = v_count, sent_at = now()
   where id = v_digest;

  return query select v_digest, v_count;
end; $$;

revoke execute on function public.build_notification_digest(text) from public, anon;
grant execute on function public.build_notification_digest(text) to authenticated;

-- 7) Recipients + duration scan ---------------------------------------
create or replace function private.timer_recipients(_t public.duration_timers)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if _t.subject_kind = 'request' then
    return query select r.assigned_user_id from public.requests r
      where r.id = _t.subject_id and r.assigned_user_id is not null;
  elsif _t.subject_kind = 'stage' then
    return query select distinct sr.user_id from public.stage_roles sr
      where sr.stage_id = _t.subject_id and sr.status = 'active' and sr.user_id is not null
        and sr.role in ('responsible','executor','approver');
  else
    return query select p.owner_id from public.projects p where p.id = _t.project_id;
  end if;
end; $$;

create or replace function private.resolve_escalation_recipient(_t public.duration_timers, _s public.escalation_steps)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_user uuid;
begin
  if _s.target_kind = 'user' then
    return _s.target_user_id;
  elsif _s.target_kind = 'stage_role' and _t.subject_kind = 'stage' then
    select sr.user_id into v_user from public.stage_roles sr
     where sr.stage_id = _t.subject_id and sr.status='active'
       and sr.role::text = _s.target_role and sr.user_id is not null
     order by sr.created_at limit 1;
    return v_user;
  elsif _s.target_kind = 'project_party_role' then
    select em.user_id into v_user
      from public.project_parties pp
      join public.entity_memberships em on em.entity_id = pp.party_entity_id and em.status='active'
     where pp.project_id = _t.project_id and pp.status = 'active'
       and pp.party_role::text = _s.target_role
     order by em.created_at limit 1;
    return v_user;
  end if;
  return null;
end; $$;

create or replace function public.run_duration_scan()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; eff timestamptz; bucket text; overdue_hours numeric;
        rcpt uuid; pol record; stp record; nid uuid;
        v_pre int := 0; v_over int := 0; v_esc int := 0; v_skipped int := 0;
begin
  for t in select * from public.duration_timers where state = 'running' and due_at is not null loop
    eff := private.timer_effective_now(t);

    -- pre-due reminders
    if eff < t.due_at then
      bucket := case
        when eff >= t.due_at - interval '1 day' then 'due-1d'
        when eff >= t.due_at - interval '3 days' then 'due-3d'
        else null end;
      if bucket is not null and coalesce(t.last_pre_due_bucket,'') is distinct from bucket then
        for rcpt in select * from private.timer_recipients(t) loop
          if private.emit_notification(rcpt, 'duration.pre_due', t.project_id, t.entity_id,
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
          if private.emit_notification(rcpt, 'duration.overdue', t.project_id, t.entity_id,
               t.subject_kind, t.subject_id,
               jsonb_build_object('subject_kind', t.subject_kind, 'bucket', bucket),
               bucket, 'critical') is not null then
            v_over := v_over + 1;
          end if;
        end loop;
        update public.duration_timers set last_overdue_bucket = bucket where id = t.id;
      end if;

      -- escalation: ONLY when an explicit active policy matches. No default target ever.
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

revoke execute on function public.run_duration_scan() from public, anon, authenticated;
grant execute on function public.run_duration_scan() to service_role;

-- completion request: an explicit human ask, not a timer product
create or replace function public.request_completion(_subject_kind text, _subject_id uuid, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t record; rcpt uuid; nid uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='28000'; end if;
  select * into t from public.duration_timers where subject_kind=_subject_kind and subject_id=_subject_id;
  if t is null then raise exception 'NOT_FOUND' using errcode='42704'; end if;
  if not private.can_access_project(v_uid, t.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  for rcpt in select * from private.timer_recipients(t) loop
    nid := private.emit_notification(rcpt, 'duration.completion_requested', t.project_id, t.entity_id,
             t.subject_kind, t.subject_id,
             jsonb_build_object('subject_kind', t.subject_kind, 'requested_by', v_uid),
             'req:' || v_uid::text || ':' || to_char(now(),'YYYYMMDDHH24MI'), 'warning');
  end loop;
  return nid;
end; $$;

revoke execute on function public.request_completion(text,uuid,text) from public, anon;
grant execute on function public.request_completion(text,uuid,text) to authenticated;

-- 8) Grant hardening (no client writes on any of these tables)
revoke insert, update, delete, truncate on public.duration_timers from anon, authenticated;
revoke insert, update, delete, truncate on public.escalation_policies from anon, authenticated;
revoke insert, update, delete, truncate on public.escalation_steps from anon, authenticated;
revoke insert, update, delete, truncate on public.escalation_events from anon, authenticated;
revoke insert, update, delete, truncate on public.notification_digests from anon, authenticated;
revoke insert, update, delete, truncate on public.notification_digest_items from anon, authenticated;
revoke select on public.duration_timers from anon;
revoke select on public.escalation_policies from anon;
revoke select on public.escalation_steps from anon;
revoke select on public.escalation_events from anon;
revoke select on public.notification_digests from anon;
revoke select on public.notification_digest_items from anon;