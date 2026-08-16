grant execute on function public.list_link_candidate_projects(uuid, text, int, int) to service_role, postgres;
grant execute on function public.list_link_candidate_properties(uuid, text, int, int) to service_role, postgres;
grant execute on function public.link_property_project(uuid, uuid, text) to service_role, postgres;
grant execute on function private.effective_link_contract(uuid, uuid, boolean, boolean) to service_role, postgres;