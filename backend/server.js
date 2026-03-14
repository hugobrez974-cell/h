const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

// TA CLÉ SECRÈTE STRIPE
const stripe = Stripe("sk_test_51TAqSZ4SBfYvToTOjcncvWernj51qcj4oXlnvwTtmbuH5e0DxKFodxVWLQhRXJpHs8AI1LNDtqMxCi3C0MwhrqoV00Iblghn2Z");

const app = express();
app.use(express.json());

// Dossier iCal
const icalDir = path.join(__dirname, "ical");
if (!fs.existsSync(icalDir)) fs.mkdirSync(icalDir);

// Base SQLite
const db = new Database("database.sqlite");

db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT,
    email TEXT,
    bungalow TEXT,
    debut TEXT,
    fin TEXT,
    created_at TEXT
  )
`);

// Format iCal
function formatICS(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Mise à jour du fichier iCal
function updateICS(bungalow) {
  const rows = db.prepare(
    "SELECT * FROM reservations WHERE bungalow = ? ORDER BY debut"
  ).all(bungalow);

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Les Bungalows//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

  rows.forEach((r) => {
    ics += `
BEGIN:VEVENT
UID:${r.id}@lesbungalows
DTSTAMP:${formatICS(r.created_at)}
DTSTART;VALUE=DATE:${r.debut.replace(/-/g, "")}
DTEND;VALUE=DATE:${r.fin.replace(/-/g, "")}
SUMMARY:Réservation - ${r.bungalow}
DESCRIPTION:Réservé par ${r.nom} (${r.email})
END:VEVENT
`;
  });

  ics += "END:VCALENDAR";

  fs.writeFileSync(path.join(icalDir, `${bungalow}.ics`), ics);
}

// Vérification des disponibilités
function isAvailable(bungalow, debut, fin) {
  const rows = db.prepare(
    `SELECT * FROM reservations
     WHERE bungalow = ?
     AND (debut < ? AND fin > ?)`
  ).all(bungalow, fin, debut);

  return rows.length === 0;
}

// API : créer une réservation
app.post("/api/reserver", (req, res) => {
  const { nom, email, bungalow, debut, fin } = req.body;

  if (!isAvailable(bungalow, debut, fin)) {
    return res.status(400).json({ error: "Dates déjà réservées" });
  }

  const createdAt = new Date().toISOString();

  try {
    const stmt = db.prepare(
      "INSERT INTO reservations (nom, email, bungalow, debut, fin, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(nom, email, bungalow, debut, fin, createdAt);

    updateICS(bungalow);

    res.json({ success: true });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// API : disponibilités
app.get("/api/disponibilites", (req, res) => {
  const { bungalow } = req.query;

  const rows = db.prepare(
    "SELECT debut, fin FROM reservations WHERE bungalow = ? ORDER BY debut"
  ).all(bungalow);

  res.json(rows);
});

// API : liste admin
app.get("/api/reservations", (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM reservations ORDER BY created_at DESC"
  ).all();

  res.json(rows);
});

// API : paiement Stripe (150€ par nuit)
app.post("/api/payer", async (req, res) => {
  const { bungalow, debut, fin } = req.body;

  const d1 = new Date(debut);
  const d2 = new Date(fin);
  const nuits = (d2 - d1) / (1000 * 60 * 60 * 24);

  const prix = nuits * 150;

  try {
    const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items: [
    {
      price_data: {
        currency: "eur",
        product_data: {
          name: `Séjour ${bungalow} (${debut} → ${fin})`
        },
        unit_amount: prix * 100
      },
      quantity: 1
    }
  ],
  success_url: "https://h-ptt9.onrender.com/reservation-success.html",
  cancel_url: "https://h-ptt9.onrender.com/reservation-cancel.html"
});

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur Stripe" });
  }
});

// Fichiers iCal
app.use("/ical", express.static(icalDir));

// Serveur frontend
app.use("/", express.static(path.join(__dirname, "..", "frontend")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur lancé sur port " + PORT));
