-- ============================================================
-- 1) Data remediation: no live access before acceptance
-- ============================================================
do $migrate$
declare
  v_party public.project_parties%rowtype;
  v_snapshot jsonb;
  v_anomaly jsonb;
  v_entity uuid;
  v_revoked int;
begin
  for v_party in
    select * from public.project_parties
    where status is distinct from 'accepted'
    order by created_at
    for update
  loop
    -- Build a snapshot strictly from the grants that are actually linked to this party
    select coalesce(jsonb_agg(distinct jsonb_build_object('module', g.module::text, 'action', g.action::text)), '[]'::jsonb),
           coalesce(jsonb_agg(distinct jsonb_build_object(
             'module', g.module::text, 'action', g.action::text,
             'reason', case
               when g.effect <> 'allow' then 'non_allow_effect'
               when g.scope_type <> 'project' then 'unexpected_scope_type'
               when g.scope_project_id is distinct from v_party.project_id then 'project_mismatch'
               when g.subject_entity_id is distinct from v_party.party_entity_id then 'entity_mismatch'
               when g.subject_user_id is not null then 'user_scoped_grant'
             end))
             filter (where g.effect <> 'allow'
                        or g.scope_type <> 'project'
                        or g.scope_project_id is distinct from v_party.project_id
                        or g.subject_entity_id is distinct from v_party.party_entity_id
                        or g.subject_user_id is not null), '[]'::jsonb)
      into v_snapshot, v_anomaly
      from public.permission_grants g
      join public.project_party_permissions x on x.grant_id = g.id
     where x.party_id = v_party.id
       and g.revoked_at is null;

    -- Keep only structurally sound entries in the snapshot; never widen anything
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_snapshot
      from jsonb_array_elements(v_snapshot) e
     where not (v_anomaly @> jsonb_build_array(jsonb_build_object(
             'module', e ->> 'module', 'action', e ->> 'action')));

    if jsonb_array_length(v_snapshot) > 0
       and jsonb_array_length(coalesce(v_party.permissions_snapshot, '[]'::jsonb)) = 0 then
      update public.project_parties
         set permissions_snapshot = v_snapshot
       where id = v_party.id;  -- dates, scope, reference and party data untouched
    end if;

    -- Revoke every live grant attached to a non-accepted invitation
    with revoked as (
      update public.permission_grants g
         set revoked_at = now()
       where g.revoked_at is null
         and g.id in (select grant_id from public.project_party_permissions where party_id = v_party.id)
      returning 1
    )
    select count(*) into v_revoked from revoked;

    if v_revoked > 0 or jsonb_array_length(v_anomaly) > 0 then
      select p.entity_id into v_entity from public.projects p where p.id = v_party.project_id;
      insert into public.permission_audit_log
        (actor_user_id, target_entity_id, target_project_id, object_type, object_id, action, new_value)
      values
        (v_party.invited_by, v_entity, v_party.project_id, 'project_party', v_party.id, 'update',
         jsonb_build_object(
           'migration', 'invited_grants_revocation_2026_08_17',
           'party_status', v_party.status,
           'snapshot_saved', jsonb_array_length(v_snapshot),
           'grants_revoked', v_revoked,
           'anomalies', v_anomaly,
           'needs_review', jsonb_array_length(v_anomaly) > 0));
    end if;
  end loop;
end
$migrate$;

-- ============================================================
-- 2) Future path: idempotent acceptance, revocation on refusal
-- ============================================================
create or replace function public.respond_to_project_party(_party_id uuid, _accept boolean)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_party public.project_parties%rowtype;
  v_project public.projects%rowtype;
  v_perm jsonb;
  v_grant_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select * into v_party from public.project_parties where id = _party_id for update;
  if v_party.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;
  if v_party.party_entity_id is null
     or not (private.has_role(v_actor, v_party.party_entity_id, 'owner')
          or private.has_role(v_actor, v_party.party_entity_id, 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Idempotency: repeating the same response is a no-op, not a duplicate grant run
  if v_party.status = 'accepted' and _accept then return 'accepted'; end if;
  if v_party.status = 'rejected' and not _accept then return 'rejected'; end if;
  if v_party.status <> 'invited' then raise exception 'INVITATION_NOT_PENDING' using errcode = '22023'; end if;

  select * into v_project from public.projects where id = v_party.project_id;

  update public.project_parties
     set status = case when _accept then 'accepted' else 'rejected' end,
         responded_by = v_actor, responded_at = now()
   where id = _party_id;

  if _accept then
    perform set_config('app.party_invite_apply', 'on', true);
    for v_perm in
      select distinct e from jsonb_array_elements(coalesce(v_party.permissions_snapshot, '[]'::jsonb)) e
    loop
      -- never duplicate an already-live grant for the same module/action
      if not exists (
        select 1 from public.permission_grants g
        join public.project_party_permissions x on x.grant_id = g.id and x.party_id = _party_id
        where g.revoked_at is null
          and g.module = (v_perm ->> 'module')::public.app_module
          and g.action = (v_perm ->> 'action')::public.app_action
      ) then
        insert into public.permission_grants
          (subject_entity_id, scope_type, scope_project_id, module, action, effect, granted_by)
        values
          (v_party.party_entity_id, 'project', v_party.project_id,
           (v_perm ->> 'module')::public.app_module, (v_perm ->> 'action')::public.app_action,
           'allow', v_actor)
        returning id into v_grant_id;

        insert into public.project_party_permissions(party_id, grant_id) values (_party_id, v_grant_id);
      end if;
    end loop;
    perform set_config('app.party_invite_apply', 'off', true);
  else
    -- refusal must never leave live access behind
    update public.permission_grants g
       set revoked_at = now()
     where g.revoked_at is null
       and g.id in (select grant_id from public.project_party_permissions where party_id = _party_id);
  end if;

  insert into public.permission_audit_log
    (actor_user_id, target_entity_id, target_project_id, object_type, object_id, action, new_value)
  values (v_actor, v_project.entity_id, v_party.project_id, 'project_party', _party_id, 'update',
          jsonb_build_object('reference', v_party.party_reference,
                             'response', case when _accept then 'accepted' else 'rejected' end,
                             'invited_by', v_party.invited_by,
                             'permissions', coalesce(v_party.permissions_snapshot, '[]'::jsonb)));

  return case when _accept then 'accepted' else 'rejected' end;
end $function$;

revoke all on function public.respond_to_project_party(uuid, boolean) from public, anon;
grant execute on function public.respond_to_project_party(uuid, boolean) to authenticated;