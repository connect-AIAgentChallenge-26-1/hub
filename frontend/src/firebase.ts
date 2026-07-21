import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDuIy_9P_oB4omGS0IQPJKU9lqQ4Fd1RX0",
  authDomain: "ai-challenge-d37b2.firebaseapp.com",
  projectId: "ai-challenge-d37b2",
  storageBucket: "ai-challenge-d37b2.firebasestorage.app",
  messagingSenderId: "873941659363",
  appId: "1:873941659363:web:dd6a93f71a383daf921fd6",
  measurementId: "G-R9LH47D9WL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
