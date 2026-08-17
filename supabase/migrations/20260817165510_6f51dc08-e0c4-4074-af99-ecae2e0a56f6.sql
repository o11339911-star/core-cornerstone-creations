create or replace function private.next_archive_reference()
returns text
language plpgsql
volatile
security definer
set search_path = private, public
as $$
declare candidate text; tries int := 0;
begin
  loop
    tries := tries + 1;
    candidate := private.gen_archive_reference();
    exit when not exists (select 1 from public.archive_items where archive_reference = candidate);
    if tries > 20 then raise exception 'REFERENCE_GENERATION_FAILED'; end if;
  end loop;
  return candidate;
end $$;

revoke execute on function private.next_archive_reference() from public;
grant execute on function private.next_archive_reference() to authenticated, service_role;

alter table public.archive_items
  alter column archive_reference set default private.next_archive_reference();