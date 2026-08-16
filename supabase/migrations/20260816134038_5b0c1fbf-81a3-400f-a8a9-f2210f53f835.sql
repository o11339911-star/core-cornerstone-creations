create or replace function public.enforce_owner_share_total()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total numeric;
begin
  select coalesce(sum(share_percent), 0) into v_total
  from public.property_owners
  where property_id = new.property_id
    and ends_on is null;

  if v_total > 100 then
    raise exception 'Total ownership share for this property would be %%%, which exceeds 100%%', v_total
      using errcode = '23514';
  end if;
  return null;
end;
$$;