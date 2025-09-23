// Script para limpiar respuestas del survey umag usando configuración web
// Ejecutar con: node clear_responses_web.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } = require('firebase/firestore');

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
    
    if (snapshot.size === 0) {
      console.log('No hay respuestas para eliminar');
      return;
    }
    
    // Eliminar en lotes de 500 (límite de Firestore)
    const batchSize = 500;
    const docs = snapshot.docs;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchDocs = docs.slice(i, i + batchSize);
      
      batchDocs.forEach((docSnapshot) => {
        batch.delete(doc(db, 'responses/umag/entries', docSnapshot.id));
      });
      
      await batch.commit();
      console.log(`Eliminado lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(docs.length/batchSize)}`);
    }
    
    console.log(`✅ Eliminadas ${snapshot.size} respuestas exitosamente`);
    
  } catch (error) {
    console.error('❌ Error al limpiar respuestas:', error);
  }
}

clearUMAGResponses().then(() => {
  console.log('Proceso completado');
  process.exit(0);
}).catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});
