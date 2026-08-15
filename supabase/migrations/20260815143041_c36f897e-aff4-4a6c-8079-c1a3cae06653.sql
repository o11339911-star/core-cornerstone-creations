do $$
declare
  v_buyer uuid; v_seller uuid; v_store uuid; v_outsider uuid;
  v_e_buyer uuid; v_e_seller uuid; v_e_store uuid;
  v_proj uuid; v_tpl uuid; e text;
begin
  foreach e in array array['p24-buyer@example.com','p24-seller@example.com','p24-store@example.com','p24-outsider@example.com'] loop
    if not exists (select 1 from auth.users where email = e) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e,
        extensions.crypt('Rakeez!p24-2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', e), now(), now());
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), u.id, u.id::text,
             jsonb_build_object('sub', u.id::text, 'email', e, 'email_verified', true),
             'email', now(), now(), now()
      from auth.users u where u.email = e;
    end if;
  end loop;

  update auth.users set
    confirmation_token = coalesce(confirmation_token,''),
    recovery_token = coalesce(recovery_token,''),
    email_change = coalesce(email_change,''),
    email_change_token_new = coalesce(email_change_token_new,''),
    email_change_token_current = coalesce(email_change_token_current,''),
    phone_change = coalesce(phone_change,''),
    phone_change_token = coalesce(phone_change_token,''),
    reauthentication_token = coalesce(reauthentication_token,'')
  where email like 'p24-%@example.com';

  select id into v_buyer from auth.users where email='p24-buyer@example.com';
  select id into v_seller from auth.users where email='p24-seller@example.com';
  select id into v_store from auth.users where email='p24-store@example.com';
  select id into v_outsider from auth.users where email='p24-outsider@example.com';

  perform set_config('rakeez.service_link', 'on', true);
  alter table public.entity_memberships disable trigger user;

  insert into public.entities (name, type, status) values ('p24-buyer-entity','company','active') returning id into v_e_buyer;
  insert into public.entities (name, type, status) values ('p24-seller-entity','company','active') returning id into v_e_seller;
  insert into public.entities (name, type, status) values ('p24-store-entity','company','active') returning id into v_e_store;

  insert into public.entity_memberships (user_id, entity_id, role, status) values
    (v_buyer, v_e_buyer, 'owner', 'active'),
    (v_seller, v_e_seller, 'owner', 'active'),
    (v_store, v_e_store, 'owner', 'active');

  select id into v_tpl from public.project_templates limit 1;

  insert into public.projects (owner_id, entity_id, project_template_id, name, status, city, created_by)
  values (v_buyer, v_e_buyer, v_tpl, 'p24-buyer-project', 'active', 'الرياض', v_buyer)
  returning id into v_proj;

  insert into public.entity_subscription_state (entity_id, state) values
    (v_e_buyer,'active'), (v_e_seller,'active'), (v_e_store,'active')
  on conflict (entity_id) do nothing;

  alter table public.entity_memberships enable trigger user;
end $$;