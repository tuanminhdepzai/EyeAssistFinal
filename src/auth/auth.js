/**
 * Auth flow — email/password + Google, lưu profile user vào Firestore.
 *
 * Public API:
 *   onAuthReady(cb)  — cb(user) khi đăng nhập thành công (user = FirebaseUser + profile)
 *   logout()
 *
 * UI: #auth-screen trong index.html (2 mode: login / register, chuyển bằng tab).
 */
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from './firebase.js';

// ============ ERROR MAPPING (tiếng Việt, theo Firebase error code) ============
const ERROR_VI = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/email-already-in-use': 'Email này đã được đăng ký. Hãy đăng nhập.',
  'auth/weak-password': 'Mật khẩu quá yếu — cần tối thiểu 6 ký tự.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
  'auth/wrong-password': 'Mật khẩu không đúng.',
  'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng đợi một lát.',
  'auth/network-request-failed': 'Lỗi mạng — kiểm tra kết nối internet.',
  'auth/popup-closed-by-user': 'Cửa sổ Google đã bị đóng. Thử lại.',
  'auth/cancelled-popup-request': 'Cửa sổ Google đã bị đóng. Thử lại.',
  'auth/popup-blocked': 'Trình duyệt chặn cửa sổ popup. Hãy cho phép popup rồi thử lại.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase Console.',
  'auth/invalid-api-key': 'API key không hợp lệ — kiểm tra lại VITE_FIREBASE_API_KEY trong .env.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'API key không hợp lệ — kiểm tra lại VITE_FIREBASE_API_KEY trong .env.',
  'auth/configuration-not-found': 'Cấu hình Firebase không đúng — kiểm tra VITE_FIREBASE_AUTH_DOMAIN trong .env.',
};

const toMessage = (err) => ERROR_VI[err?.code] || `Lỗi: ${err?.message || 'không xác định'}`;

// ============ DOM ============
const $ = (id) => document.getElementById(id);
let dom = {};

// ============ PUBLIC ============
const readyCallbacks = [];
let currentUser = null;

/** Đăng ký callback nhận user sau khi đăng nhập. Chạy ngay nếu đã có session. */
export function onAuthReady(cb) {
  if (currentUser) cb(currentUser);
  else readyCallbacks.push(cb);
}

export function logout() {
  if (auth) signOut(auth);
}

export function getCurrentUser() {
  return currentUser;
}

// ============ FIRESTORE PROFILE ============
async function ensureProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const profile = snap.exists()
    ? snap.data()
    : {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || '',
        provider: user.providerData?.[0]?.providerId || 'password',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

  // Luôn cập nhật lastLoginAt (+ thông tin mới nhất từ provider)
  await setDoc(
    ref,
    {
      ...profile,
      displayName: user.displayName || profile.displayName || '',
      email: user.email || profile.email || null,
      photoURL: user.photoURL || profile.photoURL || null,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );

  return { ...profile, displayName: user.displayName || profile.displayName || '', email: user.email };
}

/** Lưu profile chạy nền — Firestore lỗi/chưa tạo database thì chỉ warn, không block UI. */
function saveProfileBg(user) {
  ensureProfile(user).catch((e) =>
    console.warn('[Auth] Không lưu được profile Firestore:', e.message)
  );
}

// ============ AUTH ACTIONS ============
async function handleRegister(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  // Dùng object local vì displayName trên Firebase User là readonly
  const localUser = { ...cred.user, displayName: cred.user.displayName || name };
  saveProfileBg(localUser);
}

async function handleLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  saveProfileBg(cred.user);
}

async function handleGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  saveProfileBg(cred.user);
}

// ============ UI HELPERS ============
function setBusy(btn, busy, busyLabel) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = busyLabel || 'Đang xử lý...';
    btn.disabled = true;
  } else {
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = false;
  }
}

function showError(msg) {
  if (!dom.authError) return;
  if (dom.authErrorText) dom.authErrorText.textContent = msg;
  dom.authError.hidden = !msg;
}

function switchMode(mode) {
  const isLogin = mode === 'login';
  if (dom.authForm) dom.authForm.dataset.mode = mode;
  if (dom.nameField) dom.nameField.hidden = isLogin;
  if (dom.authTitle) dom.authTitle.textContent = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
  if (dom.authSubmit) dom.authSubmit.textContent = isLogin ? 'Đăng nhập' : 'Đăng ký';
  if (dom.switchHint) {
    dom.switchHint.innerHTML = isLogin
      ? 'Chưa có tài khoản? <button type="button" id="auth-switch-link">Đăng ký</button>'
      : 'Đã có tài khoản? <button type="button" id="auth-switch-link">Đăng nhập</button>';
    const link = $('auth-switch-link');
    if (link) link.addEventListener('click', () => switchMode(isLogin ? 'register' : 'login'));
  }
  showError('');
}

function renderUserChip(user) {
  if (!dom.userChip) return;
  const name = user.displayName || user.email || 'Người dùng';
  if (dom.userName) dom.userName.textContent = name;
  if (dom.userAvatar) {
    if (user.photoURL) {
      dom.userAvatar.innerHTML = `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer" />`;
    } else {
      const initial = (name.trim()[0] || 'U').toUpperCase();
      dom.userAvatar.textContent = initial;
    }
  }
  dom.userChip.hidden = false;
}

function hideAuthScreen() {
  if (dom.authScreen) dom.authScreen.classList.add('hidden');
}

function showAuthScreen() {
  if (dom.authScreen) dom.authScreen.classList.remove('hidden');
  if (dom.userChip) dom.userChip.hidden = true;
  // Loading screen (z-index cao hơn) không được che màn đăng nhập
  const loading = document.getElementById('loading-screen');
  if (loading) loading.classList.add('hidden');
}

// ============ INIT ============
export function initAuth() {
  dom = {
    authScreen: $('auth-screen'),
    authForm: $('auth-form'),
    authTitle: $('auth-title'),
    nameField: $('auth-name-field'),
    nameInput: $('auth-name'),
    emailInput: $('auth-email'),
    passwordInput: $('auth-password'),
    authSubmit: $('auth-submit'),
    authError: $('auth-error'),
    googleBtn: $('auth-google'),
    authErrorText: $('auth-error-text'),
    switchHint: $('auth-switch-hint'),
    userChip: $('user-chip'),
    userName: $('user-name'),
    userAvatar: $('user-avatar'),
    logoutBtn: $('btn-logout'),
  };

  if (!firebaseReady) {
    showError('Chưa cấu hình Firebase. Điền VITE_FIREBASE_* trong file .env rồi khởi động lại dev server (xem hướng dẫn trong tin nhắn hoặc README).');
    if (dom.authSubmit) dom.authSubmit.disabled = true;
    if (dom.googleBtn) dom.googleBtn.disabled = true;
    return;
  }

  switchMode('login');

  if (dom.authForm) {
    dom.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      showError('');
      const mode = dom.authForm.dataset.mode || 'login';
      const email = dom.emailInput.value.trim();
      const password = dom.passwordInput.value;
      const name = dom.nameInput ? dom.nameInput.value.trim() : '';

      setBusy(dom.authSubmit, true);
      try {
        if (mode === 'register') await handleRegister(name, email, password);
        else await handleLogin(email, password);
      } catch (err) {
        showError(toMessage(err));
      } finally {
        setBusy(dom.authSubmit, false);
      }
    });
  }

  if (dom.googleBtn) {
    dom.googleBtn.addEventListener('click', async () => {
      showError('');
      setBusy(dom.googleBtn, true, 'Đang mở Google...');
      try {
        await handleGoogle();
      } catch (err) {
        showError(toMessage(err));
      } finally {
        setBusy(dom.googleBtn, false);
      }
    });
  }

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener('click', () => logout());
  }

  // Session listener — chạy khi đăng nhập/đăng xuất/refresh trang
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // Không await Firestore: database chưa tạo/lỗi mạng thì UI vẫn phải vào được app
      const merged = { ...user, displayName: user.displayName || user.email };
      currentUser = merged;
      renderUserChip(merged);
      hideAuthScreen();
      readyCallbacks.forEach((cb) => cb(merged));
      readyCallbacks.length = 0;
      saveProfileBg(user);
    } else {
      currentUser = null;
      showAuthScreen();
    }
  });
}