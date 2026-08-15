-- =========================================================
-- Phase 24 — Marketplace, appointments, deferred commerce
-- =========================================================

-- 1) role_permissions for the new modules
insert into public.role_permissions(role, module, action)
select r.role, m.module, a.action
from (values ('owner'::public.app_role),('admin'::public.app_role)) r(role),
     (values ('marketplace'::public.app_module),('commerce'::public.app_module)) m(module),
     (values ('view'::public.app_action),('create'::public.app_action),('update'::public.app_action),
             ('soft_delete'::public.app_action),('approve'::public.app_action),
             ('export'::public.app_action),('share'::public.app_action)) a(action)
on conflict do nothing;

insert into public.role_permissions(role, module, action)
select 'manager'::public.app_role, m.module, a.action
from (values ('marketplace'::public.app_module),('commerce'::public.app_module)) m(module),
     (values ('view'::public.app_action),('create'::public.app_action),('update'::public.app_action)) a(action)
on conflict do nothing;

insert into public.role_permissions(role, module, action)
select r.role, m.module, 'view'::public.app_action
from (values ('member'::public.app_role),('viewer'::public.app_role)) r(role),
     (values ('marketplace'::public.app_module),('commerce'::public.app_module)) m(module)
on conflict do nothing;

-- 2) helper guards -----------------------------------------------------------
create or replace function private.is_active_member(_user_id uuid, _entity_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entity_memberships em
    where em.user_id = _user_id and em.entity_id = _entity_id
      and em.status = 'active'
      and (em.expires_at is null or em.expires_at > now())
  );
$$;

create or replace function private.require_member(_entity_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_active_member(auth.uid(), _entity_id) then
    raise exception 'NOT_A_MEMBER_OF_ENTITY';
  end if;
end;
$$;

-- 3) subscription state ------------------------------------------------------
create table public.entity_subscription_state (
  entity_id uuid primary key references public.entities(id) on delete cascade,
  plan_code text not null default 'free',
  state text not null default 'active' check (state in ('active','grace','read_only','archived')),
  grace_until timestamptz,
  read_only_since timestamptz,
  policy_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.entity_subscription_state to authenticated;
grant all on public.entity_subscription_state to service_role;
alter table public.entity_subscription_state enable row level security;
create policy ess_select on public.entity_subscription_state for select to authenticated
  using (private.is_active_member(auth.uid(), entity_id));

create or replace function private.entity_is_read_only(_entity_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select s.state in ('read_only','archived')
    from public.entity_subscription_state s where s.entity_id = _entity_id
  ), false);
$$;

create or replace function private.require_writable(_entity_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if private.entity_is_read_only(_entity_id) then
    raise exception 'ENTITY_READ_ONLY';
  end if;
end;
$$;

-- 4) entitlements ------------------------------------------------------------
create table public.core_free_actions (
  code text primary key,
  description_ar text not null,
  created_at timestamptz not null default now()
);
grant select on public.core_free_actions to authenticated, anon;
grant all on public.core_free_actions to service_role;
alter table public.core_free_actions enable row level security;
create policy cfa_select on public.core_free_actions for select to authenticated, anon using (true);

insert into public.core_free_actions(code, description_ar) values
  ('invitation.accept','قبول دعوة مشروع مجاني دائمًا'),
  ('project.basic_view','الاطلاع الأساسي على المشروع مجاني دائمًا')
on conflict do nothing;

create table public.entitlements (
  code text primary key,
  description_ar text not null,
  description_en text not null,
  is_commercial boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.entitlements to authenticated;
grant all on public.entitlements to service_role;
alter table public.entitlements enable row level security;
create policy ent_select on public.entitlements for select to authenticated using (true);

create table public.entity_entitlements (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  code text not null references public.entitlements(code) on delete cascade,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, code)
);
grant select on public.entity_entitlements to authenticated;
grant all on public.entity_entitlements to service_role;
alter table public.entity_entitlements enable row level security;
create policy ee_select on public.entity_entitlements for select to authenticated
  using (private.is_active_member(auth.uid(), entity_id));

create or replace function private.reject_core_action_gating()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.core_free_actions c where c.code = new.code) then
    raise exception 'CORE_ACTION_CANNOT_BE_GATED';
  end if;
  return new;
end;
$$;

create trigger entitlements_reject_core
  before insert or update on public.entitlements
  for each row execute function private.reject_core_action_gating();

create trigger entity_entitlements_reject_core
  before insert or update on public.entity_entitlements
  for each row execute function private.reject_core_action_gating();

create or replace function private.has_entitlement(_entity_id uuid, _code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entity_entitlements e
    where e.entity_id = _entity_id and e.code = _code
      and e.revoked_at is null
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

create or replace function private.require_entitlement(_entity_id uuid, _code text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.core_free_actions c where c.code = _code) then
    raise exception 'CORE_ACTION_CANNOT_BE_GATED';
  end if;
  if not private.has_entitlement(_entity_id, _code) then
    raise exception 'ENTITLEMENT_REQUIRED';
  end if;
end;
$$;

insert into public.entitlements(code, description_ar, description_en) values
  ('marketplace.featured_listing','إبراز الإعلان في السوق','Featured marketplace listing'),
  ('commerce.storefront','فتح متجر إلكتروني','Storefront'),
  ('analytics.advanced','تحليلات متقدمة','Advanced analytics')
on conflict do nothing;

-- 5) feature flags -----------------------------------------------------------
create table public.feature_flags (
  code text primary key,
  description_ar text not null,
  enabled_globally boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.feature_flags to authenticated;
grant all on public.feature_flags to service_role;
alter table public.feature_flags enable row level security;
create policy ff_select on public.feature_flags for select to authenticated using (true);

create table public.feature_flag_countries (
  code text not null references public.feature_flags(code) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  primary key (code, country_code)
);
grant select on public.feature_flag_countries to authenticated;
grant all on public.feature_flag_countries to service_role;
alter table public.feature_flag_countries enable row level security;
create policy ffc_select on public.feature_flag_countries for select to authenticated using (true);

insert into public.feature_flags(code, description_ar, enabled_globally) values
  ('commerce','المتاجر والسلة والطلبات', false)
on conflict do nothing;

create or replace function private.commerce_enabled(_country_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select f.enabled_globally from public.feature_flags f where f.code = 'commerce'), false)
      or exists (
        select 1 from public.feature_flag_countries c
        where c.code = 'commerce' and c.country_code = upper(coalesce(_country_code,''))
      );
$$;

create or replace function private.require_commerce(_country_code text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not private.commerce_enabled(_country_code) then
    raise exception 'COMMERCE_DISABLED';
  end if;
end;
$$;

-- 6) service listings --------------------------------------------------------
create table public.service_listings (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  service_kind text not null check (service_kind in
    ('design','supervision','inspection','photography','marketing','legal','accounting','contracting','survey','other')),
  title text not null check (length(btrim(title)) between 3 and 160),
  description text not null check (length(btrim(description)) between 10 and 4000),
  price_min numeric(14,2) check (price_min is null or price_min >= 0),
  price_max numeric(14,2) check (price_max is null or price_max >= 0),
  currency text not null default 'SAR',
  status text not null default 'draft' check (status in ('draft','published','paused','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (price_min is null or price_max is null or price_max >= price_min)
);
grant select on public.service_listings to authenticated, anon;
grant all on public.service_listings to service_role;
alter table public.service_listings enable row level security;
create policy sl_select_member on public.service_listings for select to authenticated
  using (private.is_active_member(auth.uid(), entity_id));
create policy sl_select_published on public.service_listings for select to authenticated, anon
  using (status = 'published' and deleted_at is null);

create table public.service_listing_areas (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.service_listings(id) on delete cascade,
  country_code text not null default 'SA' check (country_code ~ '^[A-Z]{2}$'),
  region text,
  city text,
  created_at timestamptz not null default now()
);
grant select on public.service_listing_areas to authenticated, anon;
grant all on public.service_listing_areas to service_role;
alter table public.service_listing_areas enable row level security;
create policy sla_select on public.service_listing_areas for select to authenticated, anon
  using (exists (
    select 1 from public.service_listings l
    where l.id = listing_id
      and ((l.status = 'published' and l.deleted_at is null)
        or private.is_active_member(auth.uid(), l.entity_id))
  ));

-- publisher identity is derived server-side, never trusted from input
create or replace function private.enforce_listing_identity()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  if not private.is_active_member(new.created_by, new.entity_id) then
    raise exception 'NOT_A_MEMBER_OF_ENTITY';
  end if;
  if tg_op = 'UPDATE' and new.entity_id <> old.entity_id then
    raise exception 'LISTING_ENTITY_IMMUTABLE';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger service_listings_identity
  before insert or update on public.service_listings
  for each row execute function private.enforce_listing_identity();

-- 7) appointments ------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.service_listings(id) on delete set null,
  requester_entity_id uuid not null references public.entities(id) on delete cascade,
  provider_entity_id uuid not null references public.entities(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  kind text not null check (kind in ('visit','consultation','meeting')),
  title text not null,
  notes text,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  requester_timezone text not null,
  provider_timezone text not null,
  status text not null default 'proposed'
    check (status in ('proposed','confirmed','cancelled','completed','no_show')),
  cancel_deadline_at timestamptz not null,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_entity_id <> provider_entity_id)
);
grant select on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;
create policy appt_select on public.appointments for select to authenticated
  using (private.is_active_member(auth.uid(), requester_entity_id)
      or private.is_active_member(auth.uid(), provider_entity_id));

create table public.appointment_participants (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null,
  entity_id uuid not null references public.entities(id) on delete cascade,
  side text not null check (side in ('requester','provider')),
  reminder_channel text not null default 'in_app' check (reminder_channel in ('in_app','email','sms')),
  created_at timestamptz not null default now(),
  unique (appointment_id, user_id)
);
grant select on public.appointment_participants to authenticated;
grant all on public.appointment_participants to service_role;
alter table public.appointment_participants enable row level security;
create policy appt_part_select on public.appointment_participants for select to authenticated
  using (user_id = auth.uid() or private.is_active_member(auth.uid(), entity_id));

-- timers + notification types for appointment reminders
alter table public.duration_timers drop constraint duration_timers_kind_ck;
alter table public.duration_timers add constraint duration_timers_kind_ck
  check (subject_kind = any (array['request','stage','milestone','retention','warranty',
    'marketing_contract','marketing_license','media_publication','appointment']));

alter table public.notification_types drop constraint notification_types_target_kind_check;
alter table public.notification_types add constraint notification_types_target_kind_check
  check (target_kind = any (array['request','stage','contract','document','disbursement',
    'financial_document','milestone','retention','membership','warranty','queue_item','breakglass',
    'marketing_version','marketing_contract','media_asset','media_publication','appointment','order']));

insert into public.notification_types(code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind) values
  ('appointment.reminder','reminder','in_app', false, false, 'notif.appointment.reminder.subject','notif.appointment.reminder.body','appointment'),
  ('appointment.confirmed','info','in_app', false, false, 'notif.appointment.confirmed.subject','notif.appointment.confirmed.body','appointment'),
  ('appointment.cancelled','info','in_app', false, false, 'notif.appointment.cancelled.subject','notif.appointment.cancelled.body','appointment')
on conflict do nothing;

-- 8) commerce (behind the flag) ---------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  name text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  price numeric(14,2) not null check (price >= 0),
  currency text not null default 'SAR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  buyer_entity_id uuid not null references public.entities(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  status text not null default 'open' check (status in ('open','ordered','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid references public.carts(id) on delete set null,
  buyer_entity_id uuid not null references public.entities(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  currency text not null default 'SAR',
  payment_method text not null check (payment_method in ('cod','bank_transfer')),
  status text not null default 'placed'
    check (status in ('placed','awaiting_payment','paid','cancelled','fulfilled')),
  placed_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete restrict,
  name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0)
);
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('cod','bank_transfer')),
  amount numeric(14,2) not null check (amount >= 0),
  receipt_path text,
  receipt_uploaded_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select on public.stores, public.store_products, public.carts, public.cart_items,
  public.orders, public.order_items, public.order_payments to authenticated;
grant all on public.stores, public.store_products, public.carts, public.cart_items,
  public.orders, public.order_items, public.order_payments to service_role;

alter table public.stores enable row level security;
alter table public.store_products enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payments enable row level security;

create policy stores_select on public.stores for select to authenticated
  using (status = 'active' or private.is_active_member(auth.uid(), entity_id));
create policy products_select on public.store_products for select to authenticated
  using (exists (select 1 from public.stores s where s.id = store_id
    and (s.status = 'active' or private.is_active_member(auth.uid(), s.entity_id))));
create policy carts_select on public.carts for select to authenticated
  using (private.is_active_member(auth.uid(), buyer_entity_id));
create policy cart_items_select on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id
    and private.is_active_member(auth.uid(), c.buyer_entity_id)));
create policy orders_select on public.orders for select to authenticated
  using (private.is_active_member(auth.uid(), buyer_entity_id)
      or exists (select 1 from public.stores s where s.id = store_id
                 and private.is_active_member(auth.uid(), s.entity_id)));
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (private.is_active_member(auth.uid(), o.buyer_entity_id)
      or exists (select 1 from public.stores s where s.id = o.store_id
                 and private.is_active_member(auth.uid(), s.entity_id)))));
create policy order_payments_select on public.order_payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
    and (private.is_active_member(auth.uid(), o.buyer_entity_id)
      or exists (select 1 from public.stores s where s.id = o.store_id
                 and private.is_active_member(auth.uid(), s.entity_id)))));

-- 9) hard REVOKE on every new table -----------------------------------------
revoke insert, update, delete, truncate on
  public.entity_subscription_state, public.core_free_actions, public.entitlements,
  public.entity_entitlements, public.feature_flags, public.feature_flag_countries,
  public.service_listings, public.service_listing_areas, public.appointments,
  public.appointment_participants, public.stores, public.store_products, public.carts,
  public.cart_items, public.orders, public.order_items, public.order_payments
from anon, authenticated;

revoke select on
  public.entity_subscription_state, public.entitlements, public.entity_entitlements,
  public.feature_flags, public.feature_flag_countries, public.appointments,
  public.appointment_participants, public.stores, public.store_products, public.carts,
  public.cart_items, public.orders, public.order_items, public.order_payments
from anon;