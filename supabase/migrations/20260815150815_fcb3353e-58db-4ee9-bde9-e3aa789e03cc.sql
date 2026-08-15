create or replace function private.sanitize_error(_msg text)
returns text language sql immutable set search_path = public as $$
  select left(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(coalesce(_msg,''),
      '-----BEGIN[\s\S]*?-----END[^-]*-----', '[REDACTED]', 'g'),
      '(?i)(api[_-]?key|secret|password|token|authorization)\s*[:=]\s*\S+', '\1=[REDACTED]', 'g'),
      '(?i)bearer\s+[A-Za-z0-9._~+/=-]{8,}', 'Bearer [REDACTED]', 'g'),
      'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.?[A-Za-z0-9_-]*', '[REDACTED]', 'g'),
      '(^|[^A-Za-z0-9])(sk|pk|rk)_[A-Za-z0-9]{8,}', '\1[REDACTED]', 'g'),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[EMAIL_REDACTED]', 'g'),
      '(^|[^0-9])(\+?9665[0-9]{8}|0?5[0-9]{8}|[12][0-9]{9})([^0-9]|$)', '\1[ID_REDACTED]\3', 'g'),
      '[A-Za-z0-9_-]{40,}', '[REDACTED]', 'g'),
  500)
$$;

create or replace function public.begin_integration_request(
  _code text,
  _operation text,
  _idempotency_key text,
  _payload jsonb default '{}'::jsonb,
  _entity_id uuid default null,
  _project_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_int public.integration_registry%rowtype;
  v_existing public.integration_requests%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not private.can(v_uid, 'integrations'::app_module, 'execute'::app_action, null, null) then
    raise exception 'PLATFORM_STAFF_ONLY';
  end if;

  select * into v_int from public.integration_registry where code = _code;
  if not found then raise exception 'INTEGRATION_NOT_FOUND'; end if;
  if not v_int.active or v_int.status = 'planned' then raise exception 'INTEGRATION_NOT_AVAILABLE'; end if;

  select * into v_existing from public.integration_requests
   where integration_id = v_int.id and idempotency_key = _idempotency_key;

  if found then
    if v_existing.status in ('success','failed') then
      return jsonb_build_object(
        'request_id', v_existing.id, 'replayed', true,
        'status', v_existing.status,
        'response', v_existing.response_payload,
        'safe_error', v_existing.safe_error);
    end if;
    return jsonb_build_object('request_id', v_existing.id, 'replayed', false, 'status', v_existing.status);
  end if;

  insert into public.integration_requests
    (integration_id, direction, operation, idempotency_key, request_payload,
     status, attempts, max_attempts, entity_id, project_id, created_by)
  values
    (v_int.id, 'outbound', _operation, _idempotency_key, coalesce(_payload,'{}'::jsonb),
     'pending', 0, coalesce((v_int.retry_policy->>'max_attempts')::int, 3), _entity_id, _project_id, v_uid)
  returning id into v_id;

  return jsonb_build_object('request_id', v_id, 'replayed', false, 'status', 'pending');
end $$;

revoke execute on function public.begin_integration_request(text,text,text,jsonb,uuid,uuid) from public, anon;
grant execute on function public.begin_integration_request(text,text,text,jsonb,uuid,uuid) to authenticated;
revoke execute on function private.sanitize_error(text) from public, anon, authenticated;