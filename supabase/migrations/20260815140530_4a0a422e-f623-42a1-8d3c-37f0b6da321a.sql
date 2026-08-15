do $$
declare
  v_owner uuid; v_photog uuid; v_marketer uuid; v_outsider uuid;
  v_e_owner uuid; v_e_photo uuid; v_e_mkt uuid;
  v_proj uuid; v_tpl uuid; v_profile uuid; e text;
begin
  foreach e in array array['p23-owner@example.com','p23-photographer@example.com','p23-marketer@example.com','p23-outsider@example.com'] loop
    if not exists (select 1 from auth.users where email = e) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e,
        extensions.crypt('Rakeez!p23-2026', extensions.gen_salt('bf')), now(),
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
  where email like 'p23-%@example.com';

  select id into v_owner from auth.users where email='p23-owner@example.com';
  select id into v_photog from auth.users where email='p23-photographer@example.com';
  select id into v_marketer from auth.users where email='p23-marketer@example.com';
  select id into v_outsider from auth.users where email='p23-outsider@example.com';

  perform set_config('rakeez.service_link', 'on', true);
  alter table public.entity_memberships disable trigger user;
  alter table public.marketing_profiles disable trigger user;
  alter table public.marketing_contracts disable trigger user;

  insert into public.entities (name, type, status) values ('p23-owner-entity','company','active') returning id into v_e_owner;
  insert into public.entities (name, type, status) values ('p23-photo-studio','company','active') returning id into v_e_photo;
  insert into public.entities (name, type, status) values ('p23-marketer-entity','company','active') returning id into v_e_mkt;

  insert into public.entity_memberships (user_id, entity_id, role, status) values
    (v_owner, v_e_owner, 'owner', 'active'),
    (v_photog, v_e_photo, 'owner', 'active'),
    (v_marketer, v_e_mkt, 'owner', 'active');

  select id into v_tpl from public.project_templates limit 1;

  insert into public.projects (owner_id, entity_id, project_template_id, name, status, city, created_by)
  values (v_owner, v_e_owner, v_tpl, 'p23-project', 'active', 'الرياض', v_owner)
  returning id into v_proj;

  insert into public.marketing_profiles (project_id, owner_entity_id, readiness_basis, status, channel_mode, created_by)
  values (v_proj, v_e_owner, 'off_plan', 'active', 'external', v_owner)
  returning id into v_profile;

  insert into public.marketing_contracts (profile_id, marketer_entity_id, exclusivity, starts_on, ends_on, channels, price_authority, status, created_by)
  values (v_profile, v_e_mkt, 'non_exclusive', current_date - 1, current_date + 365, array['web'], 'owner_fixed', 'active', v_owner);

  alter table public.entity_memberships enable trigger user;
  alter table public.marketing_profiles enable trigger user;
  alter table public.marketing_contracts enable trigger user;
  perform set_config('rakeez.service_link', 'off', true);
end $$;