import { signInWithIdentifier } from "../src/lib/auth-identity.server";
const r = await signInWithIdentifier("1150110474", "wrong-password-xyz-000");
console.log("byId:", JSON.stringify(r));
