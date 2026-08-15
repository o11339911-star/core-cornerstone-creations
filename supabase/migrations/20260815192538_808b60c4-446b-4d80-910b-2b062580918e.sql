-- Phase 28 test fixtures (test_run_id = p28-2026-08-15)
do $$
declare
  v_pw text := crypt('Test28!Rakeez#2026', gen_salt('bf'));
  v_ent_a uuid;
  v_ent_b uuid;
  r record;
  emails text[] := array[
    'p28-owner-a@example.com','p28-admin-a@example.com','p28-manager-a@example.com',
    'p28-member-a@example.com','p28-viewer-a@example.com','p28-suspended-a@example.com',
    'p28-noaccount@example.com','p28-owner-b@example.com','p28-outsider@example.com'
  ];
  e text;
  uid uuid;
begin
  foreach e in array emails loop
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e, v_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('email_verified', true, 'full_name', 'TEST-28 ' || split_part(e,'@',1)),
      now(), now()
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true), 'email', now(), now(), now());
  end loop;

  insert into public.entities (name, type, status) values ('TEST-28 كيان أ', 'developer', 'active') returning id into v_ent_a;
  insert into public.entities (name, type, status) values ('TEST-28 كيان ب', 'contractor', 'active') returning id into v_ent_b;

  for r in select id, email from auth.users where email like 'p28-%@example.com' loop
    if r.email = 'p28-owner-a@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_a, 'owner', 'active');
    elsif r.email = 'p28-admin-a@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_a, 'admin', 'active');
    elsif r.email = 'p28-manager-a@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_a, 'manager', 'active');
    elsif r.email = 'p28-member-a@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_a, 'member', 'active');
    elsif r.email = 'p28-viewer-a@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_a, 'viewer', 'active');
    elsif r.email = 'p28-suspended-a@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_a, 'member', 'suspended');
    elsif r.email = 'p28-owner-b@example.com' then
      insert into public.entity_memberships (user_id, entity_id, role, status) values (r.id, v_ent_b, 'owner', 'active');
    end if;
  end loop;
end $$;