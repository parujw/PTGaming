// Shared helpers for the API routes. Files starting with "_" are not deployed as routes on Vercel.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const TEAM_ID = process.env.TEAM_ID || "fo";

let adminReady = null;
/** Firebase Admin, or null when FIREBASE_SERVICE_ACCOUNT is not set. */
export function admin() {
  if (adminReady !== null) return adminReady || null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return (adminReady = false) || null;
  try {
    const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
    adminReady = { auth: getAuth(app), db: getFirestore(app) };
  } catch (e) {
    console.error("Firebase Admin init failed:", e.message);
    adminReady = false;
  }
  return adminReady || null;
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Who is calling. Accepts either a Firebase ID token from a team member
 * (Authorization: Bearer <idToken>) or the team PIN (x-team-pin) when TEAM_PIN is set.
 * Returns { name } on success, or a Response to send back on failure.
 */
export async function requireMember(request) {
  const a = admin();
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (a && bearer) {
    try {
      const tok = await a.auth.verifyIdToken(bearer);
      const team = await a.db.doc(`teams/${TEAM_ID}`).get();
      const members = (team.exists && team.data().members) || [];
      if (tok.email && tok.email_verified && members.includes(tok.email.toLowerCase())) {
        return { name: tok.name || tok.email };
      }
      return json({ error: "บัญชีนี้ยังไม่อยู่ในทีม ให้หัวหน้าเพิ่มอีเมลใน Firestore: teams/" + TEAM_ID + ".members" }, 403);
    } catch {
      return json({ error: "เข้าสู่ระบบหมดอายุ ลองออกแล้วเข้าใหม่" }, 401);
    }
  }
  const pin = process.env.TEAM_PIN;
  if (pin && request.headers.get("x-team-pin") === pin) return { name: "PIN" };
  if (!a && !pin) return json({ error: "เซิร์ฟเวอร์ยังไม่ได้ตั้ง TEAM_PIN หรือ FIREBASE_SERVICE_ACCOUNT" }, 503);
  return json({ error: "ต้องเข้าสู่ระบบหรือใส่ PIN ทีมในหน้าตั้งค่า" }, 401);
}
