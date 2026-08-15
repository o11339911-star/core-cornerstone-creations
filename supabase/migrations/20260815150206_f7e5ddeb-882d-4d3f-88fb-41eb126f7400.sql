revoke execute on function public.upsert_integration(text,text,text,text,text,text,text[],jsonb,integer,jsonb,text,integer) from anon;
revoke execute on function public.set_integration_status(text,text) from anon;
revoke execute on function public.begin_integration_request(text,text,text,jsonb,uuid,uuid) from anon;
revoke execute on function public.complete_integration_request(uuid,boolean,jsonb,text) from anon;
revoke execute on function public.list_integrations() from anon;
revoke execute on function public.list_integration_requests(text,integer) from anon;