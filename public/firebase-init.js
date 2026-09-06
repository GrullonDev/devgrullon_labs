import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
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

// Firebase Console → App Check → Apps → DevGrullonLabs → proveedor reCAPTCHA Enterprise.
const RECAPTCHA_SITE_KEY = "6LcA-6wtAAAAALapjfDz_OqSaT1aI3YHA5XoDjax";

export const app = initializeApp(firebaseConfig);

initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

isSupported().then((supported) => {
  if (supported) getAnalytics(app);
});

export const functions = getFunctions(app);
