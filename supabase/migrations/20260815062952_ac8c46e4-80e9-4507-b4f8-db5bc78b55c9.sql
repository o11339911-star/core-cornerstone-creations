-- 1) service catalog
create table public.service_catalog (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  category text not null check (category in ('electricity','water','sewage','telecom','gas','meter_ops')),
  is_metered boolean not null default true,
  allows_unit_level boolean not null default false,
  requires_unit boolean not null default false,
  default_provider_ar text,
  default_provider_en text,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.service_catalog to authenticated;
grant all on public.service_catalog to service_role;
alter table public.service_catalog enable row level security;
create policy service_catalog_select on public.service_catalog for select to authenticated using (true);
create trigger service_catalog_set_updated_at before update on public.service_catalog
  for each row execute function public.set_updated_at();

insert into public.service_catalog(code,name_ar,name_en,category,is_metered,allows_unit_level,requires_unit,default_provider_ar,default_provider_en,is_active,order_index) values
 ('electricity_temp','كهرباء مؤقتة','Temporary electricity','electricity',true,false,false,'الشركة السعودية للكهرباء','Saudi Electricity Company',true,1),
 ('electricity_permanent','كهرباء دائمة','Permanent electricity','electricity',true,true,false,'الشركة السعودية للكهرباء','Saudi Electricity Company',true,2),
 ('water','مياه','Water','water',true,true,false,'شركة المياه الوطنية','National Water Company',true,3),
 ('sewage','صرف صحي','Sewage','sewage',false,false,false,'شركة المياه الوطنية','National Water Company',true,4),
 ('telecom','اتصالات','Telecom','telecom',false,true,false,null,null,true,5),
 ('gas','غاز','Gas','gas',true,false,false,null,null,false,6),
 ('meter_transfer','نقل عداد','Meter transfer','meter_ops',true,false,false,null,null,true,7),
 ('meter_split','فصل عداد','Meter split','meter_ops',true,true,true,null,null,true,8),
 ('meter_merge','دمج عدادات','Meter merge','meter_ops',true,false,false,null,null,true,9),
 ('unit_meter','عداد مستقل للوحدة','Independent unit meter','meter_ops',true,true,true,null,null,true,10);

-- 2) one request type per service
insert into public.request_types(code,name_ar,name_en,module,requires_stage,requires_unit,is_active,order_index)
select 'service_'||c.code,
       'طلب خدمة: '||c.name_ar,
       'Service request: '||c.name_en,
       'properties'::public.app_module,
       false,
       c.requires_unit,
       c.is_active,
       100 + c.order_index
from public.service_catalog c;

-- 3) service request details (1:1 with requests)
create table public.service_request_details (
  request_id uuid primary key references public.requests(id) on delete cascade,
  service_code text not null references public.service_catalog(code),
  provider_name text,
  external_ref_no text,
  requirements_note text,
  payment_status text not null default 'not_required' check (payment_status in ('not_required','pending','paid')),
  payment_amount numeric(14,2),
  payment_ref text,
  paid_at timestamptz,
  appointment_at timestamptz,
  meter_no text,
  account_no text,
  installed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.service_request_details to authenticated;
grant all on public.service_request_details to service_role;
alter table public.service_request_details enable row level security;
create policy service_request_details_select on public.service_request_details
  for select to authenticated
  using (private.can_access_request(auth.uid(), request_id));
create trigger service_request_details_set_updated_at before update on public.service_request_details
  for each row execute function public.set_updated_at();

-- 4) extend request statuses + transitions
alter table public.requests drop constraint requests_status_check;
alter table public.requests add constraint requests_status_check check (status = any (array[
  'draft','requirements','submitted','in_review','info_needed','awaiting_payment',
  'inspection_scheduled','installed','activated','approved','rejected','cancelled','closed']));

insert into public.request_status_transitions(from_status,to_status,actor_scope) values
 ('draft','requirements','requester'),
 ('requirements','submitted','requester'),
 ('requirements','cancelled','requester'),
 ('in_review','awaiting_payment','handler'),
 ('submitted','awaiting_payment','handler'),
 ('awaiting_payment','inspection_scheduled','handler'),
 ('awaiting_payment','info_needed','handler'),
 ('awaiting_payment','cancelled','requester'),
 ('inspection_scheduled','installed','handler'),
 ('inspection_scheduled','info_needed','handler'),
 ('installed','activated','handler'),
 ('installed','info_needed','handler'),
 ('activated','closed','either'),
 ('activated','info_needed','handler'),
 ('info_needed','awaiting_payment','handler');

-- 5) activate property_services
alter table public.property_services
  add column property_unit_id uuid references public.property_units(id) on delete cascade,
  add column service_code text references public.service_catalog(code),
  add column source_request_id uuid unique references public.requests(id) on delete set null,
  add column provider_name text,
  add column meter_no text,
  add column account_no text,
  add column installed_at timestamptz,
  add column activated_at timestamptz,
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz;

create unique index property_services_meter_unique
  on public.property_services(service_code, meter_no) where meter_no is not null;
create unique index property_services_property_service_unique
  on public.property_services(property_id, service_code) where property_unit_id is null;
create unique index property_services_unit_service_unique
  on public.property_services(property_unit_id, service_code) where property_unit_id is not null;

grant select on public.property_services to authenticated;
grant all on public.property_services to service_role;

create or replace function public.guard_property_service_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(current_setting('rakeez.service_link', true), '') <> 'on' then
    raise exception 'property_services can only be written through review_and_link_service()' using errcode = '42501';
  end if;
  return new;
end; $$;

create trigger property_services_guard
  before insert or update or delete on public.property_services
  for each row execute function public.guard_property_service_write();