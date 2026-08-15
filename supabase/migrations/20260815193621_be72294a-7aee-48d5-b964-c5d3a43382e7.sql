do $$
declare v_pw text := crypt('Test28!Rakeez#2026', gen_salt('bf')); uid uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email='p28-staff@example.com') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated','authenticated','p28-staff@example.com', v_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('email_verified', true, 'full_name','TEST-28 staff'), now(), now());
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid::text, uid, jsonb_build_object('sub', uid::text,'email','p28-staff@example.com','email_verified',true), 'email', now(), now(), now());
  end if;
  update auth.users set confirmation_token=coalesce(confirmation_token,''), recovery_token=coalesce(recovery_token,''),
    email_change=coalesce(email_change,''), email_change_token_new=coalesce(email_change_token_new,''),
    email_change_token_current=coalesce(email_change_token_current,''), phone_change=coalesce(phone_change,''),
    phone_change_token=coalesce(phone_change_token,'') where email like 'p28-%@example.com';
  insert into public.platform_staff (user_id, role, availability, active)
  select u.id, 'reviewer', 'available', true from auth.users u where u.email='p28-staff@example.com'
  on conflict do nothing;
end $$;