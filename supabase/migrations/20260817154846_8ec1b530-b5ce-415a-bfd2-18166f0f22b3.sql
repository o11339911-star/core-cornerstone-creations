alter table public.assignment_visibility_audience
  add column if not exists project_party_id uuid references public.project_parties(id) on delete cascade;

create unique index if not exists assignment_visibility_audience_party_uidx
  on public.assignment_visibility_audience (assignment_id, project_party_id)
  where project_party_id is not null;

-- eligible = accepted and not ended
create or replace function private.is_active_project_party(_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_parties pp
    where pp.id = _party_id
      and pp.status = 'accepted'
      and (pp.ends_on is null or pp.ends_on >= current_date)
  );
$$;

create or replace function private.is_my_project_party(_user_id uuid, _party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_parties pp
    where pp.id = _party_id
      and pp.status = 'accepted'
      and (
        pp.matched_user_id = _user_id
        or (pp.party_entity_id is not null and private.is_entity_member(_user_id, pp.party_entity_id))
      )
  );
$$;

revoke execute on function private.is_active_project_party(uuid) from public;
revoke execute on function private.is_my_project_party(uuid, uuid) from public;
grant execute on function private.is_active_project_party(uuid) to authenticated;
grant execute on function private.is_my_project_party(uuid, uuid) to authenticated;

-- read enforcement: limited => selected parties only
create or replace function private.can_see_assignee(_viewer uuid, _assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_assignments a
    where a.id = _assignment_id
      and (
        a.user_id = _viewer
        or (a.visibility = 'project_wide' and (
              private.can_access_project(_viewer, a.project_id)
              or exists (select 1 from public.project_parties pp
                         where pp.project_id = a.project_id
                           and private.is_my_project_party(_viewer, pp.id))
           ))
        or (a.visibility = 'internal' and a.entity_id is not null
            and (
              private.has_role(_viewer, a.entity_id, 'owner')
              or private.has_role(_viewer, a.entity_id, 'admin')
              or private.has_role(_viewer, a.entity_id, 'manager')
            ))
        or (a.visibility = 'limited' and exists (
              select 1 from public.assignment_visibility_audience v
              where v.assignment_id = a.id
                and (
                  v.audience_user_id = _viewer
                  or (v.audience_entity_id is not null
                      and private.is_entity_member(_viewer, v.audience_entity_id))
                  or (v.project_party_id is not null
                      and private.is_my_project_party(_viewer, v.project_party_id))
                )
            ))
        or exists (select 1 from public.projects p
                   where p.id = a.project_id and p.owner_id = _viewer)
      )
  );
$$;

-- RLS: managers write/read all; a party reads only its own links
drop policy if exists audience_select_scope on public.assignment_visibility_audience;
create policy audience_select_scope on public.assignment_visibility_audience
for select to authenticated
using (
  exists (
    select 1 from public.project_assignments a
    where a.id = assignment_visibility_audience.assignment_id
      and (
        a.user_id = (select auth.uid())
        or private.can((select auth.uid()), 'projects'::app_module, 'update'::app_action, null::uuid, a.project_id)
        or (
          assignment_visibility_audience.project_party_id is not null
          and private.is_my_project_party((select auth.uid()), assignment_visibility_audience.project_party_id)
        )
        or (
          assignment_visibility_audience.audience_user_id = (select auth.uid())
        )
        or (
          assignment_visibility_audience.audience_entity_id is not null
          and private.is_entity_member((select auth.uid()), assignment_visibility_audience.audience_entity_id)
        )
      )
  )
);

drop policy if exists audience_delete_scope on public.assignment_visibility_audience;
create policy audience_delete_scope on public.assignment_visibility_audience
for delete to authenticated
using (
  exists (
    select 1 from public.project_assignments a
    where a.id = assignment_visibility_audience.assignment_id
      and private.can((select auth.uid()), 'projects'::app_module, 'update'::app_action, null::uuid, a.project_id)
  )
);

revoke insert, update, delete, truncate on public.assignment_visibility_audience from anon;
revoke select on public.assignment_visibility_audience from anon;

-- eligible parties for the picker: name / role / kind only, no identity data
create or replace function public.list_assignable_project_parties(_project_id uuid)
returns table (id uuid, display_name text, party_role public.project_party_role, party_kind text)
language sql
stable
security definer
set search_path = public
as $$
  select pp.id,
         coalesce(nullif(pp.party_display_name, ''), 'طرف بدون اسم') as display_name,
         pp.party_role,
         pp.party_kind::text
  from public.project_parties pp
  where pp.project_id = _project_id
    and pp.status = 'accepted'
    and (pp.ends_on is null or pp.ends_on >= current_date)
    and private.can((select auth.uid()), 'projects'::public.app_module, 'update'::public.app_action, null, _project_id)
  order by display_name;
$$;

-- atomic audience write
create or replace function public.set_assignment_party_audience(_assignment_id uuid, _party_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
  v_visibility public.visibility_level;
  v_id uuid;
  v_count integer := 0;
begin
  select a.project_id, a.visibility into v_project, v_visibility
  from public.project_assignments a where a.id = _assignment_id;

  if v_project is null then
    raise exception 'ASSIGNMENT_NOT_FOUND';
  end if;

  if not private.can((select auth.uid()), 'projects'::public.app_module, 'update'::public.app_action, null, v_project) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from public.assignment_visibility_audience v
  where v.assignment_id = _assignment_id and v.project_party_id is not null;

  if v_visibility <> 'limited' then
    return 0;
  end if;

  if _party_ids is null or array_length(_party_ids, 1) is null then
    raise exception 'AUDIENCE_REQUIRED';
  end if;

  foreach v_id in array _party_ids loop
    if not exists (
      select 1 from public.project_parties pp
      where pp.id = v_id
        and pp.project_id = v_project
        and pp.status = 'accepted'
        and (pp.ends_on is null or pp.ends_on >= current_date)
    ) then
      raise exception 'PARTY_NOT_ELIGIBLE';
    end if;

    insert into public.assignment_visibility_audience (assignment_id, project_party_id)
    values (_assignment_id, v_id)
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.list_assignable_project_parties(uuid) from public;
revoke execute on function public.set_assignment_party_audience(uuid, uuid[]) from public;
grant execute on function public.list_assignable_project_parties(uuid) to authenticated;
grant execute on function public.set_assignment_party_audience(uuid, uuid[]) to authenticated;