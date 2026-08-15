revoke execute on function
  public.create_document(uuid,text,text,text,public.doc_visibility),
  public.add_document_version(uuid,text,text,bigint,text,text,text),
  public.link_document(uuid,text,uuid,text),
  public.unlink_document(uuid),
  public.set_document_visibility(uuid,public.doc_visibility,uuid[],uuid[]),
  public.approve_document(uuid,text),
  public.soft_delete_document(uuid,text),
  public.restore_document(uuid)
from public, anon;

grant execute on function
  public.create_document(uuid,text,text,text,public.doc_visibility),
  public.add_document_version(uuid,text,text,bigint,text,text,text),
  public.link_document(uuid,text,uuid,text),
  public.unlink_document(uuid),
  public.set_document_visibility(uuid,public.doc_visibility,uuid[],uuid[]),
  public.approve_document(uuid,text),
  public.soft_delete_document(uuid,text),
  public.restore_document(uuid)
to authenticated;

revoke execute on function
  public.audit_document_change(),
  public.document_version_guard(),
  public.document_version_path_check(),
  public.sync_document_current_version()
from public, anon, authenticated;