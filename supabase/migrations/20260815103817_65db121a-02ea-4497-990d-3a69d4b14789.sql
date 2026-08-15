do $$
declare v_req uuid; v_doc uuid; v_project uuid; v_assignee uuid; v_susp uuid; a uuid; b uuid;
begin
  select id into v_project from public.projects where code='P17A-001';
  select id into v_req from public.requests where subject='p17a-request';
  select id into v_doc from public.financial_documents where doc_number='P17A-INV-1';
  select id into v_assignee from auth.users where email='p17a-assignee@example.com';
  select id into v_susp from auth.users where email='p17a-suspended@example.com';

  update public.requests set status='submitted' where id=v_req;
  update public.financial_documents set status='issued' where id=v_doc;

  -- duplicate emission attempt with identical arguments
  a := private.emit_notification(v_assignee,'request.submitted',v_project,null,'request',v_req,
        jsonb_build_object('request_id',v_req,'status','submitted'),'submitted','info');
  b := private.emit_notification(v_assignee,'request.submitted',v_project,null,'request',v_req,
        jsonb_build_object('request_id',v_req,'status','submitted'),'submitted','info');
  raise notice 'dup attempts: % %', a, b;

  update public.entity_memberships m set status='suspended'
   where m.user_id=v_susp and m.entity_id=(select id from public.entities where name='p17a-entity');
end $$;