DO $$
DECLARE eids uuid[]; rids uuid[];
BEGIN
  SELECT array_agg(id) INTO eids FROM public.entities WHERE name ILIKE 'P15A%';
  IF eids IS NULL THEN RETURN; END IF;
  SELECT array_agg(id) INTO rids FROM public.reports WHERE entity_id = ANY(eids);
  IF rids IS NULL THEN RETURN; END IF;
  ALTER TABLE public.report_versions DISABLE TRIGGER USER;
  ALTER TABLE public.reports DISABLE TRIGGER USER;
  DELETE FROM public.report_audit_log WHERE report_id = ANY(rids);
  DELETE FROM public.report_assets WHERE report_id = ANY(rids);
  UPDATE public.reports SET current_version_id = NULL WHERE id = ANY(rids);
  DELETE FROM public.report_versions WHERE report_id = ANY(rids);
  DELETE FROM public.reports WHERE id = ANY(rids);
  ALTER TABLE public.report_versions ENABLE TRIGGER USER;
  ALTER TABLE public.reports ENABLE TRIGGER USER;
  DELETE FROM public.report_number_counters WHERE entity_id = ANY(eids);
END $$;