-- exact location becomes its own RLS-protected table
create table public.property_exact_locations (
  property_id uuid primary key references public.properties(id),
  exact_lat numeric(9,6),
  exact_lng numeric(9,6),
  exact_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.property_exact_locations (property_id, exact_lat, exact_lng, exact_address)
select id, exact_lat, exact_lng, exact_address
from public.properties
where exact_lat is not null or exact_lng is not null or exact_address is not null;

grant select, insert, update on public.property_exact_locations to authenticated;
grant all on public.property_exact_locations to service_role;
alter table public.property_exact_locations enable row level security;

create trigger property_exact_locations_set_updated_at before update on public.property_exact_locations
  for each row execute function public.set_updated_at();

create policy "exact_location_select" on public.property_exact_locations
  for select to authenticated
  using (private.can_view_exact_location(auth.uid(), property_id));
create policy "exact_location_insert" on public.property_exact_locations
  for insert to authenticated
  with check (private.can_manage_property(auth.uid(), property_id)
              and private.can_view_exact_location(auth.uid(), property_id));
create policy "exact_location_update" on public.property_exact_locations
  for update to authenticated
  using (private.can_manage_property(auth.uid(), property_id)
         and private.can_view_exact_location(auth.uid(), property_id))
  with check (private.can_manage_property(auth.uid(), property_id));

-- the masked view is now plain RLS: unauthorized viewers simply get no joined row
drop view public.properties_public;
drop function if exists public.property_exact_location(uuid);
drop function if exists public.can_view_exact_location(uuid);

alter table public.properties
  drop column exact_lat,
  drop column exact_lng,
  drop column exact_address;

-- restore ordinary table-level privileges now that no sensitive column remains
grant select, insert, update on public.properties to authenticated;
revoke all on public.properties from anon;
revoke all on public.property_exact_locations from anon;

create view public.properties_public
with (security_invoker = on) as
select
  p.id, p.owner_id, p.entity_id, p.kind, p.name, p.code, p.status,
  p.city, p.district, p.land_area, p.plan_no, p.parcel_no, p.notes,
  p.approx_lat, p.approx_lng,
  el.exact_lat, el.exact_lng, el.exact_address,
  (el.property_id is not null) as can_view_exact,
  public.property_completion(p.id) as completion_percent,
  p.created_at, p.updated_at
from public.properties p
left join public.property_exact_locations el on el.property_id = p.id
where p.deleted_at is null;

grant select on public.properties_public to authenticated, service_role;