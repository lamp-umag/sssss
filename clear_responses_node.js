// Script para limpiar respuestas del survey umag usando Node.js
// Ejecutar con: node clear_responses_node.js

const admin = require('firebase-admin');

// Configuración de Firebase (necesitas un archivo de service account)
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearUMAGResponses() {
  try {
    console.log('Iniciando limpieza de respuestas UMAG...');
    
    const responsesRef = db.collection('responses/umag/entries');
    const snapshot = await responsesRef.get();
    
    console.log(`Encontradas ${snapshot.size} respuestas para eliminar`);
    
    if (snapshot.size === 0) {
      console.log('No hay respuestas para eliminar');
      return;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
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
