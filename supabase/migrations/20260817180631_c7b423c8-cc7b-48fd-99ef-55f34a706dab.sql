RESET ROLE;

DROP FUNCTION IF EXISTS test_issue_archive_stamp();
DROP TABLE IF EXISTS _test_archive_stamp_results;

CREATE TABLE _test_archive_stamp_results (
  test text PRIMARY KEY,
  result text
);

DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.issue_archive_stamp('665fcb77-1dd8-4408-b36a-0d9a1f96081c'::uuid, '0000000000000000000000000000000000000000000000000000000000000000', null);
    INSERT INTO _test_archive_stamp_results VALUES ('anon_call', 'UNEXPECTED success');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _test_archive_stamp_results VALUES ('anon_call', 'denied as expected');
  WHEN OTHERS THEN
    INSERT INTO _test_archive_stamp_results VALUES ('anon_call', 'other error: ' || SQLERRM);
  END;
  RESET ROLE;
END $$;
RESET ROLE;

DO $$
DECLARE v_result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '6a94d19a-9ca4-4d8d-8ae3-dadc14aaa731', true);
  BEGIN
    v_result := public.issue_archive_stamp('665fcb77-1dd8-4408-b36a-0d9a1f96081c'::uuid, '0000000000000000000000000000000000000000000000000000000000000000', null);
    RAISE EXCEPTION 'INTENTIONAL_ROLLBACK' USING ERRCODE='P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    INSERT INTO _test_archive_stamp_results VALUES ('auth_authorized', 'success and rolled back: ' || v_result::text);
  WHEN OTHERS THEN
    INSERT INTO _test_archive_stamp_results VALUES ('auth_authorized', 'error: ' || SQLERRM);
  END;
  RESET ROLE;
END $$;
RESET ROLE;

DO $$
DECLARE v_result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  BEGIN
    v_result := public.issue_archive_stamp('665fcb77-1dd8-4408-b36a-0d9a1f96081c'::uuid, '0000000000000000000000000000000000000000000000000000000000000000', null);
    INSERT INTO _test_archive_stamp_results VALUES ('auth_unauthorized', 'UNEXPECTED success: ' || v_result::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _test_archive_stamp_results VALUES ('auth_unauthorized', 'denied as expected: ' || SQLERRM);
  END;
  RESET ROLE;
END $$;
RESET ROLE;