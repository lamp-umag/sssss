import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCq05NElKm-01Xyraj6qdF31IgOLf8gQbA",
  authDomain: "sssss-e8013.firebaseapp.com",
  projectId: "sssss-e8013",
  storageBucket: "sssss-e8013.firebasestorage.app",
  messagingSenderId: "765571239773",
  appId: "1:765571239773:web:39ea76d035d314cdd4a2b4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
