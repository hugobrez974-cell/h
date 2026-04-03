const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Base SQLite
const db = new Database("database.db");

// Table réservations
db.prepare(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT,
    email TEXT,
    bungalow TEXT,
    debut TEXT,
    fin TEXT,
    prix INTEGER
  )
`).run();

// Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Servir le frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Récupérer disponibilités
app.get("/api/disponibilites", (req, res) => {
  const bungalow = req.query.bungalow;

  const rows = db.prepare(`
    SELECT debut, fin FROM reservations WHERE bungalow = ?
  `).all(bungalow);

  res.json(rows);
});

// Checkout Stripe
app.post("/api/checkout", async (req, res) => {
  const { nom, email, bungalow, debut, fin, prix } = req.body;

  // Validation
  if (!nom || !email || !bungalow || !debut || !fin || !prix) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Réservation ${bungalow}`
            },
            unit_amount: prix * 100
          },
          quantity: 1
        }
      ],
      success_url: process.env.SUCCESS_URL,
      cancel_url: process.env.CANCEL_URL,
      metadata: { nom, email, bungalow, debut, fin, prix }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur Stripe :", err);
    res.status(500).json({ error: "Erreur création session Stripe" });
  }
});

// Webhook Stripe
app.post("/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Erreur webhook :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const data = event.data.object.metadata;

    db.prepare(`
      INSERT INTO reservations (nom, email, bungalow, debut, fin, prix)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.nom,
      data.email,
      data.bungalow,
      data.debut,
      data.fin,
      data.prix
    );

    console.log("Réservation enregistrée :", data);
  }

  res.json({ received: true });
});

// Démarrage serveur
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Serveur backend démarré sur le port", PORT);
});
