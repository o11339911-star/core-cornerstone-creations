-- legal documents stay readable by visitors (public policy pages)
revoke all on function public.get_legal_document(text) from public;
revoke all on function public.list_legal_documents() from public;
grant execute on function public.get_legal_document(text) to anon, authenticated;
grant execute on function public.list_legal_documents() to anon, authenticated;

-- everything else: signed-in only
revoke all on function public.pending_policy_acceptances() from public, anon;
revoke all on function public.accept_policies(uuid[], text) from public, anon;
revoke all on function public.submit_dsr_request(text, text) from public, anon;
revoke all on function public.list_my_dsr_requests() from public, anon;
revoke all on function public.list_dsr_requests(text) from public, anon;
revoke all on function public.decide_dsr_request(uuid, text, text, text[], jsonb) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.evaluate_erasure_constraints(uuid) from public, anon;
revoke all on function public.publish_legal_version(text, text, text, date, boolean) from public, anon;
revoke all on function public.list_data_processing_register() from public, anon;
revoke all on function public.list_data_incidents() from public, anon;

grant execute on function public.pending_policy_acceptances() to authenticated;
grant execute on function public.accept_policies(uuid[], text) to authenticated;
grant execute on function public.submit_dsr_request(text, text) to authenticated;
grant execute on function public.list_my_dsr_requests() to authenticated;
grant execute on function public.list_dsr_requests(text) to authenticated;
grant execute on function public.decide_dsr_request(uuid, text, text, text[], jsonb) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.evaluate_erasure_constraints(uuid) to authenticated;
grant execute on function public.publish_legal_version(text, text, text, date, boolean) to authenticated;
grant execute on function public.list_data_processing_register() to authenticated;
grant execute on function public.list_data_incidents() to authenticated;