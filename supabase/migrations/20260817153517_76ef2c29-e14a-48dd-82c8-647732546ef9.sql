-- ============ 1) project_parties: identifier-based invitations ============
alter table public.project_parties
  alter column party_entity_id drop not null,
  add column if not exists party_kind text not null default 'entity',
  add column if not exists identifier_kind text,
  add column if not exists identifier_fingerprint text,
  add column if not exists identifier_last4 text,
  add column if not exists cr_number text,
  add column if not exists party_display_name text,
  add column if not exists matched_user_id uuid;

alter table public.project_parties
  drop constraint if exists project_parties_party_kind_chk,
  add constraint project_parties_party_kind_chk check (party_kind in ('person','entity'));

alter table public.project_parties
  drop constraint if exists project_parties_identifier_kind_chk,
  add constraint project_parties_identifier_kind_chk
    check (identifier_kind is null or identifier_kind in ('national_id','cr_number'));

alter table public.project_parties
  drop constraint if exists project_parties_subject_chk,
  add constraint project_parties_subject_chk
    check (party_entity_id is not null or identifier_fingerprint is not null);

create unique index if not exists project_parties_project_identifier_uq
  on public.project_parties (project_id, identifier_fingerprint)
  where identifier_fingerprint is not null and status in ('invited','accepted');

-- ============ 2) project_assignments: pending external members ============
alter table public.project_assignments
  alter column user_id drop not null,
  add column if not exists identifier_fingerprint text,
  add column if not exists identifier_last4 text,
  add column if not exists external_display_name text,
  add column if not exists matched_user_id uuid;

alter table public.project_assignments
  drop constraint if exists project_assignments_status_chk,
  add constraint project_assignments_status_chk
    check (status in ('active','ended','transferred','pending'));

alter table public.project_assignments
  drop constraint if exists project_assignments_subject_chk,
  add constraint project_assignments_subject_chk
    check (user_id is not null or identifier_fingerprint is not null);

create unique index if not exists project_assignments_project_identifier_uq
  on public.project_assignments (project_id, identifier_fingerprint)
  where identifier_fingerprint is not null and deleted_at is null;

create or replace view public.project_assignments_public as
 select id,
    project_id,
    stage_id,
    entity_id,
    job_title_ar,
    job_title_en,
    starts_on,
    ends_on,
    status,
    visibility,
    case when private.can_see_assignee((select auth.uid()), id) then user_id else null::uuid end as user_id,
    private.assignee_display((select auth.uid()), id) as display_name,
    private.can_see_assignee((select auth.uid()), id) as is_identified,
    (user_id is null) as is_external,
    external_display_name,
    case when private.can_see_assignee((select auth.uid()), id) then identifier_last4 else null::text end as identifier_last4
   from public.project_assignments a
  where deleted_at is null;

-- ============ 3) RPC: invite a project party by identifier ============
create or replace function public.invite_project_party_identified(
  _project_id uuid,
  _party_kind text,
  _identifier_kind text,
  _identifier_fingerprint text,
  _identifier_last4 text,
  _cr_number text,
  _matched_entity_id uuid,
  _matched_user_id uuid,
  _display_name text,
  _party_role public.project_party_role,
  _scope_text_ar text default null,
  _ends_on date default null,
  _stage_ids uuid[] default '{}'::uuid[],
  _permissions jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.projects%rowtype;
  v_party_id uuid;
  v_grant_id uuid;
  v_perm jsonb;
  v_stage uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if _party_kind not in ('person','entity') then raise exception 'INVALID_PARTY_KIND' using errcode = '22023'; end if;
  if _identifier_fingerprint is null or length(_identifier_fingerprint) < 16 then
    raise exception 'IDENTIFIER_REQUIRED' using errcode = '22023';
  end if;

  select * into v_project from public.projects where id = _project_id and deleted_at is null;
  if v_project.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;

  if v_project.owner_id <> v_actor
     and not private.can(v_actor, 'members'::public.app_module, 'manage_members'::public.app_action, v_project.entity_id, _project_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if _matched_entity_id is not null and v_project.entity_id = _matched_entity_id then
    raise exception 'OWNER_ENTITY_NOT_PARTY' using errcode = '22023';
  end if;

  if exists (select 1 from public.project_parties pp
             where pp.project_id = _project_id
               and pp.identifier_fingerprint = _identifier_fingerprint
               and pp.status in ('invited','accepted')) then
    raise exception 'DUPLICATE_PARTY' using errcode = '23505';
  end if;

  insert into public.project_parties
    (project_id, party_entity_id, party_role, scope_text_ar, starts_on, ends_on, status, invited_by,
     party_kind, identifier_kind, identifier_fingerprint, identifier_last4, cr_number,
     party_display_name, matched_user_id)
  values
    (_project_id, _matched_entity_id, _party_role, nullif(btrim(coalesce(_scope_text_ar,'')),''),
     current_date, _ends_on, 'invited', v_actor,
     _party_kind, _identifier_kind, _identifier_fingerprint, _identifier_last4,
     nullif(btrim(coalesce(_cr_number,'')),''), nullif(btrim(coalesce(_display_name,'')),''), _matched_user_id)
  returning id into v_party_id;

  foreach v_stage in array coalesce(_stage_ids, '{}')
  loop
    if not exists (select 1 from public.project_stages s
                   where s.id = v_stage and s.project_id = _project_id and s.deleted_at is null) then
      raise exception 'STAGE_NOT_IN_PROJECT' using errcode = '22023';
    end if;
    insert into public.project_party_stages(party_id, stage_id) values (v_party_id, v_stage)
    on conflict do nothing;
  end loop;

  -- الصلاحيات لا تُنشأ إلا لمنشأة مطابقة فعليًا؛ الدعوة المعلّقة بلا صلاحيات.
  if _matched_entity_id is not null then
    for v_perm in select * from jsonb_array_elements(coalesce(_permissions, '[]'::jsonb))
    loop
      insert into public.permission_grants
        (subject_entity_id, scope_type, scope_project_id, module, action, effect, granted_by)
      values
        (_matched_entity_id, 'project', _project_id,
         (v_perm ->> 'module')::public.app_module,
         (v_perm ->> 'action')::public.app_action,
         'allow', v_actor)
      returning id into v_grant_id;

      insert into public.project_party_permissions(party_id, grant_id) values (v_party_id, v_grant_id);
    end loop;
  end if;

  return v_party_id;
end;
$$;

revoke execute on function public.invite_project_party_identified(uuid,text,text,text,text,text,uuid,uuid,text,public.project_party_role,text,date,uuid[],jsonb) from public, anon;
grant execute on function public.invite_project_party_identified(uuid,text,text,text,text,text,uuid,uuid,text,public.project_party_role,text,date,uuid[],jsonb) to authenticated;

-- ============ 4) RPC: pending external member assignment ============
create or replace function public.create_external_project_assignment(
  _project_id uuid,
  _identifier_fingerprint text,
  _identifier_last4 text,
  _display_name text,
  _job_title_ar text,
  _job_title_en text,
  _matched_user_id uuid default null,
  _stage_id uuid default null,
  _starts_on date default null,
  _ends_on date default null,
  _visibility text default 'internal'
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := auth.uid();
  v_entity uuid;
  v_id uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if _identifier_fingerprint is null or length(_identifier_fingerprint) < 16 then
    raise exception 'IDENTIFIER_REQUIRED' using errcode = '22023';
  end if;

  select p.entity_id into v_entity from public.projects p where p.id = _project_id and p.deleted_at is null;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;

  if not private.can(v_actor, 'projects'::public.app_module, 'update'::public.app_action, v_entity, _project_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if _visibility not in ('internal','limited','project_wide') then
    raise exception 'INVALID_VISIBILITY' using errcode = '22023';
  end if;

  if _stage_id is not null and not exists (
    select 1 from public.project_stages s where s.id = _stage_id and s.project_id = _project_id and s.deleted_at is null
  ) then
    raise exception 'STAGE_NOT_IN_PROJECT' using errcode = '22023';
  end if;

  if exists (select 1 from public.project_assignments a
             where a.project_id = _project_id
               and a.identifier_fingerprint = _identifier_fingerprint
               and a.deleted_at is null) then
    raise exception 'DUPLICATE_ASSIGNMENT' using errcode = '23505';
  end if;

  insert into public.project_assignments
    (project_id, stage_id, user_id, entity_id, job_title_ar, job_title_en,
     starts_on, ends_on, status, visibility, created_by,
     identifier_fingerprint, identifier_last4, external_display_name, matched_user_id)
  values
    (_project_id, _stage_id, null, null,
     btrim(coalesce(nullif(btrim(coalesce(_job_title_ar,'')),''), 'عضو خارجي')),
     btrim(coalesce(nullif(btrim(coalesce(_job_title_en,'')),''), 'External member')),
     coalesce(_starts_on, current_date), _ends_on, 'pending',
     _visibility::public.visibility_level, v_actor,
     _identifier_fingerprint, _identifier_last4,
     nullif(btrim(coalesce(_display_name,'')),''), _matched_user_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.create_external_project_assignment(uuid,text,text,text,text,text,uuid,uuid,date,date,text) from public, anon;
grant execute on function public.create_external_project_assignment(uuid,text,text,text,text,text,uuid,uuid,date,date,text) to authenticated;