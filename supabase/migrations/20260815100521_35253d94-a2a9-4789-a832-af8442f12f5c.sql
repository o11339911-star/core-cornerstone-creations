create or replace function public.enforce_ledger_balance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_entry uuid;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count int := 0;
begin
  if tg_table_name = 'ledger_entries' then
    v_entry := new.id;
  else
    v_entry := new.entry_id;
  end if;

  select coalesce(sum(case when side = 'debit' then amount else 0 end), 0),
         coalesce(sum(case when side = 'credit' then amount else 0 end), 0),
         count(*)
    into v_debit, v_credit, v_count
  from public.ledger_lines where entry_id = v_entry;

  if v_count < 2 then
    raise exception 'A ledger entry needs at least two lines (found %)', v_count using errcode = '22023';
  end if;
  if v_debit <> v_credit then
    raise exception 'Unbalanced ledger entry: debit % <> credit %', v_debit, v_credit using errcode = '22023';
  end if;
  return null;
end; $$;

revoke all on function public.enforce_ledger_balance() from public, anon, authenticated;