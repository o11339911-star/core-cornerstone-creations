import { findUserByNationalId } from "../src/lib/identity-crypto.server";
const uid = await findUserByNationalId("1150110474");
console.log("resolved:", uid ? "FOUND" : "NONE");
const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
if (uid) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(uid);
  console.log("adminGet:", error ? "ERR "+error.message : (data.user?.email ? "HAS_EMAIL" : "NO_EMAIL"));
}
