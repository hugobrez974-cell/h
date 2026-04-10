import express from "express";
import cors from "cors";
import Stripe from "stripe";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// -------------------------
// 🔥 CORS : autorise ton frontend
// -------------------------
app.use(cors({
  origin: "https://h-1-y7xu.onrender.com", // TON FRONTEND
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// -------------------------
// 🔥 ROUTE ICS (dans /icals)
// -------------------------
app.get("/:bungalow.ics", (req, res) => {
  const filePath = path.join(__dirname, "icals", `${req.params.bungalow}.ics`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("ICS introuvable");
  }

  res.setHeader("Content-Type", "text/calendar");
  res.send(fs.readFileSync(filePath, "utf8"));
});

// -------------------------
// 🔥 ROUTE STRIPE CHECKOUT
// -------------------------
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { bungalow, name, email, dateArrivee, dateDepart, price } = req.body;

    if (!bungalow || !name || !email || !dateArrivee || !dateDepart || !price) {
      return res.status(400).json({ error: "Champs manquants" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Réservation ${bungalow}`,
              description: `Du ${dateArrivee} au ${dateDepart}`
            },
            unit_amount: price * 100
          },
          quantity: 1
        }
      ],
      success_url: "https://h-1-y7xu.onrender.com/success.html",
      cancel_url: "https://h-1-y7xu.onrender.com/cancel.html",
      metadata: {
        bungalow,
        name,
        email,
        dateArrivee,
        dateDepart
      }
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("Erreur Stripe :", err);
    res.status(500).json({ error: "Erreur serveur Stripe" });
  }
});

// -------------------------
// 🔥 LANCEMENT SERVEUR
// -------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Backend en ligne sur le port", PORT);
});
