revoke execute on function public.post_deal_message(uuid, text, text) from anon;
revoke execute on function public.attach_deal_message_file(uuid, text, text, text, bigint) from anon;
revoke execute on function public.link_deal_project(uuid, uuid) from anon;
revoke execute on function public.link_deal_resubmission(uuid, uuid) from anon;
revoke execute on function public.respond_contracting_deal(uuid, boolean, text) from anon;