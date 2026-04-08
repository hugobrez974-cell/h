const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- CONFIG ADMIN ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin974";

// --- CONFIG EMAIL ---
const transporter = nodemailer.createTransport({
  service: "gmail", // ou autre
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// --- DB ---
const db = new sqlite3.Database("./database.db");

db.run(`
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
`);

// --- LOGIN ADMIN ---
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: "Mot de passe incorrect" });
});

// --- LISTE DES RÉSA POUR ADMIN ---
app.get("/admin/reservations", (req, res) => {
  db.all("SELECT * FROM reservations ORDER BY date ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Erreur DB" });
    res.json(rows);
  });
});

// --- FONCTION : générer facture HTML ---
function generateInvoiceHTML(resa) {
  return `
  <html>
  <body style="font-family: Arial, sans-serif;">
    <h2>Facture - Les Tonneaux des Ô</h2>
    <p>Merci ${resa.name},</p>
    <p>Nous confirmons votre réservation :</p>
    <ul>
      <li>Date d'arrivée : <b>${resa.date}</b></li>
      <li>Nombre de nuits : <b>${resa.nights}</b></li>
      <li>Montant total : <b>${resa.price.toFixed(2)} €</b></li>
    </ul>
    <p>Nous avons hâte de vous accueillir dans nos tonneaux.</p>
    <p>À très bientôt,<br>Les Tonneaux des Ô</p>
  </body>
  </html>
  `;
}

// --- FONCTION : envoyer email ---
async function sendReservationEmail(resa) {
  const html = generateInvoiceHTML(resa);

  await transporter.sendMail({
    from: `"Les Tonneaux des Ô" <${process.env.MAIL_USER}>`,
    to: resa.email,
    subject: "Confirmation de votre réservation",
    html
  });
}

// --- AJOUT RÉSA PAR ADMIN + EMAIL AUTO ---
app.post("/admin/add-reservation", async (req, res) => {
  const { password, date, name, email, nights, price } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Accès refusé" });
  }

  db.run(
    "INSERT INTO reservations (date, name, email, nights, price, admin_block) VALUES (?, ?, ?, ?, ?, 0)",
    [date, name, email, nights, price],
    async function (err) {
      if (err) return res.status(500).json({ error: "Erreur DB" });

      const resa = { id: this.lastID, date, name, email, nights, price };

      try {
        await sendReservationEmail(resa);
      } catch (e) {
        console.error("Erreur envoi email:", e);
      }

      res.json({ success: true, reservation: resa });
    }
  );
});

// --- DISPONIBILITÉS (clients) ---
app.get("/api/disponibilites", (req, res) => {
  db.all("SELECT date FROM reservations", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Erreur DB" });
    const dates = rows.map(r => r.date);
    res.json({ dates });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur sur port " + PORT));
