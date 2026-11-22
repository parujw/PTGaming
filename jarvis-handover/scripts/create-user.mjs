// Create (or update) a team account from the command line. Use it once for the first admin;
// after that, admins add people from the app (ตั้งค่า > จัดการทีม).
//
//   FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)" TEAM_ID=fo \
//     node scripts/create-user.mjs <email> <password> "<display name>" [admin|staff]
//
// The password is never written to any file.
import { FieldValue } from "firebase-admin/firestore";
import { admin, TEAM_ID } from "../api/_lib.js";

const [emailArg, password, name, roleArg] = process.argv.slice(2);
const email = String(emailArg || "").trim().toLowerCase();
const role = roleArg === "staff" ? "staff" : "admin";
if (!email || !password || !name) {
  console.error('ใช้: node scripts/create-user.mjs <email> <password> "<ชื่อ>" [admin|staff]');
  process.exit(1);
}
if (password.length < 6) {
  console.error("Firebase ต้องการรหัสผ่านอย่างน้อย 6 ตัว");
  process.exit(1);
}
const a = admin();
if (!a) {
  console.error("ตั้ง FIREBASE_SERVICE_ACCOUNT ก่อน (JSON ของ service account)");
  process.exit(1);
}

let user;
try {
  user = await a.auth.getUserByEmail(email);
  await a.auth.updateUser(user.uid, { password, displayName: name, disabled: false });
  console.log("อัปเดตบัญชีเดิม:", email);
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  user = await a.auth.createUser({ email, password, displayName: name });
  console.log("สร้างบัญชีใหม่:", email);
}
await a.db.doc(`users/${user.uid}`).set({ email, name, role, team: TEAM_ID, disabled: false, createdAt: Date.now() }, { merge: true });
await a.db.doc(`teams/${TEAM_ID}`).set({ members: FieldValue.arrayUnion(email) }, { merge: true });
console.log(`เรียบร้อย: ${name} (${role}) อยู่ในทีม ${TEAM_ID}`);
process.exit(0);
