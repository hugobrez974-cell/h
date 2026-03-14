const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");

// TA CLÉ SECRÈTE STRIPE
const stripe = Stripe("sk_test_51TAqSZ4SBfYvToTOjcncvWernj51qcj4oXlnvwTtmbuH5e0DxKFodxVWLQhRXJpHs8AI1LNDtqMxCi3C0MwhrqoV00Iblghn2Z");

const app = express();
app.use(express.json());

// Dossier iCal
const icalDir = path.join(__dirname, "ical");
if (!fs.existsSync(icalDir)) fs.mkdirSync(icalDir);

// Base SQLite
const db = new sqlite3.Database(path.join(__dirname, "database.sqlite"));

db.serialize(() => {
  db.run(`
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
});

// Format iCal
function formatICS(dateStr) {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// Mise à jour du fichier iCal
function updateICS(bungalow) {
  db.all(
    "SELECT * FROM reservations WHERE bungalow = ? ORDER BY debut",
    [bungalow],
    (err, rows) => {
      if (err) return;

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
  );
}

// Vérification des disponibilités
function isAvailable(bungalow, debut, fin, cb) {
  db.all(
    `SELECT * FROM reservations
     WHERE bungalow = ?
     AND (debut < ? AND fin > ?)`,
    [bungalow, fin, debut],
    (err, rows) => {
      if (err) return cb(err);
      cb(null, rows.length === 0);
    }
  );
}

// API : créer une réservation
app.post("/api/reserver", (req, res) => {
  const { nom, email, bungalow, debut, fin } = req.body;

  isAvailable(bungalow, debut, fin, (err, ok) => {
    if (!ok) return res.status(400).json({ error: "Dates déjà réservées" });

    const createdAt = new Date().toISOString();

    db.run(
      `INSERT INTO reservations (nom, email, bungalow, debut, fin, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nom, email, bungalow, debut, fin, createdAt],
      function () {
        updateICS(bungalow);
        res.json({ success: true, id: this.lastID });
      }
    );
  });
});

// API : disponibilités
app.get("/api/disponibilites", (req, res) => {
  const { bungalow } = req.query;

  db.all(
    "SELECT debut, fin FROM reservations WHERE bungalow = ? ORDER BY debut",
    [bungalow],
    (err, rows) => res.json(rows)
  );
});

// API : liste admin
app.get("/api/reservations", (req, res) => {
  db.all("SELECT * FROM reservations ORDER BY created_at DESC", (err, rows) => {
    res.json(rows);
  });
});

// API : paiement Stripe (150$ par nuit)
app.post("/api/payer", async (req, res) => {
  const { bungalow, debut, fin } = req.body;

  const d1 = new Date(debut);
  const d2 = new Date(fin);
  const nuits = (d2 - d1) / (1000 * 60 * 60 * 24);

  const prix = nuits * 150; // 150$ par nuit

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
      success_url: "http://localhost:3000/reservation-success.html",
      cancel_url: "http://localhost:3000/reservation-cancel.html"
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

app.listen(3000, () => console.log("Serveur lancé sur http://localhost:3000"));