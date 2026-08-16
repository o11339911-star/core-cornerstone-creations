create or replace function public.can_manage_property_self(_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then false
              else private.can_manage_property(auth.uid(), _property_id) end;
$$;

revoke all on function public.can_manage_property_self(uuid) from public, anon;
grant execute on function public.can_manage_property_self(uuid) to authenticated;