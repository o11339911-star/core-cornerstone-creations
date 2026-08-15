create or replace function public.complete_integration_request(
  _request_id uuid,
  _ok boolean,
  _response jsonb default null,
  _error text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req public.integration_requests%rowtype;
  v_int public.integration_registry%rowtype;
  v_safe text;
  v_count int;
  v_notified boolean := false;
  v_staff record;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not private.can(auth.uid(), 'integrations'::app_module, 'execute'::app_action, null, null) then
    raise exception 'PLATFORM_STAFF_ONLY';
  end if;

  select * into v_req from public.integration_requests where id = _request_id for update;
  if v_req.id is null then raise exception 'INTEGRATION_REQUEST_NOT_FOUND'; end if;
  select * into v_int from public.integration_registry where id = v_req.integration_id;

  if _ok then
    update public.integration_requests
       set status = 'success', response_payload = _response, safe_error = null,
           attempts = v_req.attempts + 1,
           completed_at = now(), last_attempt_at = now(), updated_at = now()
     where id = v_req.id returning * into v_req;
    return jsonb_build_object('status','success','request_id',v_req.id,
      'attempts', v_req.attempts, 'response', v_req.response_payload);
  end if;

  v_safe := private.sanitize_error(_error);

  update public.integration_requests
     set safe_error = v_safe,
         attempts = v_req.attempts + 1,
         last_attempt_at = now(),
         updated_at = now(),
         status = case when v_req.attempts + 1 >= v_req.max_attempts then 'failed' else 'retried' end,
         completed_at = case when v_req.attempts + 1 >= v_req.max_attempts then now() else null end
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

revoke execute on function public.complete_integration_request(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.complete_integration_request(uuid, boolean, jsonb, text) to authenticated;