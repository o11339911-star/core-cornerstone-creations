create or replace function private.enforce_marketing_contract_license()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.entity_has_valid_license(new.marketer_entity_id, 'val') then
    raise exception 'MARKETER_LICENSE_INVALID' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_marketing_contract_license() from public, anon, authenticated;

drop trigger if exists trg_marketing_contract_license on public.marketing_contracts;
create trigger trg_marketing_contract_license
before insert or update of marketer_entity_id, status on public.marketing_contracts
for each row execute function private.enforce_marketing_contract_license();

delete from public.marketing_contracts
where marketer_entity_id = 'b2200000-0000-0000-0000-000000000003';