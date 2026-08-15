DO $$
DECLARE eids uuid[]; rids uuid[];
BEGIN
  SELECT array_agg(id) INTO eids FROM public.entities WHERE name ILIKE 'P15A%';
  IF eids IS NULL THEN RETURN; END IF;
  SELECT array_agg(id) INTO rids FROM public.reports WHERE entity_id = ANY(eids);
  ALTER TABLE public.report_versions DISABLE TRIGGER USER;
  ALTER TABLE public.reports DISABLE TRIGGER USER;
  IF rids IS NOT NULL THEN
    DELETE FROM public.report_audit_log WHERE report_id = ANY(rids);
    DELETE FROM public.report_assets WHERE report_id = ANY(rids);
    UPDATE public.reports SET current_version_id = NULL WHERE id = ANY(rids);
    DELETE FROM public.report_versions WHERE report_id = ANY(rids);
    DELETE FROM public.reports WHERE id = ANY(rids);
  END IF;
  ALTER TABLE public.report_versions ENABLE TRIGGER USER;
  ALTER TABLE public.reports ENABLE TRIGGER USER;
  DELETE FROM public.report_number_counters WHERE entity_id = ANY(eids);
  DELETE FROM public.entity_seals WHERE entity_id = ANY(eids);
  DELETE FROM public.entity_licenses WHERE entity_id = ANY(eids);
  DELETE FROM public.entity_profiles WHERE entity_id = ANY(eids);
  DELETE FROM public.report_templates WHERE entity_id = ANY(eids);
  DELETE FROM public.projects WHERE entity_id = ANY(eids);
  DELETE FROM public.entity_memberships WHERE entity_id = ANY(eids);
  DELETE FROM public.entities WHERE id = ANY(eids);
END $$;