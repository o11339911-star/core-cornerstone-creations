do $$
declare
  v_project uuid;
  v_owner uuid;
  v_property uuid;
  v_res jsonb;
begin
  select id, owner_id into v_project, v_owner
    from public.projects where deleted_at is null order by created_at desc limit 1;
  if v_project is null then
    raise notice 'IDENTITY-CHECK: no projects to test';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  v_res := public.project_identity(v_project);
  raise notice 'IDENTITY-CHECK project groups: %', (select string_agg(k, ',') from jsonb_object_keys(v_res->'groups') k);

  select property_id into v_property from public.property_projects where project_id = v_project limit 1;
  if v_property is null then
    select id into v_property from public.properties where deleted_at is null order by created_at desc limit 1;
  end if;
  if v_property is not null then
    begin
      v_res := public.property_identity(v_property);
      raise notice 'IDENTITY-CHECK property ok: %', v_res->'primary_project_id';
    exception when insufficient_privilege then
      raise notice 'IDENTITY-CHECK property denied (expected for unrelated caller)';
    end;
  end if;
end $$;