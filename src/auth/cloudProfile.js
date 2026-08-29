/**
 * Cloud profile — lưu/tải dữ liệu hiệu chỉnh (calibration) lên Firestore theo từng user.
 *
 * Vị trí lưu: users/{uid}/calibration/profile (subcollection, không đụng profile gốc).
 * Cùng schema với object profileManager.save() trong main.js.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';
import { getCurrentUser } from './auth.js';

function calRef(uid) {
  return doc(db, 'users', uid, 'calibration', 'profile');
}

/** Lưu calibration lên Firestore. Trả false nếu chưa cấu hình/chưa đăng nhập. */
export async function saveCalibrationCloud(data) {
  const user = getCurrentUser();
  if (!firebaseReady || !user || !db) return false;
  // JSON round-trip để loại undefined (Firestore không chấp nhận)
  const clean = JSON.parse(JSON.stringify(data));
  await setDoc(calRef(user.uid), { ...clean, updatedAt: serverTimestamp() });
  return true;
}

/** Tải calibration từ Firestore. Trả null nếu chưa có/chưa đăng nhập/quá 5s. */
export async function loadCalibrationCloud() {
  const user = getCurrentUser();
  if (!firebaseReady || !user || !db) return null;
  // Timeout để loadProfile không treo vĩnh viễn khi database chưa tồn tại (SDK tự retry vô hạn)
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
  const snap = await Promise.race([getDoc(calRef(user.uid)), timeout]);
  return snap.exists() ? snap.data() : null;
}