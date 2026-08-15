-- ============ Phase 25: integrations registry, adapter request log ============

alter table public.notification_types drop constraint if exists notification_types_target_kind_check;
alter table public.notification_types add constraint notification_types_target_kind_check
  check (target_kind = any (array['request','stage','contract','document','disbursement','financial_document','milestone','retention','membership','warranty','queue_item','breakglass','marketing_version','marketing_contract','media_asset','media_publication','appointment','order','integration']));

insert into public.notification_types (code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind)
values ('integration.failure_threshold','escalation','in_app',true,true,'notif.integration.failureThreshold.subject','notif.integration.failureThreshold.body','integration')
on conflict (code) do nothing;

-- ---------- registry ----------
create table public.integration_registry (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  provider_name_ar text not null,
  provider_name_en text not null,
  purpose text not null,
  legal_basis text,
  agreement_status text not null default 'none' check (agreement_status in ('none','under_review','signed')),
  secret_env_names text[] not null default '{}',
  exchanged_fields jsonb not null default '[]'::jsonb,
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute > 0),
  retry_policy jsonb not null default '{"max_attempts":3,"backoff_seconds":30}'::jsonb,
  webhook_url text,
  idempotency_scope text not null default 'operation',
  status text not null default 'planned' check (status in ('planned','mock','sandbox','live')),
  live_approval_ref text,
  failure_threshold integer not null default 5 check (failure_threshold > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_status_live_ck check (status <> 'live' or live_approval_ref is not null)
);

grant select on public.integration_registry to authenticated;
grant all on public.integration_registry to service_role;
alter table public.integration_registry enable row level security;
create policy "platform staff read integrations" on public.integration_registry
  for select to authenticated using (private.is_platform_staff(auth.uid()));
revoke insert, update, delete, truncate on public.integration_registry from anon, authenticated;
revoke select on public.integration_registry from anon;

-- ---------- requests ----------
create table public.integration_requests (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integration_registry(id) on delete cascade,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  operation text not null,
  idempotency_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  status text not null default 'pending' check (status in ('pending','success','failed','retried')),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts > 0),
  safe_error text,
  entity_id uuid references public.entities(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, idempotency_key)
);
create index integration_requests_recent_idx on public.integration_requests (integration_id, created_at desc);

grant select on public.integration_requests to authenticated;
grant all on public.integration_requests to service_role;
alter table public.integration_requests enable row level security;
create policy "platform staff read integration requests" on public.integration_requests
  for select to authenticated using (private.is_platform_staff(auth.uid()));
revoke insert, update, delete, truncate on public.integration_requests from anon, authenticated;
revoke select on public.integration_requests from anon;

-- ---------- failure counters ----------
create table public.integration_failure_counters (
  integration_id uuid primary key references public.integration_registry(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failure_count integer not null default 0,
  last_notified_at timestamptz,
  updated_at timestamptz not null default now()
);
grant select on public.integration_failure_counters to authenticated;
grant all on public.integration_failure_counters to service_role;
alter table public.integration_failure_counters enable row level security;
create policy "platform staff read integration counters" on public.integration_failure_counters
  for select to authenticated using (private.is_platform_staff(auth.uid()));
revoke insert, update, delete, truncate on public.integration_failure_counters from anon, authenticated;
revoke select on public.integration_failure_counters from anon;

-- ---------- secret-leak guard ----------
create or replace function private.looks_like_secret(_txt text)
returns boolean language sql immutable set search_path = public as $$
  select _txt is not null and (
    length(_txt) > 64
    or _txt ~ '-----BEGIN'
    or _txt ~ '(^|[^A-Za-z0-9])sk_[A-Za-z0-9]'
    or _txt ~ 'eyJ[A-Za-z0-9_-]{8,}'
    or _txt ~* '(api[_-]?key|secret|password|token)\s*[:=]\s*\S'
  )
$$;

create or replace function private.reject_secret_values()
returns trigger language plpgsql set search_path = public as $$
declare v text;
begin
  foreach v in array coalesce(new.secret_env_names, '{}') loop
    if v !~ '^[A-Z][A-Z0-9_]{2,}$' or private.looks_like_secret(v) then
      raise exception 'SECRET_VALUE_NOT_ALLOWED';
    end if;
  end loop;
  if private.looks_like_secret(new.exchanged_fields::text)
     or private.looks_like_secret(coalesce(new.legal_basis,''))
     or private.looks_like_secret(coalesce(new.purpose,''))
     or private.looks_like_secret(coalesce(new.webhook_url,''))
     or private.looks_like_secret(coalesce(new.live_approval_ref,'')) then
    raise exception 'SECRET_VALUE_NOT_ALLOWED';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger integration_registry_secret_guard
  before insert or update on public.integration_registry
  for each row execute function private.reject_secret_values();

-- ---------- live lock ----------
create or replace function private.reject_live_integration()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'live' then
    raise exception 'INTEGRATION_LIVE_REQUIRES_APPROVAL';
  end if;
  return new;
end $$;

create trigger integration_registry_live_guard
  before insert or update on public.integration_registry
  for each row execute function private.reject_live_integration();

-- ---------- safe error ----------
create or replace function private.sanitize_error(_msg text)
returns text language plpgsql immutable set search_path = public as $$
declare v text := coalesce(_msg, '');
begin
  v := regexp_replace(v, 'eyJ[A-Za-z0-9_.-]{8,}', '[REDACTED]', 'g');
  v := regexp_replace(v, '\m(sk|pk|rk)_[A-Za-z0-9]{4,}', '[REDACTED]', 'g');
  v := regexp_replace(v, 'Bearer\s+\S+', 'Bearer [REDACTED]', 'gi');
  v := regexp_replace(v, '-----BEGIN[\s\S]*?-----END[^-]*-----', '[REDACTED]', 'g');
  v := regexp_replace(v, '((?:api[_-]?key|secret|password|token)\s*[:=]\s*)\S+', '\1[REDACTED]', 'gi');
  v := regexp_replace(v, '[A-Za-z0-9_-]{40,}', '[REDACTED]', 'g');
  return left(v, 500);
end $$;

-- ---------- staff guard ----------
create or replace function private.require_integrations_staff()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.is_platform_staff(v_uid) then
    raise exception 'PLATFORM_STAFF_ONLY';
  end if;
  return v_uid;
end $$;

-- ---------- registry write api ----------
create or replace function public.upsert_integration(
  _code text,
  _provider_name_ar text,
  _provider_name_en text,
  _purpose text,
  _legal_basis text default null,
  _agreement_status text default 'none',
  _secret_env_names text[] default '{}',
  _exchanged_fields jsonb default '[]'::jsonb,
  _rate_limit_per_minute integer default 60,
  _retry_policy jsonb default '{"max_attempts":3,"backoff_seconds":30}'::jsonb,
  _webhook_url text default null,
  _failure_threshold integer default 5
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_integrations_staff();
  insert into public.integration_registry as ir
    (code, provider_name_ar, provider_name_en, purpose, legal_basis, agreement_status,
     secret_env_names, exchanged_fields, rate_limit_per_minute, retry_policy, webhook_url, failure_threshold, status)
  values (_code, _provider_name_ar, _provider_name_en, _purpose, _legal_basis, _agreement_status,
     _secret_env_names, _exchanged_fields, _rate_limit_per_minute, _retry_policy, _webhook_url, _failure_threshold, 'planned')
  on conflict (code) do update set
    provider_name_ar = excluded.provider_name_ar,
    provider_name_en = excluded.provider_name_en,
    purpose = excluded.purpose,
    legal_basis = excluded.legal_basis,
    agreement_status = excluded.agreement_status,
    secret_env_names = excluded.secret_env_names,
    exchanged_fields = excluded.exchanged_fields,
    rate_limit_per_minute = excluded.rate_limit_per_minute,
    retry_policy = excluded.retry_policy,
    webhook_url = excluded.webhook_url,
    failure_threshold = excluded.failure_threshold
  returning ir.id into v_id;
  return v_id;
end $$;

create or replace function public.set_integration_status(_code text, _status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_integrations_staff();
  if _status = 'live' then
    raise exception 'INTEGRATION_LIVE_REQUIRES_APPROVAL';
  end if;
  if _status not in ('planned','mock','sandbox') then
    raise exception 'INVALID_INTEGRATION_STATUS';
  end if;
  update public.integration_registry set status = _status where code = _code;
  if not found then raise exception 'INTEGRATION_NOT_FOUND'; end if;
end $$;

-- ---------- request lifecycle ----------
create or replace function public.begin_integration_request(
  _code text,
  _operation text,
  _idempotency_key text,
  _payload jsonb default '{}'::jsonb,
  _entity_id uuid default null,
  _project_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_int public.integration_registry%rowtype;
  v_req public.integration_requests%rowtype;
  v_max int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_int from public.integration_registry where code = _code and active;
  if v_int.id is null then raise exception 'INTEGRATION_NOT_FOUND'; end if;
  if v_int.status <> 'mock' then raise exception 'INTEGRATION_NOT_AVAILABLE'; end if;
  v_max := greatest(1, coalesce((v_int.retry_policy->>'max_attempts')::int, 3));

  select * into v_req from public.integration_requests
   where integration_id = v_int.id and idempotency_key = _idempotency_key for update;

  if v_req.id is not null then
    if v_req.status = 'success' then
      return jsonb_build_object('request_id', v_req.id, 'replayed', true,
        'status', 'success', 'response', v_req.response_payload);
    end if;
    if v_req.status = 'failed' then
      return jsonb_build_object('request_id', v_req.id, 'replayed', true,
        'status', 'failed', 'safe_error', v_req.safe_error);
    end if;
    if v_req.attempts >= v_req.max_attempts then
      update public.integration_requests
         set status = 'failed', completed_at = now(), updated_at = now(),
             safe_error = coalesce(safe_error, 'INTEGRATION_MAX_ATTEMPTS_REACHED')
       where id = v_req.id;
      return jsonb_build_object('request_id', v_req.id, 'replayed', true,
        'status', 'failed', 'safe_error', 'INTEGRATION_MAX_ATTEMPTS_REACHED');
    end if;
    update public.integration_requests
       set attempts = attempts + 1, status = 'retried', last_attempt_at = now(), updated_at = now()
     where id = v_req.id
     returning * into v_req;
    return jsonb_build_object('request_id', v_req.id, 'replayed', false,
      'status', 'pending', 'attempt', v_req.attempts, 'max_attempts', v_req.max_attempts);
  end if;

  insert into public.integration_requests
    (integration_id, operation, idempotency_key, request_payload, status, attempts, max_attempts,
     entity_id, project_id, created_by, first_attempt_at, last_attempt_at)
  values (v_int.id, _operation, _idempotency_key, coalesce(_payload,'{}'::jsonb), 'pending', 1, v_max,
     _entity_id, _project_id, v_uid, now(), now())
  returning * into v_req;

  return jsonb_build_object('request_id', v_req.id, 'replayed', false,
    'status', 'pending', 'attempt', 1, 'max_attempts', v_max);
end $$;

create or replace function public.complete_integration_request(
  _request_id uuid,
  _ok boolean,
  _response jsonb default null,
  _error text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req public.integration_requests%rowtype;
  v_int public.integration_registry%rowtype;
  v_safe text;
  v_count int;
  v_notified boolean := false;
  v_staff record;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_req from public.integration_requests where id = _request_id for update;
  if v_req.id is null then raise exception 'INTEGRATION_REQUEST_NOT_FOUND'; end if;
  select * into v_int from public.integration_registry where id = v_req.integration_id;

  if _ok then
    update public.integration_requests
       set status = 'success', response_payload = _response, safe_error = null,
           completed_at = now(), last_attempt_at = now(), updated_at = now()
     where id = v_req.id returning * into v_req;
    return jsonb_build_object('status','success','request_id',v_req.id,'response',v_req.response_payload);
  end if;

  v_safe := private.sanitize_error(_error);

  update public.integration_requests
     set safe_error = v_safe,
         last_attempt_at = now(),
         updated_at = now(),
         status = case when v_req.attempts >= v_req.max_attempts then 'failed' else 'retried' end,
         completed_at = case when v_req.attempts >= v_req.max_attempts then now() else null end
   where id = v_req.id returning * into v_req;

  insert into public.integration_failure_counters (integration_id, failure_count, window_started_at, updated_at)
  values (v_int.id, 1, now(), now())
  on conflict (integration_id) do update
    set failure_count = case when public.integration_failure_counters.window_started_at < now() - interval '1 hour'
                             then 1 else public.integration_failure_counters.failure_count + 1 end,
        window_started_at = case when public.integration_failure_counters.window_started_at < now() - interval '1 hour'
                             then now() else public.integration_failure_counters.window_started_at end,
        updated_at = now()
  returning failure_count into v_count;

  if v_count >= v_int.failure_threshold then
    for v_staff in select user_id from public.platform_staff where active loop
      perform private.emit_notification(
        v_staff.user_id, 'integration.failure_threshold', null, null,
        'integration', v_int.id,
        jsonb_build_object('integration_code', v_int.code, 'failure_count', v_count,
                           'threshold', v_int.failure_threshold),
        v_int.code || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'),
        'critical');
      v_notified := true;
    end loop;
    update public.integration_failure_counters set last_notified_at = now() where integration_id = v_int.id;
  end if;

  return jsonb_build_object('status', v_req.status, 'request_id', v_req.id,
    'safe_error', v_req.safe_error, 'attempts', v_req.attempts,
    'max_attempts', v_req.max_attempts, 'failure_count', v_count, 'notified', v_notified);
end $$;

-- ---------- read api ----------
create or replace function public.list_integrations()
returns setof public.integration_registry language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_integrations_staff();
  return query select * from public.integration_registry order by code;
end $$;

create or replace function public.list_integration_requests(_code text default null, _limit integer default 50)
returns setof public.integration_requests language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_integrations_staff();
  return query
    select r.* from public.integration_requests r
    join public.integration_registry i on i.id = r.integration_id
    where (_code is null or i.code = _code)
    order by r.created_at desc
    limit greatest(1, least(coalesce(_limit,50), 200));
end $$;

-- ---------- role permissions for the new module ----------
insert into public.role_permissions (role, module, action)
select r.role, 'integrations'::public.app_module, a.action
from (values ('owner'::public.app_role),('admin'::public.app_role)) r(role),
     (values ('view'::public.app_action),('update'::public.app_action)) a(action)
on conflict do nothing;

-- ---------- hardening: revoke PUBLIC execute, grant explicitly ----------
revoke execute on function private.looks_like_secret(text) from public;
revoke execute on function private.reject_secret_values() from public;
revoke execute on function private.reject_live_integration() from public;
revoke execute on function private.sanitize_error(text) from public;
revoke execute on function private.require_integrations_staff() from public;
revoke execute on function public.upsert_integration(text,text,text,text,text,text,text[],jsonb,integer,jsonb,text,integer) from public;
revoke execute on function public.set_integration_status(text,text) from public;
revoke execute on function public.begin_integration_request(text,text,text,jsonb,uuid,uuid) from public;
revoke execute on function public.complete_integration_request(uuid,boolean,jsonb,text) from public;
revoke execute on function public.list_integrations() from public;
revoke execute on function public.list_integration_requests(text,integer) from public;

grant execute on function private.require_integrations_staff() to authenticated, service_role;
grant execute on function private.sanitize_error(text) to service_role;
grant execute on function public.upsert_integration(text,text,text,text,text,text,text[],jsonb,integer,jsonb,text,integer) to authenticated, service_role;
grant execute on function public.set_integration_status(text,text) to authenticated, service_role;
grant execute on function public.begin_integration_request(text,text,text,jsonb,uuid,uuid) to authenticated, service_role;
grant execute on function public.complete_integration_request(uuid,boolean,jsonb,text) to authenticated, service_role;
grant execute on function public.list_integrations() to authenticated, service_role;
grant execute on function public.list_integration_requests(text,integer) to authenticated, service_role;