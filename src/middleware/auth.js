"use strict";

const { admin } = require("../firebase");

async function verifyFirebaseToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (!admin.apps.length) {
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  }
  try {
    const token = auth.slice(7);
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

module.exports = { verifyFirebaseToken };
