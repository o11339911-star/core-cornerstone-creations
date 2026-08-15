-- ============ Phase 24 functions ============

-- read-only guard on core project writes (no deletion, ever)
create or replace function private.guard_entity_read_only()
returns trigger language plpgsql set search_path = public as $$
declare v_entity uuid;
begin
  v_entity := case when tg_op = 'DELETE' then old.entity_id else new.entity_id end;
  if v_entity is not null and private.entity_is_read_only(v_entity) then
    raise exception 'ENTITY_READ_ONLY';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger projects_read_only_guard before insert or update on public.projects
  for each row execute function private.guard_entity_read_only();

-- ---------- service listings ----------
create or replace function public.publish_service_listing(
  _entity_id uuid, _service_kind text, _title text, _description text,
  _areas jsonb default '[]'::jsonb, _price_min numeric default null,
  _price_max numeric default null, _publish boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; a jsonb;
begin
  perform private.require_member(_entity_id);
  perform private.require_writable(_entity_id);

  insert into public.service_listings(entity_id, created_by, service_kind, title, description,
    price_min, price_max, status, published_at)
  values (_entity_id, auth.uid(), _service_kind, _title, _description, _price_min, _price_max,
          case when _publish then 'published' else 'draft' end,
          case when _publish then now() else null end)
  returning id into v_id;

  for a in select * from jsonb_array_elements(coalesce(_areas,'[]'::jsonb)) loop
    insert into public.service_listing_areas(listing_id, country_code, region, city)
    values (v_id, upper(coalesce(a->>'country_code','SA')), a->>'region', a->>'city');
  end loop;

  return v_id;
end;
$$;

create or replace function public.update_service_listing(
  _listing_id uuid, _title text default null, _description text default null,
  _status text default null, _price_min numeric default null, _price_max numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  select entity_id into v_entity from public.service_listings where id = _listing_id;
  if v_entity is null then raise exception 'LISTING_NOT_FOUND'; end if;
  perform private.require_member(v_entity);
  perform private.require_writable(v_entity);

  update public.service_listings set
    title = coalesce(_title, title),
    description = coalesce(_description, description),
    price_min = coalesce(_price_min, price_min),
    price_max = coalesce(_price_max, price_max),
    status = coalesce(_status, status),
    published_at = case when coalesce(_status, status) = 'published' and published_at is null
                        then now() else published_at end
  where id = _listing_id;
end;
$$;

create or replace function public.archive_service_listing(_listing_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_entity uuid;
begin
  select entity_id into v_entity from public.service_listings where id = _listing_id;
  if v_entity is null then raise exception 'LISTING_NOT_FOUND'; end if;
  perform private.require_member(v_entity);
  perform private.require_writable(v_entity);
  update public.service_listings set status = 'archived', deleted_at = now() where id = _listing_id;
end;
$$;

-- ---------- appointments ----------
create or replace function public.propose_appointment(
  _requester_entity_id uuid, _provider_entity_id uuid, _kind text, _title text,
  _starts_at timestamptz, _requester_timezone text, _provider_timezone text,
  _duration_minutes integer default 60, _listing_id uuid default null,
  _cancel_hours integer default 24, _notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_deadline timestamptz; r record;
begin
  perform private.require_member(_requester_entity_id);
  perform private.require_writable(_requester_entity_id);
  if _starts_at <= now() then raise exception 'APPOINTMENT_IN_THE_PAST'; end if;
  v_deadline := _starts_at - make_interval(hours => greatest(_cancel_hours, 0));

  insert into public.appointments(listing_id, requester_entity_id, provider_entity_id, created_by,
    kind, title, notes, starts_at, duration_minutes, requester_timezone, provider_timezone,
    cancel_deadline_at)
  values (_listing_id, _requester_entity_id, _provider_entity_id, auth.uid(), _kind, _title, _notes,
    _starts_at, _duration_minutes, _requester_timezone, _provider_timezone, v_deadline)
  returning id into v_id;

  insert into public.appointment_participants(appointment_id, user_id, entity_id, side)
  select v_id, em.user_id, em.entity_id,
         case when em.entity_id = _requester_entity_id then 'requester' else 'provider' end
  from public.entity_memberships em
  where em.entity_id in (_requester_entity_id, _provider_entity_id)
    and em.status = 'active' and em.role in ('owner','admin','manager')
  on conflict do nothing;

  -- reminder timer: due one hour before the appointment
  insert into public.duration_timers(subject_kind, subject_id, entity_id, started_at, due_at, state)
  values ('appointment', v_id, _provider_entity_id, now(), _starts_at - interval '1 hour', 'running')
  on conflict (subject_kind, subject_id) do update
    set due_at = excluded.due_at, state = 'running', stopped_at = null;

  return v_id;
end;
$$;

create or replace function public.confirm_appointment(_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; p record;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  perform private.require_member(a.provider_entity_id);
  if a.status <> 'proposed' then raise exception 'APPOINTMENT_NOT_PROPOSED'; end if;

  update public.appointments set status = 'confirmed', updated_at = now() where id = _appointment_id;

  for p in select user_id, entity_id from public.appointment_participants where appointment_id = _appointment_id loop
    perform private.emit_notification(p.user_id, 'appointment.confirmed', null, p.entity_id,
      'appointment', _appointment_id, jsonb_build_object('title', a.title, 'starts_at', a.starts_at),
      'confirmed', 'info');
  end loop;
end;
$$;

create or replace function public.cancel_appointment(_appointment_id uuid, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a record; p record;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not (private.is_active_member(auth.uid(), a.requester_entity_id)
       or private.is_active_member(auth.uid(), a.provider_entity_id)) then
    raise exception 'NOT_A_MEMBER_OF_ENTITY';
  end if;
  if a.status in ('cancelled','completed','no_show') then raise exception 'APPOINTMENT_NOT_CANCELLABLE'; end if;
  if now() > a.cancel_deadline_at then raise exception 'APPOINTMENT_CANCEL_WINDOW_PASSED'; end if;

  update public.appointments
     set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = _reason, updated_at = now()
   where id = _appointment_id;

  update public.duration_timers set state = 'stopped', stopped_at = now()
   where subject_kind = 'appointment' and subject_id = _appointment_id;

  for p in select user_id, entity_id from public.appointment_participants where appointment_id = _appointment_id loop
    perform private.emit_notification(p.user_id, 'appointment.cancelled', null, p.entity_id,
      'appointment', _appointment_id, jsonb_build_object('title', a.title, 'reason', _reason),
      'cancelled', 'info');
  end loop;
end;
$$;

create or replace function public.complete_appointment(_appointment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.appointments where id = _appointment_id;
  if a is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  perform private.require_member(a.provider_entity_id);
  if a.status <> 'confirmed' then raise exception 'APPOINTMENT_NOT_CONFIRMED'; end if;
  update public.appointments set status = 'completed', updated_at = now() where id = _appointment_id;
  update public.duration_timers set state = 'stopped', stopped_at = now()
   where subject_kind = 'appointment' and subject_id = _appointment_id;
end;
$$;

-- ---------- entitlements ----------
create or replace function public.grant_entity_entitlement(_entity_id uuid, _code text, _expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_staff(auth.uid()) then
    perform private.require_member(_entity_id);
    if not exists (
      select 1 from public.entity_memberships em
      where em.user_id = auth.uid() and em.entity_id = _entity_id
        and em.status = 'active' and em.role in ('owner','admin')
    ) then raise exception 'NOT_AUTHORIZED'; end if;
  end if;

  insert into public.entity_entitlements(entity_id, code, granted_by, expires_at)
  values (_entity_id, _code, auth.uid(), _expires_at)
  on conflict (entity_id, code) do update
    set revoked_at = null, expires_at = excluded.expires_at, updated_at = now();
end;
$$;

create or replace function public.revoke_entity_entitlement(_entity_id uuid, _code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_member(_entity_id);
  update public.entity_entitlements set revoked_at = now(), updated_at = now()
   where entity_id = _entity_id and code = _code;
end;
$$;

-- gated commercial feature used to prove server-side entitlement checks
create or replace function public.use_advanced_analytics(_entity_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform private.require_member(_entity_id);
  perform private.require_entitlement(_entity_id, 'analytics.advanced');
  return jsonb_build_object('entity_id', _entity_id, 'feature', 'analytics.advanced', 'ok', true);
end;
$$;

-- ---------- commerce (flag-gated) ----------
create or replace function public.open_store(_entity_id uuid, _name text, _country_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform private.require_member(_entity_id);
  perform private.require_writable(_entity_id);
  perform private.require_commerce(_country_code);
  insert into public.stores(entity_id, name, country_code) values (_entity_id, _name, upper(_country_code))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.add_store_product(_store_id uuid, _name text, _price numeric, _description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; v_id uuid;
begin
  select * into s from public.stores where id = _store_id;
  if s is null then raise exception 'STORE_NOT_FOUND'; end if;
  perform private.require_member(s.entity_id);
  perform private.require_writable(s.entity_id);
  perform private.require_commerce(s.country_code);
  insert into public.store_products(store_id, name, price, description)
  values (_store_id, _name, _price, _description) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_cart(_buyer_entity_id uuid, _store_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; v_id uuid;
begin
  select * into s from public.stores where id = _store_id;
  if s is null then raise exception 'STORE_NOT_FOUND'; end if;
  perform private.require_member(_buyer_entity_id);
  perform private.require_writable(_buyer_entity_id);
  perform private.require_commerce(s.country_code);
  insert into public.carts(buyer_entity_id, store_id) values (_buyer_entity_id, _store_id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.add_cart_item(_cart_id uuid, _product_id uuid, _quantity integer)
returns void language plpgsql security definer set search_path = public as $$
declare c record; s record; pr record;
begin
  select * into c from public.carts where id = _cart_id;
  if c is null then raise exception 'CART_NOT_FOUND'; end if;
  perform private.require_member(c.buyer_entity_id);
  select * into s from public.stores where id = c.store_id;
  perform private.require_commerce(s.country_code);
  select * into pr from public.store_products where id = _product_id and store_id = c.store_id and is_active;
  if pr is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  insert into public.cart_items(cart_id, product_id, quantity, unit_price)
  values (_cart_id, _product_id, _quantity, pr.price)
  on conflict (cart_id, product_id) do update set quantity = public.cart_items.quantity + excluded.quantity;
end;
$$;

create or replace function public.place_order(_cart_id uuid, _payment_method text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; s record; v_total numeric(14,2); v_order uuid;
begin
  select * into c from public.carts where id = _cart_id;
  if c is null then raise exception 'CART_NOT_FOUND'; end if;
  perform private.require_member(c.buyer_entity_id);
  perform private.require_writable(c.buyer_entity_id);
  select * into s from public.stores where id = c.store_id;
  perform private.require_commerce(s.country_code);
  if _payment_method not in ('cod','bank_transfer') then raise exception 'PAYMENT_METHOD_NOT_SUPPORTED'; end if;
  if c.status <> 'open' then raise exception 'CART_NOT_OPEN'; end if;

  select coalesce(sum(quantity * unit_price),0) into v_total from public.cart_items where cart_id = _cart_id;
  if v_total <= 0 then raise exception 'CART_EMPTY'; end if;

  insert into public.orders(cart_id, buyer_entity_id, store_id, country_code, total_amount,
    payment_method, status)
  values (_cart_id, c.buyer_entity_id, c.store_id, s.country_code, v_total, _payment_method,
    case when _payment_method = 'cod' then 'placed' else 'awaiting_payment' end)
  returning id into v_order;

  insert into public.order_items(order_id, product_id, name_snapshot, quantity, unit_price)
  select v_order, ci.product_id, p.name, ci.quantity, ci.unit_price
  from public.cart_items ci join public.store_products p on p.id = ci.product_id
  where ci.cart_id = _cart_id;

  insert into public.order_payments(order_id, method, amount) values (v_order, _payment_method, v_total);
  update public.carts set status = 'ordered', updated_at = now() where id = _cart_id;
  return v_order;
end;
$$;

create or replace function public.attach_payment_receipt(_order_id uuid, _receipt_path text)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.orders where id = _order_id;
  if o is null then raise exception 'ORDER_NOT_FOUND'; end if;
  perform private.require_member(o.buyer_entity_id);
  perform private.require_commerce(o.country_code);
  if o.payment_method <> 'bank_transfer' then raise exception 'RECEIPT_ONLY_FOR_BANK_TRANSFER'; end if;
  update public.order_payments set receipt_path = _receipt_path, receipt_uploaded_at = now()
   where order_id = _order_id;
end;
$$;

create or replace function public.confirm_order_payment(_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record; s record; pay record;
begin
  select * into o from public.orders where id = _order_id;
  if o is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into s from public.stores where id = o.store_id;
  perform private.require_member(s.entity_id);
  perform private.require_commerce(o.country_code);
  select * into pay from public.order_payments where order_id = _order_id;
  if o.payment_method = 'bank_transfer' and pay.receipt_path is null then
    raise exception 'RECEIPT_REQUIRED';
  end if;
  update public.order_payments set confirmed_by = auth.uid(), confirmed_at = now() where order_id = _order_id;
  update public.orders set status = 'paid', updated_at = now() where id = _order_id;
end;
$$;

-- ---------- subscription lifecycle (no data loss) ----------
create or replace function public.simulate_subscription_expiry(_entity_id uuid, _grace_days integer default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_staff(auth.uid()) then
    if not exists (
      select 1 from public.entity_memberships em
      where em.user_id = auth.uid() and em.entity_id = _entity_id
        and em.status = 'active' and em.role in ('owner','admin')
    ) then raise exception 'NOT_AUTHORIZED'; end if;
  end if;

  insert into public.entity_subscription_state(entity_id, state, grace_until, read_only_since, policy_note)
  values (_entity_id,
          case when _grace_days > 0 then 'grace' else 'read_only' end,
          case when _grace_days > 0 then now() + make_interval(days => _grace_days) else null end,
          case when _grace_days > 0 then null else now() end,
          'انتهاء الاشتراك: قراءة وأرشيف فقط، بلا حذف، مع حق التنزيل للمالك')
  on conflict (entity_id) do update
    set state = excluded.state, grace_until = excluded.grace_until,
        read_only_since = excluded.read_only_since, policy_note = excluded.policy_note,
        updated_at = now();
end;
$$;

create or replace function public.restore_subscription(_entity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_staff(auth.uid()) then
    if not exists (
      select 1 from public.entity_memberships em
      where em.user_id = auth.uid() and em.entity_id = _entity_id
        and em.status = 'active' and em.role in ('owner','admin')
    ) then raise exception 'NOT_AUTHORIZED'; end if;
  end if;
  update public.entity_subscription_state
     set state = 'active', grace_until = null, read_only_since = null, updated_at = now()
   where entity_id = _entity_id;
end;
$$;

-- owner data export stays available in read_only
create or replace function public.export_entity_data(_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.entity_memberships em
    where em.user_id = auth.uid() and em.entity_id = _entity_id
      and em.status = 'active' and em.role in ('owner','admin')
  ) then raise exception 'NOT_AUTHORIZED'; end if;

  return jsonb_build_object(
    'entity', (select to_jsonb(e) - 'deleted_at' from public.entities e where e.id = _entity_id),
    'subscription', (select to_jsonb(s) from public.entity_subscription_state s where s.entity_id = _entity_id),
    'listings', coalesce((select jsonb_agg(to_jsonb(l)) from public.service_listings l where l.entity_id = _entity_id), '[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a)) from public.appointments a
        where a.requester_entity_id = _entity_id or a.provider_entity_id = _entity_id), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status))
        from public.projects p where p.entity_id = _entity_id), '[]'::jsonb),
    'exported_at', now()
  );
end;
$$;

-- ---------- grants: revoke PUBLIC, grant explicitly ----------
do $$
declare f record;
begin
  for f in
    select n.nspname, p.oid::regprocedure::text sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private')
      and p.proname in ('is_active_member','require_member','entity_is_read_only','require_writable',
        'reject_core_action_gating','has_entitlement','require_entitlement','commerce_enabled',
        'require_commerce','enforce_listing_identity','guard_entity_read_only',
        'publish_service_listing','update_service_listing','archive_service_listing',
        'propose_appointment','confirm_appointment','cancel_appointment','complete_appointment',
        'grant_entity_entitlement','revoke_entity_entitlement','use_advanced_analytics',
        'open_store','add_store_product','create_cart','add_cart_item','place_order',
        'attach_payment_receipt','confirm_order_payment','simulate_subscription_expiry',
        'restore_subscription','export_entity_data')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.nspname = 'public' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- functions referenced from RLS policies must be executable by the querying role
grant execute on function private.is_active_member(uuid, uuid) to authenticated, anon;
grant execute on function private.entity_is_read_only(uuid) to authenticated;
grant execute on function private.has_entitlement(uuid, text) to authenticated;
grant execute on function private.commerce_enabled(text) to authenticated;