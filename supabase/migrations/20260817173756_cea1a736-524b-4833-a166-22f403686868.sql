alter table public.project_parties
  add column if not exists party_reference text,
  add column if not exists permissions_snapshot jsonb not null default '[]'::jsonb;

create or replace function private.gen_party_reference()
returns text language plpgsql security definer set search_path to '' as $$
declare v text; i int;
begin
  for i in 1..30 loop
    v := 'INV-' ||
         lpad((floor(random()*10000))::int::text, 4, '0') || '-' ||
         lpad((floor(random()*10000))::int::text, 4, '0') || '-' ||
         lpad((floor(random()*10000))::int::text, 4, '0');
    if not exists (select 1 from public.project_parties pp where pp.party_reference = v) then
      return v;
    end if;
  end loop;
  raise exception 'REFERENCE_GENERATION_FAILED';
end $$;

update public.project_parties set party_reference = private.gen_party_reference()
 where party_reference is null;

create unique index if not exists project_parties_reference_uk on public.project_parties(party_reference);

create or replace function private.project_party_reference_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    new.party_reference := private.gen_party_reference();
  else
    new.party_reference := old.party_reference;
  end if;
  return new;
end $$;

drop trigger if exists trg_project_party_reference on public.project_parties;
create trigger trg_project_party_reference
  before insert or update on public.project_parties
  for each row execute function private.project_party_reference_guard();

create or replace function private.has_non_ascii_digits(_t text)
returns boolean language sql immutable set search_path to '' as $$
  select coalesce(_t ~ '[\u0660-\u0669\u06F0-\u06F9]', false)
$$;

drop function if exists public.invite_project_party_identified(uuid, text, text, text, text, text, uuid, uuid, text, public.project_party_role, text, date, uuid[], jsonb);

create function public.invite_project_party_identified(
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
  _scope_text_ar text,
  _ends_on date,
  _stage_ids uuid[],
  _permissions jsonb
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  v_actor uuid := auth.uid();
  v_project public.projects%rowtype;
  v_party_id uuid;
  v_perm jsonb;
  v_stage uuid;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_ref text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if _party_kind not in ('person','entity') then raise exception 'INVALID_PARTY_KIND' using errcode = '22023'; end if;
  if _identifier_fingerprint is null or length(_identifier_fingerprint) < 16 then
    raise exception 'IDENTIFIER_REQUIRED' using errcode = '22023';
  end if;
  if private.has_non_ascii_digits(_cr_number) or private.has_non_ascii_digits(_display_name)
     or private.has_non_ascii_digits(_identifier_last4) or private.has_non_ascii_digits(_scope_text_ar) then
    raise exception 'NON_ASCII_DIGITS' using errcode = '22023';
  end if;

  if _ends_on is null then raise exception 'END_DATE_REQUIRED' using errcode = '22023'; end if;
  if _ends_on <= v_today then raise exception 'END_DATE_MUST_BE_FUTURE' using errcode = '22023'; end if;

  if _stage_ids is null or array_length(_stage_ids, 1) is null then
    raise exception 'STAGES_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(coalesce(_permissions, '[]'::jsonb)), 0) = 0 then
    raise exception 'PERMISSIONS_REQUIRED' using errcode = '22023';
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

  foreach v_stage in array _stage_ids loop
    if not exists (select 1 from public.project_stages s
                   where s.id = v_stage and s.project_id = _project_id and s.deleted_at is null) then
      raise exception 'STAGE_NOT_IN_PROJECT' using errcode = '22023';
    end if;
  end loop;

  for v_perm in select * from jsonb_array_elements(_permissions) loop
    if (v_perm ->> 'module') is null or (v_perm ->> 'action') is null then
      raise exception 'PERMISSIONS_REQUIRED' using errcode = '22023';
    end if;
    if v_project.owner_id <> v_actor
       and not private.can(v_actor,
                           (v_perm ->> 'module')::public.app_module,
                           (v_perm ->> 'action')::public.app_action,
                           v_project.entity_id, _project_id) then
      raise exception 'PERMISSION_NOT_DELEGATABLE' using errcode = '42501';
    end if;
  end loop;

  insert into public.project_parties
    (project_id, party_entity_id, party_role, scope_text_ar, starts_on, ends_on, status, invited_by,
     party_kind, identifier_kind, identifier_fingerprint, identifier_last4, cr_number,
     party_display_name, matched_user_id, permissions_snapshot)
  values
    (_project_id, _matched_entity_id, _party_role, nullif(btrim(coalesce(_scope_text_ar,'')),''),
     current_date, _ends_on, 'invited', v_actor,
     _party_kind, _identifier_kind, _identifier_fingerprint, _identifier_last4,
     nullif(btrim(coalesce(_cr_number,'')),''), nullif(btrim(coalesce(_display_name,'')),''),
     _matched_user_id, _permissions)
  returning id, party_reference into v_party_id, v_ref;

  foreach v_stage in array _stage_ids loop
    insert into public.project_party_stages(party_id, stage_id) values (v_party_id, v_stage)
    on conflict do nothing;
  end loop;

  insert into public.permission_audit_log(actor_id, entity_id, project_id, object_type, object_id, action, details)
  values (v_actor, v_project.entity_id, _project_id, 'project_party', v_party_id, 'insert',
          jsonb_build_object('reference', v_ref,
                             'stages', to_jsonb(_stage_ids),
                             'permissions', _permissions,
                             'ends_on', _ends_on));

  return v_party_id;
end $$;

create or replace function public.respond_to_project_party(_party_id uuid, _accept boolean)
returns text language plpgsql security definer set search_path to '' as $$
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
  if v_party.status <> 'invited' then raise exception 'INVITATION_NOT_PENDING' using errcode = '22023'; end if;
  if v_party.party_entity_id is null
     or not (private.has_role(v_actor, v_party.party_entity_id, 'owner')
          or private.has_role(v_actor, v_party.party_entity_id, 'admin')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_project from public.projects where id = v_party.project_id;

  update public.project_parties
     set status = case when _accept then 'accepted' else 'rejected' end,
         responded_by = v_actor,
         responded_at = now()
   where id = _party_id;

  if _accept then
    for v_perm in select * from jsonb_array_elements(coalesce(v_party.permissions_snapshot, '[]'::jsonb)) loop
      insert into public.permission_grants
        (subject_entity_id, scope_type, scope_project_id, module, action, effect, granted_by)
      values
        (v_party.party_entity_id, 'project', v_party.project_id,
         (v_perm ->> 'module')::public.app_module,
         (v_perm ->> 'action')::public.app_action,
         'allow', v_party.invited_by)
      returning id into v_grant_id;

      insert into public.project_party_permissions(party_id, grant_id) values (_party_id, v_grant_id);
    end loop;
  end if;

  insert into public.permission_audit_log(actor_id, entity_id, project_id, object_type, object_id, action, details)
  values (v_actor, v_project.entity_id, v_party.project_id, 'project_party', _party_id, 'update',
          jsonb_build_object('reference', v_party.party_reference,
                             'response', case when _accept then 'accepted' else 'rejected' end,
                             'permissions', coalesce(v_party.permissions_snapshot, '[]'::jsonb)));

  return case when _accept then 'accepted' else 'rejected' end;
end $$;

revoke all on function private.gen_party_reference() from public, anon, authenticated;
revoke all on function private.project_party_reference_guard() from public, anon, authenticated;
revoke all on function private.has_non_ascii_digits(text) from public, anon;
grant execute on function private.has_non_ascii_digits(text) to authenticated;
revoke all on function public.invite_project_party_identified(uuid, text, text, text, text, text, uuid, uuid, text, public.project_party_role, text, date, uuid[], jsonb) from public, anon;
grant execute on function public.invite_project_party_identified(uuid, text, text, text, text, text, uuid, uuid, text, public.project_party_role, text, date, uuid[], jsonb) to authenticated;
revoke all on function public.respond_to_project_party(uuid, boolean) from public, anon;
grant execute on function public.respond_to_project_party(uuid, boolean) to authenticated;