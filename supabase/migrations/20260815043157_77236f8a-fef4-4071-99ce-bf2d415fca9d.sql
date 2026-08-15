
create or replace function private.can_access_contract_ctx(_user_id uuid, _contract_id uuid, _project_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select _user_id is not null
    and private.can(_user_id, 'contracts'::public.app_module, 'view'::public.app_action, null, _project_id)
    and (
      private.is_project_insider(_user_id, _project_id)
      or exists (
        select 1
        from public.contract_parties cp
        left join public.project_parties pp on pp.id = cp.project_party_id
        where cp.contract_id = _contract_id
          and (
            cp.user_id = _user_id
            or (cp.entity_id is not null and private.is_entity_member(_user_id, cp.entity_id))
            or (
              pp.id is not null
              and pp.status = 'accepted'
              and (pp.ends_on is null or pp.ends_on >= current_date)
              and private.is_entity_member(_user_id, pp.party_entity_id)
            )
          )
      )
    );
$$;

revoke all on function private.can_access_contract_ctx(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_access_contract_ctx(uuid, uuid, uuid) to authenticated;

drop policy contracts_select on public.contracts;
create policy contracts_select on public.contracts
  for select to authenticated
  using (deleted_at is null and private.can_access_contract_ctx(auth.uid(), id, project_id));
