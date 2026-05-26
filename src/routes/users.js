"use strict";

const { Router } = require("express");
const { db } = require("../firebase");
const { verifyFirebaseToken } = require("../middleware/auth");

const router = Router();

router.use(verifyFirebaseToken);

function validateSaveBody({ toolId, name }) {
  if (!toolId || typeof toolId !== "string" || toolId.trim().length === 0) {
    return "toolId is required";
  }
  if (toolId.length > 200) return "toolId must be 200 characters or fewer";
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return "name is required";
  }
  return null;
}

// GET /api/user/saved-tools
router.get("/saved-tools", async (req, res) => {
  if (!db)
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  try {
    const snap = await db
      .collection("users")
      .doc(req.uid)
      .collection("savedTools")
      .orderBy("savedAt", "desc")
      .get();
    const tools = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ ok: true, tools });
  } catch (err) {
    console.error("Failed to fetch saved tools:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch saved tools" });
  }
});

// POST /api/user/saved-tools
router.post("/saved-tools", async (req, res) => {
  if (!db)
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  const error = validateSaveBody(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  const { toolId, name, description = "", source = "" } = req.body;
  try {
    await db
      .collection("users")
      .doc(req.uid)
      .collection("savedTools")
      .doc(toolId)
      .set({
        savedAt: new Date().toISOString(),
        name: name.slice(0, 200),
        description: description.slice(0, 500),
        source,
      });
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to save tool:", err);
    res.status(500).json({ ok: false, error: "Failed to save tool" });
  }
});

// DELETE /api/user/saved-tools/:toolId
router.delete("/saved-tools/:toolId", async (req, res) => {
  if (!db)
    return res.status(503).json({ ok: false, error: "Auth not configured" });
  try {
    await db
      .collection("users")
      .doc(req.uid)
      .collection("savedTools")
      .doc(req.params.toolId)
      .delete();
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete saved tool:", err);
    res.status(500).json({ ok: false, error: "Failed to delete saved tool" });
  }
});

module.exports = router;
