-- Column-level privileges: the exact location columns are never readable
-- straight off the base table; they are only reachable through the masked view.
revoke select on public.properties from authenticated;
grant select (
  id, owner_id, entity_id, kind, name, code, status, city, district,
  land_area, plan_no, parcel_no, notes, approx_lat, approx_lng,
  created_by, created_at, updated_at, deleted_at
) on public.properties to authenticated;

-- The view must therefore stop being security_invoker (the invoker no longer
-- holds column privileges); it re-implements the row filter explicitly.
drop view public.properties_public;

create view public.properties_public
with (security_invoker = off) as
select
  p.id, p.owner_id, p.entity_id, p.kind, p.name, p.code, p.status,
  p.city, p.district, p.land_area, p.plan_no, p.parcel_no, p.notes,
  p.approx_lat, p.approx_lng,
  case when private.can_view_exact_location(auth.uid(), p.id) then p.exact_lat end as exact_lat,
  case when private.can_view_exact_location(auth.uid(), p.id) then p.exact_lng end as exact_lng,
  case when private.can_view_exact_location(auth.uid(), p.id) then p.exact_address end as exact_address,
  private.can_view_exact_location(auth.uid(), p.id) as can_view_exact,
  public.property_completion(p.id) as completion_percent,
  p.created_at, p.updated_at
from public.properties p
where p.deleted_at is null
  and private.can_access_property(auth.uid(), p.id);

grant select on public.properties_public to authenticated, service_role;