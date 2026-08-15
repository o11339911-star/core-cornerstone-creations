do $$
declare
  v_owner uuid := gen_random_uuid();
  v_fin uuid := gen_random_uuid();
  v_nofin uuid := gen_random_uuid();
  v_entity uuid := gen_random_uuid();
  v_prop uuid := gen_random_uuid();
  v_proj uuid := gen_random_uuid();
  v_email text;
  v_id uuid;
begin
  foreach v_email in array array['p19-owner@example.com','p19-finance@example.com','p19-nofinance@example.com'] loop
    v_id := case v_email when 'p19-owner@example.com' then v_owner when 'p19-finance@example.com' then v_fin else v_nofin end;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
            crypt('P19-test-9x!', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', v_email), now(), now());
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
            jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), now(), now(), now());
  end loop;

  insert into public.entities (id, name, type) values (v_entity, 'كيان اختبار المرحلة 19', 'office');

  insert into public.entity_memberships (user_id, entity_id, role, status) values
    (v_owner, v_entity, 'owner', 'active'),
    (v_fin, v_entity, 'member', 'active'),
    (v_nofin, v_entity, 'member', 'active');

  insert into public.properties (id, owner_id, entity_id, kind, name, code, status, city, district, plan_no, parcel_no, approx_lat, approx_lng, created_by)
  values (v_prop, v_owner, v_entity, 'land', 'عقار اختبار المرحلة 19', 'P19-PROP-001', 'active',
          'الرياض', 'حي الاختبار التاسع عشر', 'PLAN-P19-777', 'PARCEL-P19-42', 24.71, 46.67, v_owner);

  insert into public.deeds (property_id, deed_number, issuer, created_by)
  values (v_prop, 'DEED-P19-909090', 'كتابة عدل الاختبار', v_owner);

  insert into public.building_licenses (property_id, license_number, authority, created_by)
  values (v_prop, 'LIC-P19-555', 'أمانة الاختبار', v_owner);

  insert into public.projects (id, owner_id, entity_id, project_template_id, name, code, status, city, district, created_by)
  values (v_proj, v_owner, v_entity, (select id from public.project_templates order by created_at limit 1),
          'مشروع اختبار المرحلة 19', 'P19-PRJ-001', 'active',
          'الرياض', 'حي الاختبار التاسع عشر', v_owner);

  insert into public.property_projects (property_id, project_id, linked_by)
  values (v_prop, v_proj, v_owner);

  insert into public.project_stages (project_id, order_index, name_ar, name_en, status, is_required) values
    (v_proj, 1, 'مرحلة اختبار أولى', 'P19 stage one', 'approved', true),
    (v_proj, 2, 'مرحلة اختبار ثانية', 'P19 stage two', 'pending', true);

  insert into public.project_closure_items (project_id, code, name_ar, name_en, phase, is_required, status) values
    (v_proj, 'P19-CL-1', 'بند إغلاق اختبار أول', 'P19 closure one', 'final', true, 'satisfied'),
    (v_proj, 'P19-CL-2', 'بند إغلاق اختبار ثانٍ', 'P19 closure two', 'final', true, 'pending');

  -- الوصول للمشروع لكلا العضوين، والصلاحية المالية لواحد فقط.
  insert into public.project_assignments (project_id, user_id, entity_id, job_title_ar, job_title_en, created_by, visibility)
  values (v_proj, v_fin, v_entity, 'مهندس اختبار مالي', 'P19 finance engineer', v_owner, 'project_wide'),
         (v_proj, v_nofin, v_entity, 'مهندس اختبار بلا مالية', 'P19 plain engineer', v_owner, 'project_wide');

  insert into public.permission_grants (subject_user_id, scope_type, scope_project_id, module, action, effect, granted_by)
  values (v_fin, 'project', v_proj, 'finance', 'view', 'allow', v_owner);
end $$;