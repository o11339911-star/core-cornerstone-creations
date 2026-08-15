-- 1) DSR identity verification + moving to review
create or replace function public.verify_dsr_identity(_request_id uuid, _method text, _note_ar text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  perform private.require_privacy_staff();
  select status into v_status from public.dsr_requests where id = _request_id for update;
  if v_status is null then raise exception 'DSR_NOT_FOUND'; end if;
  if v_status = 'submitted' then
    update public.dsr_requests
      set status = 'identity_verification', identity_method = _method, updated_at = now()
      where id = _request_id;
    select status into v_status from public.dsr_requests where id = _request_id;
  end if;
  if v_status <> 'identity_verification' then
    raise exception 'DSR_INVALID_STATUS_TRANSITION: % -> in_review', v_status;
  end if;
  update public.dsr_requests
    set status = 'in_review', identity_verified_at = now(),
        identity_method = coalesce(_method, identity_method), updated_at = now()
    where id = _request_id;
  if _note_ar is not null then
    insert into public.dsr_request_events (request_id, from_status, to_status, actor_id, note_ar)
    values (_request_id, 'identity_verification', 'in_review', auth.uid(), _note_ar);
  end if;
end $$;

-- 2) events trail (requester or privacy staff)
create or replace function public.list_dsr_events(_request_id uuid)
returns setof public.dsr_request_events language sql stable security definer set search_path = public as $$
  select e.* from public.dsr_request_events e
  join public.dsr_requests r on r.id = e.request_id
  where e.request_id = _request_id
    and (r.user_id = auth.uid() or private.can(auth.uid(), 'privacy', 'view'))
  order by e.created_at asc
$$;

-- 3) DPIA register + controls (transparency read for signed-in users)
create or replace function public.list_dpia_register()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'scope_code'), '[]'::jsonb) from (
    select to_jsonb(d) - 'assessed_by' || jsonb_build_object(
      'controls', coalesce((
        select jsonb_agg(to_jsonb(c) - 'dpia_id' order by c.object_name)
        from public.dpia_controls c where c.dpia_id = d.id), '[]'::jsonb)
    ) as x
    from public.dpia_register d
  ) s
$$;

-- 4) processing register (transparency read)
create or replace function public.list_processing_register()
returns setof public.data_processing_register language sql stable security definer set search_path = public as $$
  select * from public.data_processing_register where active order by module::text, activity_code
$$;

-- 5) data incidents
create or replace function public.report_data_incident(
  _title text, _severity text, _detected_at timestamptz, _affected_scope_ar text,
  _data_categories text[] default '{}', _subjects_estimate integer default null,
  _root_cause_ar text default null, _notification_required boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_privacy_staff();
  if _severity not in ('low','medium','high','critical') then
    raise exception 'INCIDENT_INVALID_SEVERITY';
  end if;
  insert into public.data_incidents (title, severity, detected_at, affected_scope_ar,
    data_categories, subjects_estimate, root_cause_ar, notification_required, reported_by)
  values (_title, _severity, coalesce(_detected_at, now()), _affected_scope_ar,
    coalesce(_data_categories,'{}'), _subjects_estimate, _root_cause_ar,
    coalesce(_notification_required,false), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_data_incident(
  _incident_id uuid, _status text default null, _contained_at timestamptz default null,
  _authority_notified_at timestamptz default null, _subjects_notified_at timestamptz default null,
  _lessons_ar text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_privacy_staff();
  update public.data_incidents set
    status = coalesce(_status, status),
    contained_at = coalesce(_contained_at, contained_at),
    authority_notified_at = coalesce(_authority_notified_at, authority_notified_at),
    subjects_notified_at = coalesce(_subjects_notified_at, subjects_notified_at),
    lessons_ar = coalesce(_lessons_ar, lessons_ar),
    updated_at = now()
  where id = _incident_id;
  if not found then raise exception 'INCIDENT_NOT_FOUND'; end if;
end $$;

-- grants: PostgreSQL grants EXECUTE to PUBLIC by default -> revoke, then grant narrowly
revoke all on function public.verify_dsr_identity(uuid, text, text) from public, anon;
revoke all on function public.list_dsr_events(uuid) from public, anon;
revoke all on function public.list_dpia_register() from public, anon;
revoke all on function public.list_processing_register() from public, anon;
revoke all on function public.report_data_incident(text, text, timestamptz, text, text[], integer, text, boolean) from public, anon;
revoke all on function public.update_data_incident(uuid, text, timestamptz, timestamptz, timestamptz, text) from public, anon;

grant execute on function public.verify_dsr_identity(uuid, text, text) to authenticated;
grant execute on function public.list_dsr_events(uuid) to authenticated;
grant execute on function public.list_dpia_register() to authenticated;
grant execute on function public.list_processing_register() to authenticated;
grant execute on function public.report_data_incident(text, text, timestamptz, text, text[], integer, text, boolean) to authenticated;
grant execute on function public.update_data_incident(uuid, text, timestamptz, timestamptz, timestamptz, text) to authenticated;