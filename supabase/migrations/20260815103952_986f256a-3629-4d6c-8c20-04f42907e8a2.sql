do $$
declare v_owner uuid; v_project uuid; v_doc uuid; r uuid; n int;
begin
  select id into v_owner from auth.users where email='p17a-owner@example.com';
  select id into v_project from public.projects where code='P17A-001';
  select id into v_doc from public.financial_documents where doc_number='P17A-INV-1';
  r := private.emit_notification(v_owner,'finance.document_status',v_project,null,'financial_document',v_doc,
       jsonb_build_object('document_id',v_doc,'status','cancelled'),'cancelled','info');
  select count(*) into n from public.notifications where recipient_user_id=v_owner and type_code='finance.document_status';
  raise notice 'suppressed_result=% total_finance_notifications=%', coalesce(r::text,'NULL'), n;
end $$;