alter table public.permission_audit_log drop constraint if exists permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array[
    'membership','grant','project_party','contracts','contract_versions','contract_version_amounts',
    'contract_parties','contract_extensions','change_orders','change_order_amounts','project_stages',
    'stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience','reports','report_versions','report_templates','report_assets',
    'report_template_imports','platform_admins','payment_milestones','disbursement_requests',
    'financial_executions','financial_documents','retention_holds','ledger_entries','projects',
    'project_acceptances','project_closure_items','punch_items','warranties','project_reopen_requests',
    'portfolio_entries',
    'platform_queue_item','platform_staff','platform_case_access','platform_breakglass'
  ]));