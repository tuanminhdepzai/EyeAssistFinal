// Authentication service logic for EyeAssist using Firebase Auth
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from "firebase/auth";
import { auth, googleProvider } from "./firebase.js";

/**
 * Friendly Vietnamese error mapping for Firebase Auth errors
 */
export function getFriendlyErrorMessage(errorCode, defaultMsg = '') {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Địa chỉ email không hợp lệ.';
    case 'auth/user-disabled':
      return 'Tài khoản này đã bị vô hiệu hóa.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'Email hoặc mật khẩu không chính xác.';
    case 'auth/wrong-password':
      return 'Mật khẩu không chính xác.';
    case 'auth/email-already-in-use':
      return 'Email này đã được đăng ký tài khoản. Vui lòng chuyển sang tab Đăng Nhập.';
    case 'auth/weak-password':
      return 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
    case 'auth/operation-not-allowed':
      return 'Phương thức đăng nhập này chưa được Bật trong Firebase Console (Authentication > Sign-in method).';
    case 'auth/unauthorized-domain':
      return 'Tên miền chưa được cấp phép trong Firebase Console (Authentication > Settings > Authorized domains).';
    case 'auth/popup-closed-by-user':
      return 'Cửa sổ đăng nhập Google đã bị đóng.';
    case 'auth/cancelled-popup-request':
      return 'Cửa sổ Google trước đó đã bị hủy. Vui lòng thử lại.';
    case 'auth/popup-blocked':
      return 'Trình duyệt đã chặn cửa sổ popup. Vui lòng cho phép popup để đăng nhập.';
    case 'auth/network-request-failed':
      return 'Lỗi kết nối mạng hoặc máy chủ Firebase. Vui lòng kiểm tra internet của bạn.';
    case 'auth/too-many-requests':
      return 'Quá nhiều yêu cầu thử lại. Vui lòng thử lại sau ít phút.';
    default:
      return defaultMsg || 'Đã xảy ra lỗi khi xác thực (' + (errorCode || 'Unknown') + '). Vui lòng thử lại.';
  }
}

/**
 * Đăng nhập bằng Email và Mật khẩu
 */
export async function loginWithEmail(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('[EyeAssist Auth Login Error]:', error.code, error.message);
    return { success: false, error: getFriendlyErrorMessage(error.code, error.message), code: error.code };
  }
}

/**
 * Đăng ký tài khoản mới bằng Email và Mật khẩu
 */
export async function registerWithEmail(email, password, displayName = '') {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName && displayName.trim()) {
      await updateProfile(userCredential.user, { displayName: displayName.trim() });
    }
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('[EyeAssist Auth Register Error]:', error.code, error.message);
    return { success: false, error: getFriendlyErrorMessage(error.code, error.message), code: error.code };
  }
}

/**
 * Đăng nhập nhanh bằng Google
 */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return { success: true, user: result.user };
  } catch (error) {
    console.error('[EyeAssist Auth Google Error]:', error.code, error.message);
    return { success: false, error: getFriendlyErrorMessage(error.code, error.message), code: error.code };
  }
}

/**
 * Đăng xuất người dùng hiện tại
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('[EyeAssist Auth Logout Error]:', error);
    return { success: false, error: getFriendlyErrorMessage(error.code, error.message) };
  }
}

/**
 * Gửi email đặt lại mật khẩu
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { success: true, message: 'Đã gửi liên kết khôi phục mật khẩu vào email của bạn.' };
  } catch (error) {
    console.error('[EyeAssist Auth Reset Error]:', error.code, error.message);
    return { success: false, error: getFriendlyErrorMessage(error.code, error.message), code: error.code };
  }
}

/**
 * Lắng nghe thay đổi trạng thái đăng nhập
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

/**
 * Lấy thông tin người dùng hiện tại
 */
export function getCurrentUser() {
  return auth.currentUser;
}
