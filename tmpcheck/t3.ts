import { subjectHmac } from "../src/lib/subject-hash.server";
console.log("login key:", `login:${subjectHmac("1150110474").slice(0,32)}`);
