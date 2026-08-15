set session_replication_role = replica;

delete from public.observation_reinspections where observation_id in (
  select o.id from public.stage_observations o join public.projects p on p.id=o.project_id where p.name like 'p11%');
delete from public.observation_actions where observation_id in (
  select o.id from public.stage_observations o join public.projects p on p.id=o.project_id where p.name like 'p11%');
delete from public.stage_observations where project_id in (select id from public.projects where name like 'p11%');
delete from public.site_visit_locations where visit_id in (
  select id from public.site_visits where project_id in (select id from public.projects where name like 'p11%'));
delete from public.site_visits where project_id in (select id from public.projects where name like 'p11%');
delete from public.stage_attachments where project_id in (select id from public.projects where name like 'p11%');
delete from public.stage_criteria_results where stage_id in (
  select id from public.project_stages where project_id in (select id from public.projects where name like 'p11%'));
delete from public.stage_completion_criteria where stage_id in (
  select id from public.project_stages where project_id in (select id from public.projects where name like 'p11%'));
delete from public.stage_progress where stage_id in (
  select id from public.project_stages where project_id in (select id from public.projects where name like 'p11%'));
delete from public.stage_roles where stage_id in (
  select id from public.project_stages where project_id in (select id from public.projects where name like 'p11%'));
delete from public.project_party_permissions where party_id in (
  select id from public.project_parties where project_id in (select id from public.projects where name like 'p11%'));
delete from public.project_party_stages where party_id in (
  select id from public.project_parties where project_id in (select id from public.projects where name like 'p11%'));
delete from public.project_parties where project_id in (select id from public.projects where name like 'p11%');
delete from public.permission_grants where scope_project_id in (select id from public.projects where name like 'p11%');
delete from public.project_assignments where project_id in (select id from public.projects where name like 'p11%');
delete from public.project_stages where project_id in (select id from public.projects where name like 'p11%');
delete from public.projects where name like 'p11%';
delete from public.entity_memberships where entity_id in (select id from public.entities where name like 'p11%');
delete from public.entity_invitations where entity_id in (select id from public.entities where name like 'p11%');
delete from public.permission_grants where subject_entity_id in (select id from public.entities where name like 'p11%')
   or scope_entity_id in (select id from public.entities where name like 'p11%');
delete from public.entities where name like 'p11%';
delete from public.permission_audit_log where actor_user_id in (
  select id from auth.users where email like 'p11-%');

set session_replication_role = origin;