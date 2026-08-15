do $$
declare v_u uuid; v_e uuid; v_tpl uuid; e text := 'pdesign-owner@example.com';
begin
  if not exists (select 1 from auth.users where email = e) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e,
      extensions.crypt('Rakeez!design-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','فاحص التصميم'), now(), now());
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', e, 'email_verified', true), 'email', now(), now(), now()
    from auth.users u where u.email = e;
  end if;

  update auth.users set
    confirmation_token = coalesce(confirmation_token,''), recovery_token = coalesce(recovery_token,''),
    email_change = coalesce(email_change,''), email_change_token_new = coalesce(email_change_token_new,''),
    email_change_token_current = coalesce(email_change_token_current,''), phone_change = coalesce(phone_change,''),
    phone_change_token = coalesce(phone_change_token,''), reauthentication_token = coalesce(reauthentication_token,'')
  where email = e;

  select id into v_u from auth.users where email = e;

  perform set_config('rakeez.service_link','on', true);
  alter table public.entity_memberships disable trigger user;

  select id into v_e from public.entities where name = 'DESIGN-QA-ENTITY';
  if v_e is null then
    insert into public.entities (name, type, status) values ('DESIGN-QA-ENTITY','company','active') returning id into v_e;
    insert into public.entity_memberships (user_id, entity_id, role, status) values (v_u, v_e, 'owner', 'active');
    select id into v_tpl from public.project_templates limit 1;
    insert into public.projects (owner_id, entity_id, project_template_id, name, status, city, created_by)
    values (v_u, v_e, v_tpl, 'DESIGN-QA-PROJECT','active','الرياض', v_u);
  end if;

  insert into public.policy_acceptances (user_id, document_id, version_id, context)
  select v_u, lv.document_id, lv.id, 'login_gate'
  from public.legal_document_versions lv
  where lv.is_current and lv.requires_acceptance
    and not exists (select 1 from public.policy_acceptances pa where pa.user_id = v_u and pa.version_id = lv.id);

  alter table public.entity_memberships enable trigger user;
  perform set_config('rakeez.service_link','off', true);
end $$;