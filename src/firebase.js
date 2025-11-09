// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBswwm4BvxE1feNB6Vp5oqZbUODX4jvEZ0",
  authDomain: "flowdesk-3d35b.firebaseapp.com",
  projectId: "flowdesk-3d35b",
  storageBucket: "flowdesk-3d35b.firebasestorage.app",
  messagingSenderId: "61947084839",
  appId: "1:61947084839:web:ac467b24c5de110e454e02",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
