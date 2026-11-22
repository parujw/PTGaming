// Team accounts (email + password), for admins only.
// GET  /api/users                                   -> { users: [...] }
// POST /api/users { action: "create", email, password, name, role }
// POST /api/users { action: "password", uid, password }
// POST /api/users { action: "remove", uid }
import { FieldValue } from "firebase-admin/firestore";
import { admin, json, TEAM_ID } from "./_lib.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin(request) {
  const a = admin();
  if (!a) return json({ error: "ยังไม่ได้ตั้ง FIREBASE_SERVICE_ACCOUNT" }, 503);
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "ต้องเข้าสู่ระบบ" }, 401);
  try {
    const tok = await a.auth.verifyIdToken(bearer, true);
    const me = await a.db.doc(`users/${tok.uid}`).get();
    if (!me.exists || me.data().role !== "admin" || me.data().disabled) return json({ error: "เฉพาะผู้ดูแลทีม" }, 403);
    return { a, tok };
  } catch {
    return json({ error: "เข้าสู่ระบบหมดอายุ ลองออกแล้วเข้าใหม่" }, 401);
  }
}

export async function GET(request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const snap = await ctx.a.db.collection("users").where("team", "==", TEAM_ID).get();
  const users = snap.docs.map((d) => {
    const u = d.data();
    return { uid: d.id, email: u.email, name: u.name, role: u.role, disabled: !!u.disabled };
  }).sort((x, y) => (x.disabled - y.disabled) || String(x.name).localeCompare(String(y.name), "th"));
  return json({ users });
}

export async function POST(request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { a, tok } = ctx;
  let b;
  try { b = await request.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const teamRef = a.db.doc(`teams/${TEAM_ID}`);

  if (b?.action === "create") {
    const email = String(b.email || "").trim().toLowerCase();
    const name = String(b.name || "").trim().slice(0, 40);
    const role = b.role === "admin" ? "admin" : "staff";
    const password = String(b.password || "");
    if (!EMAIL.test(email)) return json({ error: "อีเมลไม่ถูกต้อง" }, 400);
    if (!name) return json({ error: "ใส่ชื่อที่จะแสดงในแอป" }, 400);
    if (password.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, 400);
    try {
      const u = await a.auth.createUser({ email, password, displayName: name });
      await a.db.doc(`users/${u.uid}`).set({ email, name, role, team: TEAM_ID, createdAt: Date.now(), createdBy: tok.uid });
      await teamRef.set({ members: FieldValue.arrayUnion(email) }, { merge: true });
      return json({ uid: u.uid });
    } catch (e) {
      if (e.code === "auth/email-already-exists") return json({ error: "อีเมลนี้มีบัญชีอยู่แล้ว" }, 409);
      if (e.code === "auth/invalid-password") return json({ error: "รหัสผ่านสั้นเกินไป" }, 400);
      console.error(e);
      return json({ error: "สร้างบัญชีไม่สำเร็จ" }, 500);
    }
  }

  const uid = String(b?.uid || "");
  if (!uid) return json({ error: "ไม่ระบุบัญชี" }, 400);
  const ref = a.db.doc(`users/${uid}`);
  const doc = await ref.get();
  if (!doc.exists || doc.data().team !== TEAM_ID) return json({ error: "ไม่พบบัญชีนี้ในทีม" }, 404);

  if (b.action === "password") {
    const password = String(b.password || "");
    if (password.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, 400);
    await a.auth.updateUser(uid, { password });
    await a.auth.revokeRefreshTokens(uid);
    return json({ ok: true });
  }

  if (b.action === "remove") {
    if (uid === tok.uid) return json({ error: "ปิดบัญชีของตัวเองไม่ได้" }, 400);
    await a.auth.updateUser(uid, { disabled: true });
    await a.auth.revokeRefreshTokens(uid);
    await ref.set({ disabled: true }, { merge: true });
    await teamRef.set({ members: FieldValue.arrayRemove(doc.data().email) }, { merge: true });
    return json({ ok: true });
  }

  return json({ error: "ไม่รู้จักคำสั่ง" }, 400);
}
