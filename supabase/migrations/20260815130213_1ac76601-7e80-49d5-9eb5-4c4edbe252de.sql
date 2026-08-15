alter type public.app_module add value if not exists 'marketing';

alter table public.duration_timers drop constraint if exists duration_timers_kind_ck;
alter table public.duration_timers add constraint duration_timers_kind_ck
  check (subject_kind = any (array['request','stage','milestone','retention','warranty','marketing_contract','marketing_license']));

alter table public.permission_audit_log drop constraint if exists permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions','contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts','project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions','observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results','requests','request_messages','property_services','documents','document_versions','document_links','document_audience','reports','report_versions','report_templates','report_assets','report_template_imports','platform_admins','payment_milestones','disbursement_requests','financial_executions','financial_documents','retention_holds','ledger_entries','projects','project_acceptances','project_closure_items','punch_items','warranties','project_reopen_requests','portfolio_entries','platform_queue_item','platform_staff','platform_case_access','platform_breakglass','entity_public_profiles','marketing_profiles','marketing_contracts','marketing_contract_amounts','marketing_versions','marketing_assets','marketing_leads','marketing_packages']));

alter table public.notification_types drop constraint if exists notification_types_target_kind_check;
alter table public.notification_types add constraint notification_types_target_kind_check
  check (target_kind = any (array['request','stage','contract','document','disbursement','financial_document','milestone','retention','membership','warranty','queue_item','breakglass','marketing_version','marketing_contract']));

insert into public.notification_types(code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind)
values
  ('marketing.version_approved','info','in_app', false, false, 'notif.marketing.version_approved.subject','notif.marketing.version_approved.body','marketing_version'),
  ('marketing.contract_terminated','action_required','in_app', true, false, 'notif.marketing.contract_terminated.subject','notif.marketing.contract_terminated.body','marketing_contract')
on conflict (code) do nothing;