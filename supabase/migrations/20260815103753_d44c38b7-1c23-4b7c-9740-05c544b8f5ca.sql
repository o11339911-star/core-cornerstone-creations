do $$
declare
  v_owner uuid; v_assignee uuid; v_susp uuid; v_entity uuid; v_project uuid; v_tpl uuid;
  v_req uuid; v_contract uuid; v_doc uuid; v_thread uuid; e text;
begin
  foreach e in array array['p17a-owner@example.com','p17a-assignee@example.com','p17a-suspended@example.com'] loop
    if not exists (select 1 from auth.users where email = e) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', e,
        extensions.crypt('Rakeez!p17a-2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', e), now(), now());
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), u.id, u.id::text,
             jsonb_build_object('sub', u.id::text, 'email', e, 'email_verified', true),
             'email', now(), now(), now()
      from auth.users u where u.email = e;
    end if;
  end loop;

  select id into v_owner from auth.users where email='p17a-owner@example.com';
  select id into v_assignee from auth.users where email='p17a-assignee@example.com';
  select id into v_susp from auth.users where email='p17a-suspended@example.com';

  insert into public.entities (name, type, status) values ('p17a-entity', 'company', 'active') returning id into v_entity;
  insert into public.entity_memberships (user_id, entity_id, role, status) values
    (v_owner, v_entity, 'owner', 'active'),
    (v_assignee, v_entity, 'member', 'active'),
    (v_susp, v_entity, 'member', 'active');

  select id into v_tpl from public.project_templates limit 1;
  insert into public.projects (owner_id, entity_id, project_template_id, name, code, status, created_by)
  values (v_owner, v_entity, v_tpl, 'p17a-project', 'P17A-001', 'active', v_owner) returning id into v_project;

  insert into public.contracts (project_id, contract_type, title, status, created_by)
  values (v_project, 'works', 'p17a-contract', 'draft', v_owner) returning id into v_contract;

  insert into public.correspondence_threads (project_id, subject, created_by)
  values (v_project, 'p17a-thread', v_owner) returning id into v_thread;

  insert into public.requests (request_type_code, project_id, requested_by, assigned_user_id, assigned_entity_id, status, subject, thread_id)
  select rt.code, v_project, v_owner, v_assignee, v_entity, 'draft', 'p17a-request', v_thread
  from public.request_types rt where rt.is_active limit 1
  returning id into v_req;

  insert into public.financial_documents (project_id, contract_id, doc_type, direction, doc_number, status, created_by)
  values (v_project, v_contract, 'invoice', 'issued', 'P17A-INV-1', 'draft', v_owner) returning id into v_doc;

  raise notice 'p17a project=% request=% doc=% owner=% assignee=% suspended=%', v_project, v_req, v_doc, v_owner, v_assignee, v_susp;
end $$;