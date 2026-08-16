revoke execute on function public.link_personal_identity(text) from anon;
revoke execute on function public.get_my_identity_status() from anon;
revoke execute on function public.admin_search_identities(text) from anon;
revoke execute on function public.lookup_identity_for_contract(uuid, text) from anon;
revoke execute on function public.add_contract_person_party(uuid, uuid, text) from anon;