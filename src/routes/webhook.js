// src/routes/webhook.js
import express from "express";
import { procesarMensajeEntrante } from "../services/whatsappService.js";

export const router = express.Router();

// GET /webhook (verificación)
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /webhook (mensajes entrantes)
router.post("/", async (req, res) => {
  try {
    await procesarMensajeEntrante(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook:", err);
    res.sendStatus(500);
  }
});
