-- Exact location is served by a dedicated function that performs its own
-- authorization check internally, so the view can stay security_invoker.
create or replace function public.property_exact_location(_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.properties%rowtype;
begin
  if v_uid is null then
    return null;
  end if;
  -- internal authorization: the caller must both reach the property and hold
  -- the dedicated "view exact location" permission.
  if not private.can_access_property(v_uid, _property_id) then
    return null;
  end if;
  if not private.can_view_exact_location(v_uid, _property_id) then
    return null;
  end if;

  select * into v_row from public.properties
  where id = _property_id and deleted_at is null;
  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'exact_lat', v_row.exact_lat,
    'exact_lng', v_row.exact_lng,
    'exact_address', v_row.exact_address
  );
end;
$$;
revoke all on function public.property_exact_location(uuid) from public, anon;
grant execute on function public.property_exact_location(uuid) to authenticated, service_role;

create or replace function public.can_view_exact_location(_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and private.can_access_property(auth.uid(), _property_id)
     and private.can_view_exact_location(auth.uid(), _property_id);
$$;
revoke all on function public.can_view_exact_location(uuid) from public, anon;
grant execute on function public.can_view_exact_location(uuid) to authenticated, service_role;

drop view public.properties_public;

create view public.properties_public
with (security_invoker = on) as
select
  p.id, p.owner_id, p.entity_id, p.kind, p.name, p.code, p.status,
  p.city, p.district, p.land_area, p.plan_no, p.parcel_no, p.notes,
  p.approx_lat, p.approx_lng,
  (public.property_exact_location(p.id) ->> 'exact_lat')::numeric as exact_lat,
  (public.property_exact_location(p.id) ->> 'exact_lng')::numeric as exact_lng,
  public.property_exact_location(p.id) ->> 'exact_address' as exact_address,
  public.can_view_exact_location(p.id) as can_view_exact,
  public.property_completion(p.id) as completion_percent,
  p.created_at, p.updated_at
from public.properties p
where p.deleted_at is null;

grant select on public.properties_public to authenticated, service_role;