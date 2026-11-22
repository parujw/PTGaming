// ตั้งค่าฝั่งหน้าเว็บ (ไม่มีความลับ ใส่ใน git ได้)
// firebase: วาง Web app config จาก Firebase Console > Project settings > Your apps
//   ถ้าเว้นเป็น null แอปจะเก็บข้อมูลในเครื่องอย่างเดียว ไม่แชร์กับทีม
window.JARVIS_CONFIG = {
  teamId: "fo",            // ต้องตรงกับ TEAM_ID ใน Vercel
  appName: "Jarvis ส่งเวร",
  firebase: null
  // firebase: {
  //   apiKey: "...",
  //   authDomain: "your-project.firebaseapp.com",
  //   projectId: "your-project",
  //   appId: "..."
  // }
};
