create or replace function public.notify_stage_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p jsonb;
  v_owner uuid;
  v_project_name text;
  v_actor_name text;
begin
  if old.status is not distinct from new.status then return null; end if;
  select owner_id, name_ar into v_owner, v_project_name from public.projects where id = new.project_id;
  select full_name into v_actor_name from public.profiles where id = coalesce(auth.uid(), new.submitted_by);
  p := jsonb_build_object(
    'stage_id', new.id,
    'status', new.status,
    'stage_name', new.name_ar,
    'project_name', coalesce(v_project_name, ''),
    'actor_name', coalesce(v_actor_name, ''),
    'occurred_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
  if new.status = 'submitted' then
    perform private.emit_notification(v_owner, 'stage.submitted', new.project_id, null, 'stage', new.id, p, 'submitted', 'info');
  elsif new.status = 'rework' then
    perform private.emit_notification(new.submitted_by, 'stage.rework', new.project_id, null, 'stage', new.id, p, 'rework', 'warning');
  elsif new.status = 'approved' then
    perform private.emit_notification(v_owner, 'stage.approved', new.project_id, null, 'stage', new.id, p, 'approved', 'info');
  end if;
  return null;
end;
$$;

create or replace function public.start_stage(_stage_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception 'Not allowed to start this stage' using errcode = '42501';
  end if;
  if v_stage.status not in ('pending','rework') then
    raise exception 'Only a pending or rework stage can be started (current: %)', v_stage.status using errcode = '22023';
  end if;

  update public.project_stages
    set status = 'in_progress',
        actual_start = coalesce(actual_start, current_date)
    where id = _stage_id;

  return now();
end;
$$;

create or replace function public.stage_capabilities(_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_stage public.project_stages%rowtype;
  v_manage boolean;
  v_approve boolean;
begin
  if v_actor is null then
    return jsonb_build_object('can_start', false, 'can_submit', false, 'can_approve', false);
  end if;
  select * into v_stage from public.project_stages where id = _stage_id and deleted_at is null;
  if v_stage.id is null then
    return jsonb_build_object('can_start', false, 'can_submit', false, 'can_approve', false);
  end if;
  if not private.can_access_stage(v_actor, _stage_id) then
    return jsonb_build_object('can_start', false, 'can_submit', false, 'can_approve', false);
  end if;

  v_manage := private.can_manage_stage(v_actor, _stage_id, v_stage.project_id);
  v_approve := private.can(v_actor, 'stages'::public.app_module, 'approve'::public.app_action, null, v_stage.project_id)
    and private.stage_in_scope(v_actor, _stage_id, v_stage.project_id)
    and v_stage.submitted_by is distinct from v_actor
    and not private.has_stage_role(v_actor, _stage_id, 'executor');

  return jsonb_build_object(
    'can_start', v_manage and v_stage.status in ('pending','rework'),
    'can_submit', v_manage and v_stage.status in ('in_progress','rework'),
    'can_approve', v_approve and v_stage.status = 'submitted'
  );
end;
$$;

revoke all on function public.start_stage(uuid) from public, anon;
revoke all on function public.stage_capabilities(uuid) from public, anon;
revoke all on function public.notify_stage_event() from public, anon;
grant execute on function public.start_stage(uuid) to authenticated;
grant execute on function public.stage_capabilities(uuid) to authenticated;