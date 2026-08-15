
-- 1) reference tables ---------------------------------------------------
create table public.request_types (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  module public.app_module not null default 'correspondence',
  requires_stage boolean not null default false,
  requires_unit boolean not null default false,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.request_types to authenticated;
grant all on public.request_types to service_role;
alter table public.request_types enable row level security;
create policy request_types_select on public.request_types for select to authenticated using (true);

create table public.request_status_transitions (
  from_status text not null,
  to_status text not null,
  actor_scope text not null default 'either' check (actor_scope in ('requester','handler','either')),
  primary key (from_status, to_status)
);
grant select on public.request_status_transitions to authenticated;
grant all on public.request_status_transitions to service_role;
alter table public.request_status_transitions enable row level security;
create policy request_transitions_select on public.request_status_transitions for select to authenticated using (true);

create sequence public.request_no_seq;

-- 2) requests -----------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default ('REQ-' || lpad(nextval('public.request_no_seq')::text, 6, '0')),
  request_type_code text not null references public.request_types(code),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid references public.project_stages(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  property_unit_id uuid references public.property_units(id) on delete set null,
  requested_by uuid not null references auth.users(id),
  assigned_entity_id uuid references public.entities(id),
  assigned_user_id uuid references auth.users(id),
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','info_needed','approved','rejected','cancelled','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  subject text not null,
  due_at timestamptz,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  closed_at timestamptz,
  closure_reason text,
  thread_id uuid not null unique references public.correspondence_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_project_idx on public.requests(project_id, status);
grant select, insert on public.requests to authenticated;
grant all on public.requests to service_role;
alter table public.requests enable row level security;

-- 3) message extensions --------------------------------------------------
alter table public.correspondence_messages
  add column author_role_snapshot text,
  add column message_kind text not null default 'comment'
    check (message_kind in ('comment','reminder','info_request','decision','system'));

create table public.correspondence_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.correspondence_messages(id) on delete cascade,
  file_path text not null,
  file_name text,
  mime text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
grant select, insert on public.correspondence_message_attachments to authenticated;
grant all on public.correspondence_message_attachments to service_role;
alter table public.correspondence_message_attachments enable row level security;
create policy msg_attachments_select on public.correspondence_message_attachments
  for select to authenticated using (private.can_see_message(auth.uid(), message_id));
create policy msg_attachments_insert on public.correspondence_message_attachments
  for insert to authenticated with check (exists (
    select 1 from public.correspondence_messages m
    where m.id = message_id and m.author_id = auth.uid()));

-- 4) audit constraint ----------------------------------------------------
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions',
    'contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages']));

-- 5) helpers -------------------------------------------------------------
create or replace function private.can_access_request_ctx(
  _user_id uuid, _project_id uuid, _requested_by uuid, _assigned_user uuid, _assigned_entity uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _user_id is not null and (
    _requested_by = _user_id
    or _assigned_user = _user_id
    or private.is_project_insider(_user_id, _project_id)
    or (_assigned_entity is not null
        and private.is_entity_member(_user_id, _assigned_entity)
        and private.accepted_party_entity(_user_id, _project_id) = _assigned_entity)
  );
$$;

create or replace function private.can_access_request(_user_id uuid, _request_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
    where r.id = _request_id
      and private.can_access_request_ctx(_user_id, r.project_id, r.requested_by, r.assigned_user_id, r.assigned_entity_id)
  );
$$;

create or replace function private.actor_role_label(_user_id uuid, _project_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select em.role::text
       from public.entity_memberships em
       join public.projects p on p.entity_id = em.entity_id
      where p.id = _project_id and em.user_id = _user_id and em.status = 'active' limit 1),
    case when (select owner_id from public.projects where id = _project_id) = _user_id then 'project_owner' end,
    (select pp.party_role::text from public.project_parties pp
      where pp.project_id = _project_id and pp.status = 'accepted'
        and private.is_entity_member(_user_id, pp.party_entity_id) limit 1),
    'participant');
$$;

revoke execute on function private.can_access_request_ctx(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function private.can_access_request(uuid,uuid) from public, anon, authenticated;
revoke execute on function private.actor_role_label(uuid,uuid) from public, anon, authenticated;

-- 6) requests policies ---------------------------------------------------
create policy requests_select on public.requests for select to authenticated
  using (private.can_access_request_ctx(auth.uid(), project_id, requested_by, assigned_user_id, assigned_entity_id));

create policy requests_insert on public.requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and private.can(auth.uid(), 'correspondence'::public.app_module, 'create'::public.app_action, null, project_id)
    and (private.is_project_insider(auth.uid(), project_id)
         or private.accepted_party_entity(auth.uid(), project_id) is not null)
  );

-- 7) status flow + audit -------------------------------------------------
create or replace function public.enforce_request_status_flow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not exists (select 1 from public.request_status_transitions t
                 where t.from_status = old.status and t.to_status = new.status) then
    raise exception 'Illegal request status transition % -> %', old.status, new.status using errcode = '22023';
  end if;
  return new;
end; $$;
revoke execute on function public.enforce_request_status_flow() from public, anon, authenticated;

create trigger requests_status_flow before update on public.requests
  for each row execute function public.enforce_request_status_flow();
create trigger requests_set_updated_at before update on public.requests
  for each row execute function public.set_updated_at();
create trigger requests_audit after insert or update on public.requests
  for each row execute function public.audit_stage_object_change();

create or replace function public.prevent_request_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Requests cannot be deleted; cancel them instead' using errcode = '42501';
end; $$;
revoke execute on function public.prevent_request_delete() from public, anon, authenticated;
create trigger requests_no_delete before delete on public.requests
  for each row execute function public.prevent_request_delete();

-- 8) RPCs ----------------------------------------------------------------
create or replace function public.create_request(
  _project_id uuid,
  _request_type_code text,
  _subject text,
  _body text,
  _stage_id uuid default null,
  _contract_id uuid default null,
  _property_id uuid default null,
  _property_unit_id uuid default null,
  _assigned_entity_id uuid default null,
  _assigned_user_id uuid default null,
  _priority text default 'normal',
  _due_at timestamptz default null,
  _submit boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_type public.request_types%rowtype;
  v_thread uuid;
  v_request uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_type from public.request_types where code = _request_type_code and is_active;
  if v_type.code is null then
    raise exception 'Unknown or inactive request type' using errcode = '22023';
  end if;
  if v_type.requires_stage and _stage_id is null then
    raise exception 'This request type requires a stage' using errcode = '22023';
  end if;
  if v_type.requires_unit and _property_unit_id is null then
    raise exception 'This request type requires a property unit' using errcode = '22023';
  end if;
  if not private.can(v_actor, v_type.module, 'create'::public.app_action, null, _project_id)
     or not (private.is_project_insider(v_actor, _project_id)
             or private.accepted_party_entity(v_actor, _project_id) is not null) then
    raise exception 'Not allowed to create requests on this project' using errcode = '42501';
  end if;
  if _stage_id is not null and not exists (
      select 1 from public.project_stages s where s.id = _stage_id and s.project_id = _project_id) then
    raise exception 'Stage does not belong to this project' using errcode = '22023';
  end if;

  insert into public.correspondence_threads(project_id, contract_id, stage_id, subject, created_by)
  values (_project_id, _contract_id, _stage_id, _subject, v_actor)
  returning id into v_thread;

  insert into public.requests(
    request_type_code, project_id, stage_id, contract_id, property_id, property_unit_id,
    requested_by, assigned_entity_id, assigned_user_id, status, priority, subject, due_at, thread_id)
  values (
    _request_type_code, _project_id, _stage_id, _contract_id, _property_id, _property_unit_id,
    v_actor, _assigned_entity_id, _assigned_user_id,
    case when _submit then 'submitted' else 'draft' end,
    coalesce(_priority, 'normal'), _subject, _due_at, v_thread)
  returning id into v_request;

  if _body is not null and length(btrim(_body)) > 0 then
    insert into public.correspondence_messages(thread_id, author_id, body, visibility, message_kind, author_role_snapshot)
    values (v_thread, v_actor, _body, 'shared', 'comment', private.actor_role_label(v_actor, _project_id));
  end if;

  return v_request;
end; $$;

create or replace function public.post_request_message(
  _request_id uuid, _body text, _visibility text default 'shared', _kind text default 'comment')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not private.can_access_request_ctx(v_actor, v_req.project_id, v_req.requested_by,
                                        v_req.assigned_user_id, v_req.assigned_entity_id) then
    raise exception 'Not allowed to post on this request' using errcode = '42501';
  end if;
  if _visibility not in ('shared','party_limited','internal_note') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;
  if _visibility = 'internal_note' and not private.is_project_insider(v_actor, v_req.project_id) then
    raise exception 'Only project insiders can post internal notes' using errcode = '42501';
  end if;
  if _kind not in ('comment','reminder','info_request','decision','system') then
    raise exception 'Invalid message kind' using errcode = '22023';
  end if;

  insert into public.correspondence_messages(thread_id, author_id, body, visibility, message_kind, author_role_snapshot)
  values (v_req.thread_id, v_actor, _body, _visibility, _kind, private.actor_role_label(v_actor, v_req.project_id))
  returning id into v_id;

  if v_req.status = 'info_needed' and v_req.requested_by = v_actor and _visibility = 'shared' then
    update public.requests set status = 'in_review' where id = _request_id;
  end if;

  return v_id;
end; $$;

create or replace function public.request_reminder(_request_id uuid, _body text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_req public.requests%rowtype;
begin
  select * into v_req from public.requests where id = _request_id;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if v_req.status in ('closed','cancelled') then
    raise exception 'A closed request cannot be reminded' using errcode = '22023';
  end if;
  return public.post_request_message(_request_id, coalesce(_body, 'تذكير بالطلب'), 'shared', 'reminder');
end; $$;

create or replace function public.request_more_info(_request_id uuid, _body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
  v_msg uuid;
begin
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if v_req.requested_by = v_actor then
    raise exception 'The requester cannot ask themselves for more info' using errcode = '42501';
  end if;
  v_msg := public.post_request_message(_request_id, _body, 'shared', 'info_request');
  update public.requests set status = 'info_needed' where id = _request_id and status <> 'info_needed';
  return v_msg;
end; $$;

create or replace function public.decide_request(_request_id uuid, _approve boolean, _note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
  v_module public.app_module;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if v_req.requested_by = v_actor then
    raise exception 'The requester cannot decide their own request' using errcode = '42501';
  end if;
  if v_req.status not in ('submitted','in_review') then
    raise exception 'Request is % and cannot be decided', v_req.status using errcode = '22023';
  end if;
  select module into v_module from public.request_types where code = v_req.request_type_code;
  if not private.is_project_insider(v_actor, v_req.project_id)
     or not private.can(v_actor, v_module, 'approve'::public.app_action, null, v_req.project_id) then
    raise exception 'Not allowed to decide requests on this project' using errcode = '42501';
  end if;

  update public.requests
    set status = case when _approve then 'approved' else 'rejected' end,
        decided_by = v_actor, decided_at = now(), decision_note = _note
    where id = _request_id;

  perform public.post_request_message(
    _request_id,
    coalesce(_note, case when _approve then 'تمت الموافقة على الطلب' else 'تم رفض الطلب' end),
    'shared', 'decision');

  return case when _approve then 'approved' else 'rejected' end;
end; $$;

create or replace function public.close_request(_request_id uuid, _reason text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_req public.requests%rowtype;
begin
  select * into v_req from public.requests where id = _request_id for update;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = '22023';
  end if;
  if not private.can_access_request_ctx(v_actor, v_req.project_id, v_req.requested_by,
                                        v_req.assigned_user_id, v_req.assigned_entity_id) then
    raise exception 'Not allowed to close this request' using errcode = '42501';
  end if;
  update public.requests
    set status = 'closed', closed_at = now(), closure_reason = _reason
    where id = _request_id;
  update public.correspondence_threads set status = 'closed' where id = v_req.thread_id;
  return now();
end; $$;

revoke execute on function public.create_request(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,boolean) from public, anon;
revoke execute on function public.post_request_message(uuid,text,text,text) from public, anon;
revoke execute on function public.request_reminder(uuid,text) from public, anon;
revoke execute on function public.request_more_info(uuid,text) from public, anon;
revoke execute on function public.decide_request(uuid,boolean,text) from public, anon;
revoke execute on function public.close_request(uuid,text) from public, anon;

-- 9) reference data ------------------------------------------------------
insert into public.request_types(code, name_ar, name_en, module, requires_stage, requires_unit, order_index) values
  ('info_request','طلب معلومة','Information request','correspondence',false,false,1),
  ('document_request','طلب مستند','Document request','documents',false,false,2),
  ('approval_request','طلب اعتماد','Approval request','stages',true,false,3),
  ('general_request','طلب عام','General request','correspondence',false,false,4);

insert into public.request_status_transitions(from_status, to_status, actor_scope) values
  ('draft','submitted','requester'),
  ('draft','cancelled','requester'),
  ('submitted','in_review','handler'),
  ('submitted','info_needed','handler'),
  ('submitted','approved','handler'),
  ('submitted','rejected','handler'),
  ('submitted','cancelled','requester'),
  ('in_review','info_needed','handler'),
  ('in_review','approved','handler'),
  ('in_review','rejected','handler'),
  ('in_review','cancelled','requester'),
  ('info_needed','in_review','either'),
  ('info_needed','cancelled','requester'),
  ('approved','closed','either'),
  ('rejected','closed','either'),
  ('cancelled','closed','either');
