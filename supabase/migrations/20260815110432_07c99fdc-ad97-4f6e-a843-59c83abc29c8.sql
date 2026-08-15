do $$
declare
  v_owner uuid; v_assignee uuid; v_mgr uuid; v_entity uuid;
  v_p1 uuid; v_p2 uuid; v_tpl uuid; v_t1 uuid; v_t2 uuid; v_r1 uuid; v_r2 uuid;
  v_pol uuid; e text;
begin
  foreach e in array array['p17b-owner@example.com','p17b-assignee@example.com','p17b-manager@example.com'] loop
    if not exists (select 1 from auth.users where email = e) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e,
        extensions.crypt('Rakeez!p17b-2026', extensions.gen_salt('bf')), now(),
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
  where email like 'p17b-%@example.com';

  select id into v_owner from auth.users where email='p17b-owner@example.com';
  select id into v_assignee from auth.users where email='p17b-assignee@example.com';
  select id into v_mgr from auth.users where email='p17b-manager@example.com';

  insert into public.entities (name, type, status) values ('p17b-entity','company','active') returning id into v_entity;
  insert into public.entity_memberships (user_id, entity_id, role, status) values
    (v_owner, v_entity, 'owner', 'active'),
    (v_assignee, v_entity, 'member', 'active'),
    (v_mgr, v_entity, 'manager', 'active');

  select id into v_tpl from public.project_templates limit 1;
  insert into public.projects (owner_id, entity_id, project_template_id, name, code, status, created_by)
  values (v_owner, v_entity, v_tpl, 'p17b-project-policy', 'P17B-001', 'active', v_owner) returning id into v_p1;
  insert into public.projects (owner_id, entity_id, project_template_id, name, code, status, created_by)
  values (v_owner, v_entity, v_tpl, 'p17b-project-nopolicy', 'P17B-002', 'active', v_owner) returning id into v_p2;

  insert into public.correspondence_threads (project_id, subject, created_by) values (v_p1,'p17b-thread-1',v_owner) returning id into v_t1;
  insert into public.correspondence_threads (project_id, subject, created_by) values (v_p2,'p17b-thread-2',v_owner) returning id into v_t2;

  -- overdue request inside the project that HAS a policy
  insert into public.requests (request_type_code, project_id, requested_by, assigned_user_id, assigned_entity_id, status, subject, thread_id, due_at)
  select rt.code, v_p1, v_owner, v_assignee, v_entity, 'submitted', 'p17b-request-policy', v_t1, now() - interval '5 days'
  from public.request_types rt where rt.is_active limit 1
  returning id into v_r1;

  -- overdue request inside the project that has NO policy at all
  insert into public.requests (request_type_code, project_id, requested_by, assigned_user_id, assigned_entity_id, status, subject, thread_id, due_at)
  select rt.code, v_p2, v_owner, v_assignee, v_entity, 'submitted', 'p17b-request-nopolicy', v_t2, now() - interval '5 days'
  from public.request_types rt where rt.is_active limit 1
  returning id into v_r2;

  -- explicit escalation policy for project 1 only, targeting a named user
  insert into public.escalation_policies (entity_id, project_id, subject_kind, name_ar, name_en, trigger_after_hours, created_by)
  values (v_entity, v_p1, 'request', 'تصعيد طلبات p17b', 'p17b request escalation', 24, v_owner)
  returning id into v_pol;
  insert into public.escalation_steps (policy_id, step_no, delay_hours, target_kind, target_user_id)
  values (v_pol, 1, 0, 'user', v_mgr);

  raise notice 'p17b entity=% p1=% p2=% r1=% r2=% policy=%', v_entity, v_p1, v_p2, v_r1, v_r2, v_pol;
end $$;