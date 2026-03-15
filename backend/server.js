const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function envoyerEmail(nom, email, bungalow, debut, fin, prix) {
  const message = {
    from: `"Les Bungalows" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Votre réservation est confirmée ✔",
    html: `
      <h2>Merci pour votre réservation, ${nom} !</h2>
      <p>Votre séjour est bien confirmé :</p>
      <ul>
        <li><b>Bungalow :</b> ${bungalow}</li>
        <li><b>Date d'arrivée :</b> ${debut}</li>
        <li><b>Date de départ :</b> ${fin}</li>
        <li><b>Prix total :</b> ${prix} €</li>
      </ul>
      <p>Nous avons hâte de vous accueillir 🌴</p>
    `
  };

  transporter.sendMail(message)
    .then(() => console.log("Email envoyé à", email))
    .catch(err => console.error("Erreur email :", err));
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const app = express();
app.use(cors());
app.use(express.json());

// Base de données
const db = new Database("reservations.db");

// Création table si inexistante
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

// Fonction prix dynamique
function calculerPrix(debut, fin) {
  const d1 = new Date(debut);
  const d2 = new Date(fin);

  let total = 0;

  for (let d = new Date(d1); d < d2; d.setDate(d.getDate() + 1)) {
    const jour = d.getDay(); // 0=dimanche ... 5=vendredi, 6=samedi
    if (jour === 5 || jour === 6) total += 150;
    else total += 120;
  }

  return total;
}

// Vérifier doublon
function estDisponible(bungalow, debut, fin) {
  const rows = db.prepare(`
    SELECT * FROM reservations
    WHERE bungalow = ?
    AND NOT (fin <= ? OR debut >= ?)
  `).all(bungalow, debut, fin);

  return rows.length === 0;
}

// Route payer (Stripe Checkout)
app.post("/api/payer", async (req, res) => {
  const { nom, email, bungalow, debut, fin } = req.body;

  if (!nom || !email || !bungalow || !debut || !fin) {
    return res.status(400).json({ error: "Données manquantes" });
  }

  if (!estDisponible(bungalow, debut, fin)) {
    return res.status(400).json({ error: "Ce bungalow est déjà réservé à ces dates." });
  }

  const prix = calculerPrix(debut, fin);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: `Réservation ${bungalow}` },
            unit_amount: prix * 100
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/success.html`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel.html`,
      metadata: { nom, email, bungalow, debut, fin, prix }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur Stripe :", err);
    res.status(500).json({ error: "Erreur Stripe" });
  }
});

// Webhook Stripe
app.post("/api/webhook", bodyParser.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook invalide :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const data = event.data.object.metadata;

    db.prepare(`
      INSERT INTO reservations (nom, email, bungalow, debut, fin, prix)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.nom, data.email, data.bungalow, data.debut, data.fin, data.prix);

    console.log("Réservation enregistrée :", data);
  }

  res.json({ received: true });
});

if (event.type === "checkout.session.completed") {
    const data = event.data.object.metadata;

    db.prepare(`
      INSERT INTO reservations (nom, email, bungalow, debut, fin, prix)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.nom, data.email, data.bungalow, data.debut, data.fin, data.prix);

    // ENVOI EMAIL AU CLIENT
    envoyerEmail(data.nom, data.email, data.bungalow, data.debut, data.fin, data.prix);

    console.log("Réservation enregistrée et email envoyé :", data);
}

// Route réservation simple (sans paiement)
app.post("/api/reserver", (req, res) => {
  const { nom, email, bungalow, debut, fin } = req.body;

  if (!nom || !email || !bungalow || !debut || !fin) {
    return res.status(400).json({ error: "Données manquantes" });
  }

  if (!estDisponible(bungalow, debut, fin)) {
    return res.status(400).json({ error: "Ce bungalow est déjà réservé à ces dates." });
  }

  const prix = calculerPrix(debut, fin);

  db.prepare(`
    INSERT INTO reservations (nom, email, bungalow, debut, fin, prix)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nom, email, bungalow, debut, fin, prix);

  res.json({ success: true });
});

// Serveur
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur lancé sur le port", PORT));
