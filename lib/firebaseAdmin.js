const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Mêmes identifiants de service que côté site (Next.js) : même projet Firebase,
// juste un contexte d'exécution différent (Pi vs Vercel). Ces variables doivent
// être définies dans le .env du bot (mêmes valeurs que sur Vercel).
// NB: firebase-admin v14 utilise l'API modulaire (plus de admin.apps / admin.firestore()).
if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

module.exports = { db, FieldValue };