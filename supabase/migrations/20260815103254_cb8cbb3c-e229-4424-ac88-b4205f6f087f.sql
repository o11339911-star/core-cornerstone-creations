-- ============ 17-A: Notifications & secure links ============

create table public.notification_types (
  code text primary key,
  category text not null check (category in ('action_required','reminder','overdue','escalation','security','info')),
  default_channel text not null default 'in_app' check (default_channel in ('in_app','email','sms')),
  is_mandatory boolean not null default false,
  is_security boolean not null default false,
  subject_key text not null,
  body_key text not null,
  target_kind text not null check (target_kind in ('request','stage','milestone','disbursement','document','financial_document','retention','contract','membership')),
  created_at timestamptz not null default now()
);
comment on table public.notification_types is 'مرجع ثابت لأنواع الإشعارات. النص لا يخزَّن هنا: فقط مفاتيح i18n.';
grant select on public.notification_types to authenticated;
grant all on public.notification_types to service_role;
alter table public.notification_types enable row level security;
create policy "notification_types readable" on public.notification_types for select to authenticated using (true);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null,
  type_code text not null references public.notification_types(code),
  project_id uuid references public.projects(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete cascade,
  target_kind text not null,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  dedupe_key text not null,
  escalation_of_id uuid references public.notifications(id),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz
);
comment on table public.notifications is 'إشعارات داخل التطبيق. الحمولة معرّفات فقط: ممنوع أي مبلغ أو موقع دقيق. الرابط يُقيَّم عند النقر لا عند الإنشاء.';
create unique index notifications_dedupe_uk on public.notifications(dedupe_key);
create index notifications_recipient_idx on public.notifications(recipient_user_id, created_at desc);

grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app','email','sms')),
  status text not null check (status in ('pending','sent','deferred','suppressed','failed')),
  deferred_reason text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz
);
comment on table public.notification_deliveries is 'سجل تسليم append-only. في هذه المرحلة in_app فقط؛ email/sms بلا تكامل مزوّد.';
grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;
alter table public.notification_deliveries enable row level security;
create trigger notification_deliveries_immutable
  before update or delete on public.notification_deliveries
  for each row execute function public.prevent_row_mutation();

create table public.notification_preferences (
  user_id uuid not null,
  type_code text not null references public.notification_types(code),
  in_app boolean not null default true,
  digest_mode text not null default 'immediate' check (digest_mode in ('immediate','daily','weekly','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, type_code)
);
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
alter table public.notification_preferences enable row level security;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- suspended = has a suspended membership and no active one
create or replace function private.user_is_suspended(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entity_memberships m where m.user_id = _user_id and m.status = 'suspended')
     and not exists (select 1 from public.entity_memberships m where m.user_id = _user_id and m.status = 'active');
$$;

-- RLS
create policy "own notifications" on public.notifications
  for select to authenticated
  using (recipient_user_id = auth.uid() and not private.user_is_suspended(auth.uid()));

create policy "own deliveries" on public.notification_deliveries
  for select to authenticated
  using (exists (select 1 from public.notifications n where n.id = notification_id and n.recipient_user_id = auth.uid()));

create policy "own preferences" on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- mandatory/security preferences can never be switched off
create or replace function public.enforce_notification_preference_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select is_mandatory, is_security into t from public.notification_types where code = new.type_code;
  if t is null then raise exception 'unknown notification type' using errcode = '22023'; end if;
  if (t.is_mandatory or t.is_security) and (new.in_app = false or new.digest_mode = 'off') then
    raise exception 'MANDATORY_NOTIFICATION_CANNOT_BE_DISABLED' using errcode = '22023';
  end if;
  return new;
end; $$;
create trigger notification_preferences_guard
  before insert or update on public.notification_preferences
  for each row execute function public.enforce_notification_preference_guard();

-- payload must never carry money or precise location
create or replace function public.enforce_notification_payload_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  foreach k in array coalesce(array(select jsonb_object_keys(new.payload)), '{}'::text[]) loop
    if lower(k) ~ '(amount|total|subtotal|tax|price|currency|balance|salary|lat|lng|latitude|longitude|coord|geom)' then
      raise exception 'NOTIFICATION_PAYLOAD_FORBIDDEN_FIELD: %', k using errcode = '22023';
    end if;
  end loop;
  return new;
end; $$;
create trigger notifications_payload_guard
  before insert or update on public.notifications
  for each row execute function public.enforce_notification_payload_guard();

create trigger notifications_immutable_delete
  before delete on public.notifications
  for each row execute function public.prevent_row_mutation();

-- ============ emit ============
create or replace function private.emit_notification(
  _recipient uuid, _type_code text, _project_id uuid, _entity_id uuid,
  _target_kind text, _target_id uuid, _payload jsonb, _discriminator text,
  _severity text default 'info'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t record; pref record; v_id uuid; v_key text; v_suspended boolean;
begin
  if _recipient is null then return null; end if;
  select * into t from public.notification_types where code = _type_code;
  if t is null then return null; end if;

  select * into pref from public.notification_preferences p
   where p.user_id = _recipient and p.type_code = _type_code;
  if pref is not null and not (t.is_mandatory or t.is_security)
     and (pref.in_app = false or pref.digest_mode = 'off') then
    return null;
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
          case when v_suspended then 'deferred' else 'sent' end,
          case when v_suspended then 'user_suspended' else null end,
          case when v_suspended then null else now() end);

  return v_id;
end; $$;

-- ============ click-time resolution ============
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
grant execute on function public.resolve_notification_target(uuid) to authenticated;

create or replace function public.mark_notification_read(_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where id = _notification_id and recipient_user_id = auth.uid()
     and not private.user_is_suspended(auth.uid());
end; $$;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  if private.user_is_suspended(auth.uid()) then return 0; end if;
  with u as (update public.notifications set read_at = now()
             where recipient_user_id = auth.uid() and read_at is null returning 1)
  select count(*) into c from u;
  return coalesce(c,0);
end; $$;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ============ event triggers ============
create or replace function public.notify_request_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare p jsonb;
begin
  p := jsonb_build_object('request_id', new.id, 'status', new.status, 'request_no', new.request_no);
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.emit_notification(new.assigned_user_id, 'request.submitted', new.project_id, new.assigned_entity_id,
      'request', new.id, p, 'submitted', 'info');
  elsif new.status = 'info_needed' and old.status is distinct from new.status then
    perform private.emit_notification(new.requested_by, 'request.info_needed', new.project_id, new.assigned_entity_id,
      'request', new.id, p, 'info_needed', 'warning');
  elsif new.status in ('approved','rejected') and old.status is distinct from new.status then
    perform private.emit_notification(new.requested_by, 'request.decided', new.project_id, new.assigned_entity_id,
      'request', new.id, p, new.status, 'info');
  end if;
  return null;
end; $$;
create trigger notify_request_event_tr
  after insert or update of status on public.requests
  for each row execute function public.notify_request_event();

create or replace function public.notify_stage_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare p jsonb; v_owner uuid;
begin
  if old.status is not distinct from new.status then return null; end if;
  select owner_id into v_owner from public.projects where id = new.project_id;
  p := jsonb_build_object('stage_id', new.id, 'status', new.status);
  if new.status = 'submitted' then
    perform private.emit_notification(v_owner, 'stage.submitted', new.project_id, null, 'stage', new.id, p, 'submitted', 'info');
  elsif new.status = 'rework' then
    perform private.emit_notification(new.submitted_by, 'stage.rework', new.project_id, null, 'stage', new.id, p, 'rework', 'warning');
  elsif new.status = 'approved' then
    perform private.emit_notification(v_owner, 'stage.approved', new.project_id, null, 'stage', new.id, p, 'approved', 'info');
  end if;
  return null;
end; $$;
create trigger notify_stage_event_tr
  after update of status on public.project_stages
  for each row execute function public.notify_stage_event();

create or replace function public.notify_disbursement_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if old.status is not distinct from new.status then return null; end if;
  select owner_id into v_owner from public.projects where id = new.project_id;
  if v_owner is null or not private.can_view_project_finance(v_owner, new.project_id) then return null; end if;
  perform private.emit_notification(v_owner, 'finance.disbursement_status', new.project_id, null,
    'disbursement', new.id,
    jsonb_build_object('disbursement_request_id', new.id, 'status', new.status),
    new.status, 'info');
  return null;
end; $$;
create trigger notify_disbursement_event_tr
  after update of status on public.disbursement_requests
  for each row execute function public.notify_disbursement_event();

create or replace function public.notify_financial_document_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if old.status is not distinct from new.status then return null; end if;
  if new.status not in ('issued','cancelled') then return null; end if;
  select owner_id into v_owner from public.projects where id = new.project_id;
  if v_owner is null or not private.can_view_project_finance(v_owner, new.project_id) then return null; end if;
  perform private.emit_notification(v_owner, 'finance.document_status', new.project_id, null,
    'financial_document', new.id,
    jsonb_build_object('document_id', new.id, 'status', new.status, 'doc_type', new.doc_type),
    new.status, 'info');
  return null;
end; $$;
create trigger notify_financial_document_event_tr
  after update of status on public.financial_documents
  for each row execute function public.notify_financial_document_event();

create or replace function public.notify_membership_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'suspended' and old.status is distinct from new.status then
    perform private.emit_notification(new.user_id, 'security.membership_suspended', null, new.entity_id,
      'membership', new.id, jsonb_build_object('membership_id', new.id, 'status', new.status),
      'suspended', 'critical');
  end if;
  return null;
end; $$;
create trigger notify_membership_suspended_tr
  after update of status on public.entity_memberships
  for each row execute function public.notify_membership_suspended();

-- ============ seed types ============
insert into public.notification_types (code, category, is_mandatory, is_security, subject_key, body_key, target_kind) values
 ('request.submitted','action_required', true, false,'notif.request.submitted.subject','notif.request.submitted.body','request'),
 ('request.info_needed','action_required', true, false,'notif.request.infoNeeded.subject','notif.request.infoNeeded.body','request'),
 ('request.decided','info', false, false,'notif.request.decided.subject','notif.request.decided.body','request'),
 ('stage.submitted','action_required', true, false,'notif.stage.submitted.subject','notif.stage.submitted.body','stage'),
 ('stage.rework','action_required', true, false,'notif.stage.rework.subject','notif.stage.rework.body','stage'),
 ('stage.approved','info', false, false,'notif.stage.approved.subject','notif.stage.approved.body','stage'),
 ('finance.disbursement_status','action_required', true, false,'notif.finance.disbursement.subject','notif.finance.disbursement.body','disbursement'),
 ('finance.document_status','info', false, false,'notif.finance.document.subject','notif.finance.document.body','financial_document'),
 ('security.membership_suspended','security', true, true,'notif.security.suspended.subject','notif.security.suspended.body','membership'),
 ('document.shared','info', false, false,'notif.document.shared.subject','notif.document.shared.body','document'),
 ('contract.updated','info', false, false,'notif.contract.updated.subject','notif.contract.updated.body','contract');