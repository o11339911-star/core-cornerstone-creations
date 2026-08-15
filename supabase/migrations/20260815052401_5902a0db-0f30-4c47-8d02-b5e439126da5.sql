
-- ============ 1) توسيع سجل التدقيق ============
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array[
    'membership','grant','project_party',
    'contracts','contract_versions','contract_version_amounts','contract_parties',
    'contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits',
    'stage_observations','observation_actions','observation_reinspections','stage_attachments',
    'stage_completion_criteria','stage_criteria_results'
  ]));
alter table public.permission_audit_log drop constraint permission_audit_action_ck;
alter table public.permission_audit_log add constraint permission_audit_action_ck
  check (action = any (array['insert','update','revoke','delete','status_change']));

-- ============ 2) توسيع project_stages ============
alter table public.project_stages
  add column parent_stage_id uuid references public.project_stages(id) on delete set null,
  add column actual_start date,
  add column actual_end date,
  add column completion_note text,
  add column submitted_by uuid references auth.users(id),
  add column submitted_at timestamptz,
  add column approved_by uuid references auth.users(id),
  add column approved_at timestamptz;

alter table public.project_stages drop constraint project_stages_status_check;
alter table public.project_stages add constraint project_stages_status_check
  check (status = any (array['pending','in_progress','submitted','approved','rework','skipped','done']));

create index if not exists idx_project_stages_parent on public.project_stages(parent_stage_id);

create or replace function public.enforce_stage_hierarchy()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_parent public.project_stages%rowtype;
begin
  if new.parent_stage_id is null then return new; end if;
  if new.parent_stage_id = new.id then
    raise exception 'A stage cannot be its own parent' using errcode = '22023';
  end if;
  select * into v_parent from public.project_stages where id = new.parent_stage_id;
  if v_parent.id is null or v_parent.project_id <> new.project_id then
    raise exception 'Parent stage must belong to the same project' using errcode = '22023';
  end if;
  if v_parent.parent_stage_id is not null then
    raise exception 'Only two levels of stages are allowed' using errcode = '22023';
  end if;
  if exists (select 1 from public.project_stages c where c.parent_stage_id = new.id) then
    raise exception 'A stage with sub-stages cannot become a sub-stage' using errcode = '22023';
  end if;
  return new;
end; $$;

create trigger project_stages_hierarchy
  before insert or update of parent_stage_id on public.project_stages
  for each row execute function public.enforce_stage_hierarchy();

create or replace function public.enforce_stage_status_flow()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ok boolean;
begin
  if new.status = old.status then return new; end if;
  ok := case old.status
    when 'pending'     then new.status in ('in_progress','skipped')
    when 'in_progress' then new.status in ('submitted','pending')
    when 'submitted'   then new.status in ('approved','rework')
    when 'rework'      then new.status in ('in_progress','submitted')
    when 'approved'    then false
    when 'skipped'     then new.status in ('pending')
    when 'done'        then new.status in ('in_progress')
    else false end;
  if not ok then
    raise exception 'Illegal stage status transition % -> %', old.status, new.status using errcode = '22023';
  end if;
  if new.status = 'approved' and new.approved_by is null then
    raise exception 'A stage can only be approved through approve_stage()' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger project_stages_status_flow
  before update of status on public.project_stages
  for each row execute function public.enforce_stage_status_flow();

-- ============ 3) تدقيق عام لتغيّر الحالة ============
create or replace function public.audit_stage_object_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_action text;
  v_project uuid;
begin
  if tg_op = 'INSERT' then v_action := 'insert';
  elsif tg_op = 'DELETE' then v_action := 'delete';
  elsif (v_old ? 'status') and (v_old ->> 'status') is distinct from (v_new ->> 'status') then v_action := 'status_change';
  else v_action := 'update';
  end if;

  v_project := nullif(coalesce(v_new, v_old) ->> 'project_id', '')::uuid;
  if v_project is null then
    v_project := (
      select s.project_id from public.project_stages s
      where s.id = nullif(coalesce(v_new, v_old) ->> 'stage_id', '')::uuid
    );
  end if;

  insert into public.permission_audit_log(
    actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (
    auth.uid(), v_project, tg_table_name,
    nullif(coalesce(v_new, v_old) ->> 'id', '')::uuid,
    v_action, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

create trigger project_stages_audit after insert or update or delete on public.project_stages
  for each row execute function public.audit_stage_object_change();

-- ============ 4) أدوار المرحلة ============
create table public.stage_roles (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete cascade,
  role text not null check (role in ('responsible','executor','reviewer','approver')),
  assigned_by uuid not null references auth.users(id),
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((user_id is not null)::int + (entity_id is not null)::int = 1)
);
create index idx_stage_roles_stage on public.stage_roles(stage_id);
create unique index uq_stage_roles_user on public.stage_roles(stage_id, user_id, role) where user_id is not null;
grant select, insert, update, delete on public.stage_roles to authenticated;
grant all on public.stage_roles to service_role;
alter table public.stage_roles enable row level security;
create trigger stage_roles_updated before update on public.stage_roles
  for each row execute function public.set_updated_at();
create trigger stage_roles_audit after insert or update or delete on public.stage_roles
  for each row execute function public.audit_stage_object_change();

-- ============ 5) معايير الإكمال ============
create table public.stage_completion_criteria (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  code text not null,
  label_ar text not null,
  label_en text not null,
  is_required boolean not null default true,
  evidence_type text not null default 'checklist' check (evidence_type in ('file','visit','checklist','text')),
  weight integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stage_id, code)
);
grant select, insert, update, delete on public.stage_completion_criteria to authenticated;
grant all on public.stage_completion_criteria to service_role;
alter table public.stage_completion_criteria enable row level security;
create trigger stage_criteria_updated before update on public.stage_completion_criteria
  for each row execute function public.set_updated_at();

create table public.stage_criteria_results (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.stage_completion_criteria(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  satisfied boolean not null default false,
  evidence_attachment_id uuid,
  evidence_visit_id uuid,
  note text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (criterion_id)
);
grant select, insert, update, delete on public.stage_criteria_results to authenticated;
grant all on public.stage_criteria_results to service_role;
alter table public.stage_criteria_results enable row level security;
create trigger stage_criteria_results_updated before update on public.stage_criteria_results
  for each row execute function public.set_updated_at();

-- ============ 6) التقدّم (append-only) ============
create table public.stage_progress (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  percent numeric not null check (percent >= 0 and percent <= 100),
  note text,
  reported_by uuid not null references auth.users(id),
  reported_at timestamptz not null default now()
);
create index idx_stage_progress_stage on public.stage_progress(stage_id);
grant select, insert on public.stage_progress to authenticated;
grant all on public.stage_progress to service_role;
alter table public.stage_progress enable row level security;
create trigger stage_progress_append_only before update or delete on public.stage_progress
  for each row execute function public.prevent_row_mutation();

-- ============ 7) الزيارات الميدانية ============
create table public.site_visits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  visited_by uuid not null references auth.users(id),
  visit_start timestamptz not null default now(),
  visit_end timestamptz,
  summary text,
  weather_note text,
  location_consent boolean not null default false,
  location_reason text check (location_reason in ('inspection','handover','incident','other')),
  status text not null default 'draft' check (status in ('draft','submitted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_site_visits_project on public.site_visits(project_id);
grant select, insert, update on public.site_visits to authenticated;
grant all on public.site_visits to service_role;
alter table public.site_visits enable row level security;
create trigger site_visits_updated before update on public.site_visits
  for each row execute function public.set_updated_at();
create trigger site_visits_audit after insert or update on public.site_visits
  for each row execute function public.audit_stage_object_change();

create table public.site_visit_locations (
  visit_id uuid primary key references public.site_visits(id) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  accuracy_m numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.site_visit_locations to authenticated;
grant all on public.site_visit_locations to service_role;
alter table public.site_visit_locations enable row level security;
create trigger site_visit_locations_updated before update on public.site_visit_locations
  for each row execute function public.set_updated_at();

create or replace function public.enforce_visit_location_consent()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v public.site_visits%rowtype;
begin
  select * into v from public.site_visits where id = new.visit_id;
  if v.id is null then
    raise exception 'Visit not found' using errcode = '22023';
  end if;
  if not v.location_consent or v.location_reason is null then
    raise exception 'Exact location requires explicit consent and a stated reason'
      using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger site_visit_locations_consent
  before insert or update on public.site_visit_locations
  for each row execute function public.enforce_visit_location_consent();

-- ============ 8) الملاحظات والإجراءات وإعادة الفحص ============
create table public.stage_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null references public.project_stages(id) on delete cascade,
  visit_id uuid references public.site_visits(id) on delete set null,
  kind text not null check (kind in ('note','nonconformity')),
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  title text not null,
  body text,
  status text not null default 'open'
    check (status in ('open','action_assigned','action_done','reinspection','closed')),
  raised_by uuid not null references auth.users(id),
  due_on date,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_stage_observations_stage on public.stage_observations(stage_id);
grant select, insert, update on public.stage_observations to authenticated;
grant all on public.stage_observations to service_role;
alter table public.stage_observations enable row level security;
create trigger stage_observations_updated before update on public.stage_observations
  for each row execute function public.set_updated_at();
create trigger stage_observations_audit after insert or update on public.stage_observations
  for each row execute function public.audit_stage_object_change();

create table public.observation_actions (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.stage_observations(id) on delete cascade,
  action_text text not null,
  assigned_to uuid references auth.users(id),
  due_on date,
  status text not null default 'assigned'
    check (status in ('assigned','in_progress','done','verified','rejected')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_observation_actions_obs on public.observation_actions(observation_id);
grant select, insert, update on public.observation_actions to authenticated;
grant all on public.observation_actions to service_role;
alter table public.observation_actions enable row level security;
create trigger observation_actions_updated before update on public.observation_actions
  for each row execute function public.set_updated_at();
create trigger observation_actions_audit after insert or update on public.observation_actions
  for each row execute function public.audit_stage_object_change();

create table public.observation_reinspections (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.stage_observations(id) on delete cascade,
  action_id uuid references public.observation_actions(id) on delete set null,
  visit_id uuid references public.site_visits(id) on delete set null,
  inspected_by uuid not null references auth.users(id),
  result text not null check (result in ('passed','failed')),
  note text,
  created_at timestamptz not null default now()
);
create index idx_reinspections_obs on public.observation_reinspections(observation_id);
grant select, insert on public.observation_reinspections to authenticated;
grant all on public.observation_reinspections to service_role;
alter table public.observation_reinspections enable row level security;
create trigger observation_reinspections_append_only before update or delete on public.observation_reinspections
  for each row execute function public.prevent_row_mutation();

-- ============ 9) المرفقات ============
create table public.stage_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete cascade,
  visit_id uuid references public.site_visits(id) on delete set null,
  observation_id uuid references public.stage_observations(id) on delete set null,
  file_path text not null,
  file_hash text,
  mime_type text,
  kind text not null default 'document' check (kind in ('photo','document','report')),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_stage_attachments_stage on public.stage_attachments(stage_id);
grant select, insert, delete on public.stage_attachments to authenticated;
grant all on public.stage_attachments to service_role;
alter table public.stage_attachments enable row level security;

-- ============ 10) دوال الوصول ============
create or replace function private.can_access_stage(_user_id uuid, _stage_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _user_id is not null
    and private.can(_user_id, 'stages'::public.app_module, 'view'::public.app_action, null, _project_id)
    and private.can_access_project(_user_id, _project_id)
    and private.stage_in_scope(_user_id, _stage_id, _project_id);
$$;

create or replace function private.can_manage_stage(_user_id uuid, _stage_id uuid, _project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _user_id is not null
    and private.can(_user_id, 'stages'::public.app_module, 'update'::public.app_action, null, _project_id)
    and private.stage_in_scope(_user_id, _stage_id, _project_id);
$$;

create or replace function private.stage_project(_stage_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select project_id from public.project_stages where id = _stage_id;
$$;

create or replace function private.visit_project(_visit_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select project_id from public.site_visits where id = _visit_id;
$$;

create or replace function private.observation_stage(_observation_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select stage_id from public.stage_observations where id = _observation_id;
$$;

create or replace function private.has_stage_role(_user_id uuid, _stage_id uuid, _role text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.stage_roles r
    where r.stage_id = _stage_id and r.role = _role and r.status = 'active'
      and (r.user_id = _user_id
           or (r.entity_id is not null and private.is_entity_member(_user_id, r.entity_id)))
  );
$$;

revoke all on function private.can_access_stage(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_manage_stage(uuid, uuid, uuid) from public, anon;
revoke all on function private.stage_project(uuid) from public, anon;
revoke all on function private.visit_project(uuid) from public, anon;
revoke all on function private.observation_stage(uuid) from public, anon;
revoke all on function private.has_stage_role(uuid, uuid, text) from public, anon;
grant execute on function private.can_access_stage(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_manage_stage(uuid, uuid, uuid) to authenticated;
grant execute on function private.stage_project(uuid) to authenticated;
grant execute on function private.visit_project(uuid) to authenticated;
grant execute on function private.observation_stage(uuid) to authenticated;
grant execute on function private.has_stage_role(uuid, uuid, text) to authenticated;

-- ============ 11) سياسات RLS ============
create policy stage_roles_select on public.stage_roles for select to authenticated
  using (private.can_access_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_roles_write on public.stage_roles for insert to authenticated
  with check (assigned_by = auth.uid()
    and private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_roles_update on public.stage_roles for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_roles_delete on public.stage_roles for delete to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

create policy stage_criteria_select on public.stage_completion_criteria for select to authenticated
  using (private.can_access_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_criteria_write on public.stage_completion_criteria for insert to authenticated
  with check (created_by = auth.uid()
    and private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_criteria_update on public.stage_completion_criteria for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_criteria_delete on public.stage_completion_criteria for delete to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

create policy stage_criteria_results_select on public.stage_criteria_results for select to authenticated
  using (private.can_access_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_criteria_results_write on public.stage_criteria_results for insert to authenticated
  with check (recorded_by = auth.uid()
    and private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_criteria_results_update on public.stage_criteria_results for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_criteria_results_delete on public.stage_criteria_results for delete to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

create policy stage_progress_select on public.stage_progress for select to authenticated
  using (private.can_access_stage(auth.uid(), stage_id, private.stage_project(stage_id)));
create policy stage_progress_insert on public.stage_progress for insert to authenticated
  with check (reported_by = auth.uid()
    and private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

create policy site_visits_select on public.site_visits for select to authenticated
  using (
    private.can(auth.uid(), 'stages'::public.app_module, 'view'::public.app_action, null, project_id)
    and private.can_access_project(auth.uid(), project_id)
    and (stage_id is null or private.stage_in_scope(auth.uid(), stage_id, project_id))
  );
create policy site_visits_insert on public.site_visits for insert to authenticated
  with check (visited_by = auth.uid()
    and private.can(auth.uid(), 'stages'::public.app_module, 'create'::public.app_action, null, project_id)
    and private.can_access_project(auth.uid(), project_id)
    and (stage_id is null or private.stage_in_scope(auth.uid(), stage_id, project_id)));
create policy site_visits_update on public.site_visits for update to authenticated
  using (visited_by = auth.uid() or private.is_project_insider(auth.uid(), project_id));

create policy visit_locations_select on public.site_visit_locations for select to authenticated
  using (
    exists (
      select 1 from public.site_visits v
      where v.id = visit_id
        and (
          v.visited_by = auth.uid()
          or private.can(auth.uid(), 'stages'::public.app_module, 'view_exact'::public.app_action, null, v.project_id)
        )
    )
  );
create policy visit_locations_write on public.site_visit_locations for insert to authenticated
  with check (exists (select 1 from public.site_visits v where v.id = visit_id and v.visited_by = auth.uid()));
create policy visit_locations_update on public.site_visit_locations for update to authenticated
  using (exists (select 1 from public.site_visits v where v.id = visit_id and v.visited_by = auth.uid()));

create policy observations_select on public.stage_observations for select to authenticated
  using (private.can_access_stage(auth.uid(), stage_id, project_id));
create policy observations_insert on public.stage_observations for insert to authenticated
  with check (raised_by = auth.uid()
    and private.can(auth.uid(), 'stages'::public.app_module, 'create'::public.app_action, null, project_id)
    and private.can_access_stage(auth.uid(), stage_id, project_id));
create policy observations_update on public.stage_observations for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, project_id));

create policy actions_select on public.observation_actions for select to authenticated
  using (private.can_access_stage(auth.uid(),
    private.observation_stage(observation_id),
    private.stage_project(private.observation_stage(observation_id))));
create policy actions_insert on public.observation_actions for insert to authenticated
  with check (created_by = auth.uid()
    and private.can_manage_stage(auth.uid(),
      private.observation_stage(observation_id),
      private.stage_project(private.observation_stage(observation_id))));
create policy actions_update on public.observation_actions for update to authenticated
  using (assigned_to = auth.uid()
    or private.can_manage_stage(auth.uid(),
      private.observation_stage(observation_id),
      private.stage_project(private.observation_stage(observation_id))));

create policy reinspections_select on public.observation_reinspections for select to authenticated
  using (private.can_access_stage(auth.uid(),
    private.observation_stage(observation_id),
    private.stage_project(private.observation_stage(observation_id))));

create policy attachments_select on public.stage_attachments for select to authenticated
  using (
    private.can_access_project(auth.uid(), project_id)
    and (stage_id is null or private.can_access_stage(auth.uid(), stage_id, project_id))
  );
create policy attachments_insert on public.stage_attachments for insert to authenticated
  with check (uploaded_by = auth.uid()
    and private.can(auth.uid(), 'documents'::public.app_module, 'create'::public.app_action, null, project_id)
    and (stage_id is null or private.can_access_stage(auth.uid(), stage_id, project_id)));
create policy attachments_delete on public.stage_attachments for delete to authenticated
  using (uploaded_by = auth.uid() and private.is_project_insider(auth.uid(), project_id));

-- ============ 12) دوال الأعمال ============
create or replace function public.submit_stage(_stage_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_stage public.project_stages%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_stage from public.project_stages where id = _stage_id and deleted_at is null for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = '22023';
  end if;
  if not private.can_manage_stage(v_actor, _stage_id, v_stage.project_id) then
    raise exception 'Not allowed to submit this stage' using errcode = '42501';
  end if;
  if v_stage.status not in ('in_progress','rework') then
    raise exception 'Only a stage in progress or in rework can be submitted (current: %)', v_stage.status
      using errcode = '22023';
  end if;

  update public.project_stages
    set status = 'submitted', submitted_by = v_actor, submitted_at = now(),
        completion_note = coalesce(_note, completion_note),
        actual_end = coalesce(actual_end, current_date)
    where id = _stage_id;

  return now();
end; $$;

create or replace function public.approve_stage(_stage_id uuid, _note text default null)
returns timestamptz language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_stage public.project_stages%rowtype;
  v_missing int;
  v_open int;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_stage from public.project_stages where id = _stage_id and deleted_at is null for update;
  if v_stage.id is null then
    raise exception 'Stage not found' using errcode = '22023';
  end if;
  if not private.can(v_actor, 'stages'::public.app_module, 'approve'::public.app_action, null, v_stage.project_id)
     or not private.stage_in_scope(v_actor, _stage_id, v_stage.project_id) then
    raise exception 'Not allowed to approve this stage' using errcode = '42501';
  end if;
  if v_stage.status <> 'submitted' then
    raise exception 'Only a submitted stage can be approved (current: %)', v_stage.status using errcode = '22023';
  end if;

  -- فصل المهام: المنفّذ / مقدّم المرحلة لا يعتمد عمله
  if v_stage.submitted_by = v_actor then
    raise exception 'The submitter cannot approve their own stage' using errcode = '42501';
  end if;
  if private.has_stage_role(v_actor, _stage_id, 'executor') then
    raise exception 'The executor cannot approve their own stage' using errcode = '42501';
  end if;

  select count(*) into v_missing
  from public.stage_completion_criteria c
  left join public.stage_criteria_results r on r.criterion_id = c.id
  where c.stage_id = _stage_id and c.is_required and coalesce(r.satisfied, false) = false;
  if v_missing > 0 then
    raise exception 'Stage has % unmet required completion criteria', v_missing using errcode = '22023';
  end if;

  select count(*) into v_open
  from public.stage_observations o
  where o.stage_id = _stage_id and o.kind = 'nonconformity'
    and o.severity in ('high','critical') and o.status <> 'closed';
  if v_open > 0 then
    raise exception 'Stage has % open high/critical nonconformities', v_open using errcode = '22023';
  end if;

  update public.project_stages
    set status = 'approved', approved_by = v_actor, approved_at = now(),
        completion_note = coalesce(_note, completion_note)
    where id = _stage_id;

  return now();
end; $$;

create or replace function public.record_reinspection(
  _observation_id uuid, _action_id uuid, _result text, _note text default null, _visit_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_obs public.stage_observations%rowtype;
  v_action public.observation_actions%rowtype;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _result not in ('passed','failed') then
    raise exception 'Invalid reinspection result' using errcode = '22023';
  end if;

  select * into v_obs from public.stage_observations where id = _observation_id for update;
  if v_obs.id is null then
    raise exception 'Observation not found' using errcode = '22023';
  end if;
  if not private.can_manage_stage(v_actor, v_obs.stage_id, v_obs.project_id) then
    raise exception 'Not allowed to re-inspect this observation' using errcode = '42501';
  end if;

  if _action_id is not null then
    select * into v_action from public.observation_actions where id = _action_id;
    if v_action.id is null or v_action.observation_id <> _observation_id then
      raise exception 'Action does not belong to this observation' using errcode = '22023';
    end if;
    if coalesce(v_action.completed_by, v_action.assigned_to) = v_actor then
      raise exception 'The person who performed the corrective action cannot re-inspect it'
        using errcode = '42501';
    end if;
  end if;

  insert into public.observation_reinspections(observation_id, action_id, visit_id, inspected_by, result, note)
  values (_observation_id, _action_id, _visit_id, v_actor, _result, _note)
  returning id into v_id;

  if _result = 'passed' then
    update public.stage_observations set status = 'closed', closed_at = now() where id = _observation_id;
    if _action_id is not null then
      update public.observation_actions set status = 'verified' where id = _action_id;
    end if;
  else
    update public.stage_observations set status = 'action_assigned' where id = _observation_id;
    if _action_id is not null then
      update public.observation_actions set status = 'rejected' where id = _action_id;
    end if;
  end if;

  return v_id;
end; $$;

revoke all on function public.submit_stage(uuid, text) from public, anon;
revoke all on function public.approve_stage(uuid, text) from public, anon;
revoke all on function public.record_reinspection(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.submit_stage(uuid, text) to authenticated;
grant execute on function public.approve_stage(uuid, text) to authenticated;
grant execute on function public.record_reinspection(uuid, uuid, text, text, uuid) to authenticated;

-- ============ 13) التخزين ============
create policy stage_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'stage-evidence'
    and private.can_access_project(auth.uid(), ((storage.foldername(name))[1])::uuid));
create policy stage_evidence_write on storage.objects for insert to authenticated
  with check (bucket_id = 'stage-evidence'
    and private.can(auth.uid(), 'documents'::public.app_module, 'create'::public.app_action, null,
                    ((storage.foldername(name))[1])::uuid));
create policy stage_evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'stage-evidence'
    and private.is_project_insider(auth.uid(), ((storage.foldername(name))[1])::uuid));
