// Script para limpiar respuestas del survey umag
// Ejecutar con: node clear_responses.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCq05NElKm-01Xyraj6qdF31IgOLf8gQbA",
  authDomain: "sssss-e8013.firebaseapp.com",
  projectId: "sssss-e8013",
  storageBucket: "sssss-e8013.firebasestorage.app",
  messagingSenderId: "765571239773",
  appId: "1:765571239773:web:39ea76d035d314cdd4a2b4",
  measurementId: "G-1JDBES8EE2",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearUMAGResponses() {
  try {
    console.log('Iniciando limpieza de respuestas UMAG...');
    
    const responsesRef = collection(db, 'responses/umag/entries');
    const snapshot = await getDocs(responsesRef);
    
    console.log(`Encontradas ${snapshot.size} respuestas para eliminar`);
    
    const deletePromises = [];
    snapshot.forEach((docSnapshot) => {
      deletePromises.push(deleteDoc(doc(db, 'responses/umag/entries', docSnapshot.id)));
    });
    
    await Promise.all(deletePromises);
    
    console.log(`✅ Eliminadas ${snapshot.size} respuestas exitosamente`);
    
  } catch (error) {
    console.error('❌ Error al limpiar respuestas:', error);
  }
}

clearUMAGResponses();
