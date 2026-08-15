DROP POLICY IF EXISTS projects_select_scope ON public.projects;

CREATE POLICY projects_select_scope ON public.projects
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND (
    owner_id = (SELECT auth.uid())
    OR (
      entity_id IS NOT NULL
      AND (
        private.has_role((SELECT auth.uid()), entity_id, 'owner'::public.app_role)
        OR private.has_role((SELECT auth.uid()), entity_id, 'admin'::public.app_role)
        OR private.has_role((SELECT auth.uid()), entity_id, 'manager'::public.app_role)
      )
    )
    OR private.has_project_assignment((SELECT auth.uid()), id)
    OR private.can((SELECT auth.uid()), 'projects'::public.app_module, 'view'::public.app_action, entity_id, id)
  )
);