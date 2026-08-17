RESET ROLE;

CREATE OR REPLACE FUNCTION test_issue_archive_stamp()
RETURNS TABLE(test text, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- anon: should be denied at grant level
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.issue_archive_stamp('665fcb77-1dd8-4408-b36a-0d9a1f96081c'::uuid, '0000000000000000000000000000000000000000000000000000000000000000', null);
    test := 'anon_call'; result := 'UNEXPECTED success'; RETURN NEXT;
  EXCEPTION WHEN insufficient_privilege THEN
    test := 'anon_call'; result := 'denied as expected'; RETURN NEXT;
  WHEN OTHERS THEN
    test := 'anon_call'; result := 'other error: ' || SQLERRM; RETURN NEXT;
  END;
  RESET ROLE;

  -- authenticated owner: should succeed; rollback the stamp write
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '6a94d19a-9ca4-4d8d-8ae3-dadc14aaa731', true);
  BEGIN
    v_result := public.issue_archive_stamp('665fcb77-1dd8-4408-b36a-0d9a1f96081c'::uuid, '0000000000000000000000000000000000000000000000000000000000000000', null);
    RAISE EXCEPTION 'INTENTIONAL_ROLLBACK' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    test := 'auth_authorized'; result := 'success and rolled back: ' || v_result::text; RETURN NEXT;
  WHEN OTHERS THEN
    test := 'auth_authorized'; result := 'error: ' || SQLERRM; RETURN NEXT;
  END;
  RESET ROLE;

  -- authenticated non-owner: should be rejected by scope check
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  BEGIN
    v_result := public.issue_archive_stamp('665fcb77-1dd8-4408-b36a-0d9a1f96081c'::uuid, '0000000000000000000000000000000000000000000000000000000000000000', null);
    test := 'auth_unauthorized'; result := 'UNEXPECTED success: ' || v_result::text; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'auth_unauthorized'; result := 'denied as expected: ' || SQLERRM; RETURN NEXT;
  END;
  RESET ROLE;
END;
$$;

REVOKE EXECUTE ON FUNCTION test_issue_archive_stamp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION test_issue_archive_stamp() TO authenticated, service_role;