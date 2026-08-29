/**
 * Firebase bootstrap — đọc config từ .env (VITE_FIREBASE_*).
 * Nếu chưa điền .env, auth screen vẫn hiện nhưng sẽ báo lỗi cấu hình
 * thay vì crash toàn bộ app.
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let auth = null;
let db = null;

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Database ID do người dùng tự đặt trong Console; bỏ trống = database mặc định '(default)'
  const databaseId = env.VITE_FIREBASE_DATABASE_ID;
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
} else {
  console.warn(
    '[Auth] Chưa cấu hình Firebase — điền VITE_FIREBASE_* trong file .env rồi khởi động lại dev server.'
  );
}

export { auth, db };