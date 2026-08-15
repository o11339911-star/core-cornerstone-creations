do $$
declare
  v_users uuid[];
  v_ents uuid[];
  v_projs uuid[];
  v_props uuid[];
  v_reqs uuid[];
  v_threads uuid[];
begin
  perform set_config('rakeez.service_link', 'on', true);
  alter table public.requests disable trigger user;
  alter table public.permission_audit_log disable trigger user;
  alter table public.entity_memberships disable trigger user;
  alter table public.property_services disable trigger user;

  select coalesce(array_agg(id), '{}') into v_users from auth.users where email like 'p13-%';
  select coalesce(array_agg(id), '{}') into v_ents from public.entities where name like 'p13-%';
  select coalesce(array_agg(id), '{}') into v_projs from public.projects where name like 'p13-%' or entity_id = any(v_ents);
  select coalesce(array_agg(id), '{}') into v_props from public.properties where name like 'p13-%' or entity_id = any(v_ents);
  select coalesce(array_agg(id), '{}') into v_reqs from public.requests where project_id = any(v_projs);
  select coalesce(array_agg(id), '{}') into v_threads from public.correspondence_threads where project_id = any(v_projs);

  delete from public.correspondence_message_attachments where message_id in (select id from public.correspondence_messages where thread_id = any(v_threads));
  delete from public.correspondence_message_audience where message_id in (select id from public.correspondence_messages where thread_id = any(v_threads));
  delete from public.correspondence_messages where thread_id = any(v_threads);
  delete from public.service_request_details where request_id = any(v_reqs);
  delete from public.requests where id = any(v_reqs);
  delete from public.correspondence_threads where id = any(v_threads);
  delete from public.property_services where property_id = any(v_props);
  delete from public.property_exact_locations where property_id = any(v_props);
  delete from public.property_units where property_id = any(v_props);
  delete from public.property_projects where property_id = any(v_props) or project_id = any(v_projs);
  delete from public.property_owners where property_id = any(v_props);
  delete from public.properties where id = any(v_props);
  delete from public.project_stages where project_id = any(v_projs);
  delete from public.project_assignments where project_id = any(v_projs);
  delete from public.project_parties where project_id = any(v_projs);
  delete from public.projects where id = any(v_projs);
  delete from public.permission_grants where subject_user_id = any(v_users) or granted_by = any(v_users);
  delete from public.permission_audit_log where actor_user_id = any(v_users) or object_id = any(v_reqs);
  delete from public.entity_invitations where entity_id = any(v_ents);
  delete from public.entity_memberships where entity_id = any(v_ents) or user_id = any(v_users);
  delete from public.entities where id = any(v_ents);
  delete from public.profiles where id = any(v_users);
  delete from auth.users where id = any(v_users);

  perform set_config('rakeez.service_link', 'off', true);
  alter table public.requests enable trigger user;
  alter table public.permission_audit_log enable trigger user;
  alter table public.entity_memberships enable trigger user;
  alter table public.property_services enable trigger user;
end $$;