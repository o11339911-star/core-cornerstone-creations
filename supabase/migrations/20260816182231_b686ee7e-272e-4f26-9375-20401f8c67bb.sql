-- 1) UPDATE policies: mirror USING into WITH CHECK (post-update scope enforcement)
drop policy if exists "stage_roles_update" on public.stage_roles;
create policy "stage_roles_update" on public.stage_roles for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)))
  with check (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

drop policy if exists "stage_criteria_update" on public.stage_completion_criteria;
create policy "stage_criteria_update" on public.stage_completion_criteria for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)))
  with check (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

drop policy if exists "stage_criteria_results_update" on public.stage_criteria_results;
create policy "stage_criteria_results_update" on public.stage_criteria_results for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)))
  with check (private.can_manage_stage(auth.uid(), stage_id, private.stage_project(stage_id)));

drop policy if exists "site_visits_update" on public.site_visits;
create policy "site_visits_update" on public.site_visits for update to authenticated
  using (visited_by = auth.uid() or private.is_project_insider(auth.uid(), project_id))
  with check (visited_by = auth.uid() or private.is_project_insider(auth.uid(), project_id));

drop policy if exists "visit_locations_update" on public.site_visit_locations;
create policy "visit_locations_update" on public.site_visit_locations for update to authenticated
  using (exists (select 1 from public.site_visits v where v.id = site_visit_locations.visit_id and v.visited_by = auth.uid()))
  with check (exists (select 1 from public.site_visits v where v.id = site_visit_locations.visit_id and v.visited_by = auth.uid()));

drop policy if exists "observations_update" on public.stage_observations;
create policy "observations_update" on public.stage_observations for update to authenticated
  using (private.can_manage_stage(auth.uid(), stage_id, project_id))
  with check (private.can_manage_stage(auth.uid(), stage_id, project_id));

drop policy if exists "actions_update" on public.observation_actions;
create policy "actions_update" on public.observation_actions for update to authenticated
  using (assigned_to = auth.uid() or private.can_manage_stage(auth.uid(), private.observation_stage(observation_id), private.stage_project(private.observation_stage(observation_id))))
  with check (assigned_to = auth.uid() or private.can_manage_stage(auth.uid(), private.observation_stage(observation_id), private.stage_project(private.observation_stage(observation_id))));

-- 2) Narrow EXECUTE on SECURITY DEFINER functions that no anon policy needs
revoke execute on function private.can(uuid, app_module, app_action, uuid, uuid) from anon;
revoke execute on function private.audit_entity_activity_change() from public, anon;
revoke execute on function public.set_listing_archived(uuid, boolean) from anon;
revoke execute on function public.set_listing_context(uuid, uuid, uuid) from anon;
grant execute on function private.can(uuid, app_module, app_action, uuid, uuid) to authenticated, service_role;
grant execute on function public.set_listing_archived(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_listing_context(uuid, uuid, uuid) to authenticated, service_role;

-- 3) Pin search_path on the remaining helper functions (linter 0011)
alter function private.is_valid_saudi_id(text) set search_path = pg_catalog;
alter function private.is_valid_unified_number(text) set search_path = pg_catalog;
alter function private.to_ascii_digits(text) set search_path = pg_catalog;
alter function private.ar_normalize(text) set search_path = pg_catalog;