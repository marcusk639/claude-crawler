"use strict";

const admin = require("firebase-admin");

function init() {
  if (admin.apps.length > 0) return; // already initialized

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.warn(
      "Firebase env vars not set — user accounts and saved tools are disabled",
    );
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Railway stores multiline env vars with literal \n — normalize them
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

init();

const db = admin.apps.length > 0 ? admin.firestore() : null;

module.exports = { admin, db };
