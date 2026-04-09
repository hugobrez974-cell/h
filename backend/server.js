const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// Webhook Stripe doit lire le RAW body
app.post("/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

// Le reste en JSON normal
app.use(cors());
app.use(bodyParser.json());

// --- DB ---
const db = new Database("./database.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    nights INTEGER NOT NULL,
    price REAL NOT NULL,
    admin_block INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// --- ADMIN ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin974";

// --- EMAIL ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// --- FACTURE HTML ---
function generateInvoiceHTML(resa) {
  return `
  <html>
  <body style="font-family: Arial; background:#f7f7f7; padding:20px;">
    <div style="max-width:600px; margin:auto; background:white; padding:20px; border-radius:10px;">
      <h2 style="text-align:center;">Les Tonneaux des Ô</h2>
      <p style="text-align:center; color:#777;">Confirmation de réservation</p>

      <hr>

      <p>Bonjour <b>${resa.name}</b>,</p>
      <p>Votre réservation est confirmée :</p>

      <ul>
        <li><b>Date d'arrivée :</b> ${resa.date}</li>
        <li><b>Nombre de nuits :</b> ${resa.nights}</li>
        <li><b>Montant total :</b> ${resa.price} €</li>
      </ul>

      <p>Nous avons hâte de vous accueillir dans nos tonneaux.</p>

      <p style="text-align:center; margin-top:30px;">
        Merci pour votre confiance,<br>
        <b>Les Tonneaux des Ô</b>
      </p>

      <hr>
      <p style="font-size:12px; text-align:center; color:#999;">
        Facture automatique — Réservation n°${resa.id}
      </p>
    </div>
  </body>
  </html>
  `;
}

async function sendReservationEmail(resa) {
  const html = generateInvoiceHTML(resa);

  await transporter.sendMail({
    from: `"Les Tonneaux des Ô" <${process.env.MAIL_USER}>`,
    to: resa.email,
    subject: "Votre réservation est confirmée ✔",
    html
  });
}

// --- ROUTE GET RACINE ---
app.get("/", (req, res) => {
  res.send("API Les Tonneaux des Ô — Backend opérationnel ✔");
});

// --- ROUTES GET EXPLICATIVES ---
app.get("/admin/login", (req, res) => {
  res.send("Cette route doit être appelée en POST.");
});

app.get("/create-checkout-session", (req, res) => {
  res.send("Utilise POST pour créer une session Stripe.");
});

// --- DISPONIBILITÉS ---
app.get("/api/disponibilites", (req, res) => {
  const rows = db.prepare("SELECT date FROM reservations").all();
  res.json({ dates: rows.map(r => r.date) });
});

// --- CRÉATION SESSION STRIPE ---
app.post("/create-checkout-session", async (req, res
