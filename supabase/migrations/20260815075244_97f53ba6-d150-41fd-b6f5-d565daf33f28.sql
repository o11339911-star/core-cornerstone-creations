CREATE POLICY "report assets insertable by report editors"
ON public.report_assets FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND private.can_access_report(auth.uid(), report_id, 'update'::app_action));

CREATE POLICY "report assets deletable by report editors"
ON public.report_assets FOR DELETE TO authenticated
USING (private.can_access_report(auth.uid(), report_id, 'update'::app_action));