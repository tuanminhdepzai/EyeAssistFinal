// Firebase initialization & service exports for EyeAssist
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAop_E-vS4kNYtkZzUmcJioJeK75tbkYHk",
  authDomain: "eyeassist-aa547.firebaseapp.com",
  projectId: "eyeassist-aa547",
  storageBucket: "eyeassist-aa547.firebasestorage.app",
  messagingSenderId: "80806552305",
  appId: "1:80806552305:web:137d63202bc0d5b8143f50",
  measurementId: "G-DVV3PJF9H1"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth & Google Provider
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Analytics if supported in environment
export let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
}).catch(() => {});
