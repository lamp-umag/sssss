// Config del proyecto Firebase compartido con el resto del repo (sssss-e8013):
// mismo proyecto que usan encuestas/ (js/firebaseClient.js) y cuantieval/ (app.js).
// Es una clave de cliente, no un secreto: la protección real vive en firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCq05NElKm-01Xyraj6qdF31IgOLf8gQbA",
  authDomain: "sssss-e8013.firebaseapp.com",
  projectId: "sssss-e8013",
  storageBucket: "sssss-e8013.firebasestorage.app",
  messagingSenderId: "765571239773",
  appId: "1:765571239773:web:39ea76d035d314cdd4a2b4"
};

// Único correo con acceso a admin.html. También está codificado en
// firestore.rules (función esAdmin) — si cambia, hay que actualizar los dos lados.
export const ADMIN_EMAIL = "hermanelgueta@gmail.com";
export const DOMINIO_INSTITUCIONAL = "umag.cl";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Cache local persistente (IndexedDB): si se corta la red a mitad de clase,
// lo escrito sigue ahí y se sincroniza solo al volver la conexión.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
});
