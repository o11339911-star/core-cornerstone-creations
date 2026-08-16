do $$
declare
  v_entities uuid[];
  v_projects uuid[];
  v_users uuid[];
  v_drawings uuid[];
  v_docs uuid[];
  v_versions uuid[];
  v_requests uuid[];
  v_threads uuid[];
begin
  set local session_replication_role = 'replica';

  select coalesce(array_agg(id), '{}') into v_entities from public.entities where name like 'TEST-28R%';
  select coalesce(array_agg(id), '{}') into v_users from auth.users where email like 'p28r-%';
  select coalesce(array_agg(id), '{}') into v_projects from public.projects
    where name like 'TEST-28R%' or (entity_id = any(v_entities));
  select coalesce(array_agg(id), '{}') into v_drawings from public.drawing_records
    where project_id = any(v_projects) or owner_entity_id = any(v_entities);
  select coalesce(array_agg(id), '{}') into v_docs from public.documents
    where owner_entity_id = any(v_entities);
  select coalesce(array_agg(id), '{}') into v_versions from public.document_versions where document_id = any(v_docs);
  select coalesce(array_agg(id), '{}') into v_requests from public.requests where project_id = any(v_projects);
  select coalesce(array_agg(id), '{}') into v_threads from public.correspondence_threads
    where project_id = any(v_projects)
       or id in (select thread_id from public.requests where id = any(v_requests) and thread_id is not null);

  delete from storage.objects o
   where o.bucket_id in ('cad-originals', 'documents')
     and exists (select 1 from unnest(v_entities) e where o.name like e::text || '/%');

  delete from public.drawing_markups where drawing_id = any(v_drawings);
  delete from public.drawing_status_events where drawing_id = any(v_drawings);
  delete from public.drawing_conversion_jobs where drawing_id = any(v_drawings);
  delete from public.drawing_viewer_state where drawing_id = any(v_drawings);
  delete from public.drawing_version_meta where drawing_id = any(v_drawings);
  delete from public.drawing_records where id = any(v_drawings);

  delete from public.correspondence_message_attachments a
   using public.correspondence_messages m where a.message_id = m.id and m.thread_id = any(v_threads);
  delete from public.correspondence_message_audience a
   using public.correspondence_messages m where a.message_id = m.id and m.thread_id = any(v_threads);
  delete from public.correspondence_messages where thread_id = any(v_threads);
  delete from public.correspondence_threads where id = any(v_threads);
  delete from public.service_request_details where request_id = any(v_requests);
  delete from public.requests where id = any(v_requests);

  delete from public.document_audience where document_id = any(v_docs);
  delete from public.document_links where document_id = any(v_docs);
  delete from public.document_versions where id = any(v_versions);
  delete from public.documents where id = any(v_docs);

  delete from public.stage_criteria_results where stage_id in (select id from public.project_stages where project_id = any(v_projects));
  delete from public.stage_completion_criteria where stage_id in (select id from public.project_stages where project_id = any(v_projects));
  delete from public.stage_attachments where stage_id in (select id from public.project_stages where project_id = any(v_projects));
  delete from public.stage_progress where stage_id in (select id from public.project_stages where project_id = any(v_projects));
  delete from public.stage_dependencies where project_id = any(v_projects);
  delete from public.stage_roles where stage_id in (select id from public.project_stages where project_id = any(v_projects));
  delete from public.project_stages where project_id = any(v_projects);
  delete from public.project_parties where project_id = any(v_projects);
  delete from public.project_assignments where project_id = any(v_projects);
  delete from public.notifications where project_id = any(v_projects);
  delete from public.projects where id = any(v_projects);

  delete from public.entity_invitations where entity_id = any(v_entities);
  delete from public.entity_memberships where entity_id = any(v_entities);
  delete from public.entity_profiles where entity_id = any(v_entities);
  delete from public.entity_public_profiles where entity_id = any(v_entities);
  delete from public.entities where id = any(v_entities);

  delete from public.notification_preferences where user_id = any(v_users);
  delete from public.policy_acceptances where user_id = any(v_users);
  delete from public.profiles where id = any(v_users);
end $$;