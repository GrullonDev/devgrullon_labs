import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHyhxZ0ulrmqtxrn6RUEOzTjnVTAhB2eY",
  authDomain: "portfolio-b302f.firebaseapp.com",
  projectId: "portfolio-b302f",
  storageBucket: "portfolio-b302f.firebasestorage.app",
  messagingSenderId: "399657046600",
  appId: "1:399657046600:web:a9e192773ad981592dbe7d",
  measurementId: "G-X8LWT6LPB3",
};

// Reemplaza esto con tu site key real de App Check antes de desplegar a producción:
// Firebase Console → App Check → Apps → DevGrullonLabs → registrar proveedor reCAPTCHA v3.
const RECAPTCHA_SITE_KEY = "REPLACE_WITH_YOUR_RECAPTCHA_V3_SITE_KEY";

export const app = initializeApp(firebaseConfig);

if (RECAPTCHA_SITE_KEY.startsWith("REPLACE_WITH_")) {
  console.error(
    "[DevGrullon Labs] App Check site key sin configurar en firebase-init.js — el chat con IA no funcionará hasta reemplazarla (ver README.md, sección 'Antes de desplegar')."
  );
}

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

isSupported().then((supported) => {
  if (supported) getAnalytics(app);
});

export const functions = getFunctions(app);
