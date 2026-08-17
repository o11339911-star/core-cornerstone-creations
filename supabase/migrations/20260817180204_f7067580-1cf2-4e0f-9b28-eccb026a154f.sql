REVOKE EXECUTE ON FUNCTION public.issue_archive_stamp(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_archive_stamp(uuid, text, uuid) TO authenticated;