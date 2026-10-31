const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const bookingService = require("../services/bookingService");
const { sendError } = require("../errors");

const router = express.Router();

// POST /payments — US-02, крок 3-4
router.post("/", requireAuth, requireRole("client"), async (req, res) => {
  try {
    const { draftId, amount, currency, simulate } = req.body || {};
    if (draftId === undefined || amount === undefined || currency === undefined) {
      return res.status(422).json({ code: "validation_error", message: "draftId, amount, currency є обов'язковими" });
    }
    if (typeof draftId !== "string" || typeof amount !== "number" || !(amount > 0) ||
        typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
      return res.status(422).json({ code: "validation_error", message: "Некоректний формат draftId, amount (число > 0) або currency (ISO 4217)" });
    }
    const booking = await bookingService.payForDraft({
      draftId,
      amount,
      currency,
      clientId: req.user.sub,
      simulate, // для демонстрації/тестів: "decline" імітує відмову платіжної системи
    });
    res.status(201).json(booking);
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
