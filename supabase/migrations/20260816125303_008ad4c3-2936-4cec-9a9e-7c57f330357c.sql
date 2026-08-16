grant usage on schema private to authenticated;
-- Crypto helpers stay unreachable for callers.
revoke execute on function private.identity_key() from anon, authenticated;
revoke execute on function private.encrypt_identity(text) from anon, authenticated;
revoke execute on function private.decrypt_identity(bytea) from anon, authenticated;
revoke execute on function private.log_identity_access(uuid, text, uuid, integer) from anon, authenticated;