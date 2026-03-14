const express = require("express");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const Stripe = require("stripe");

// ⚠️ METS ICI TA CLÉ SECRÈTE STRIPE (test ou live)
const stripe = Stripe("sk_test_51TAqSZ4SBfYvToTOjcncvWernj51qcj4oXlnvwTtmbuH5e0DxKFodxVWLQhRXJpHs8AI1LNDtqMxCi3C0MwhrqoV00Iblghn2Z");

// ⚠️ METS ICI TON SECRET DE WEBHOOK STRIPE
const STRIPE_WEBHOOK_SECRET = "pk_test_51TAqSZ4SBfYvToTOf9YdBFDryqy12bOw11wclIwzIj6LRS7y0xcFesrx1BVCtulYFvJYvpHSLnXJ4aBIFcEazH6b003NgmuphV";

const app = express();

// ⚠️ Le webhook doit être déclaré AVANT express.json()
app.post(
  "/api/webhook-stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Erreur signature webhook:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Paiement validé
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const nom = session.metadata.nom;
      const email = session.metadata.email;
      const bungalow = session.metadata.bungalow;
      const debut = session.metadata.debut;
      const fin = session.metadata.fin;
      const createdAt = new Date().toISOString();

      try {
        const stmt = db.prepare(
          "INSERT INTO reservations (nom, email, bungalow, debut, fin, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        );
        stmt.run(nom, email, bungalow, debut, fin, createdAt);

        updateICS(bungalow);
        console.log("Réservation confirmée après paiement:", nom, bungalow);
      } catch (err) {
        console.error("Erreur insertion réservation:", err);
      }
    }

    res.json({ received: true });
  }
);

// Le reste de l’API peut utiliser JSON normalement
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
  const rows = db
    .prepare("SELECT * FROM reservations WHERE bungalow = ? ORDER BY debut")
    .all(bungalow);

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
  const rows = db
    .prepare(
      `SELECT * FROM reservations
       WHERE bungalow = ?
       AND (debut < ? AND fin > ?)`
    )
    .all(bungalow, fin, debut);

  return rows.length === 0;
}

// API : créer une session de paiement Stripe
app.post("/api/payer", async (req, res) => {
  const { nom, email, bungalow, debut, fin } = req.body;

  if (!nom || !email || !bungalow || !debut || !fin) {
    return res.status(400).json({ error: "Données manquantes" });
  }

  if (!isAvailable(bungalow, debut, fin)) {
    return res.status(400).json({ error: "Dates déjà réservées" });
  }

  const d1 = new Date(debut);
  const d2 = new Date(fin);
  const nuits = (d2 - d1) / (1000 * 60 * 60 * 24);

  if (nuits <= 0) {
    return res.status(400).json({ error: "Dates invalides" });
  }

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
      success_url:
        "https://h-ptt9.onrender.com/reservation-success.html",
      cancel_url:
        "https://h-ptt9.onrender.com/reservation-cancel.html",
      metadata: {
        nom,
        email,
        bungalow,
        debut,
        fin
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Erreur Stripe:", err);
    res.status(500).json({ error: "Erreur Stripe" });
  }
});

// API : disponibilités
app.get("/api/disponibilites", (req, res) => {
  const { bungalow } = req.query;

  const rows = db
    .prepare(
      "SELECT debut, fin FROM reservations WHERE bungalow = ? ORDER BY debut"
    )
    .all(bungalow);

  res.json(rows);
});

// API : liste admin
app.get("/api/reservations", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM reservations ORDER BY created_at DESC")
    .all();

  res.json(rows);
});

// Fichiers iCal
app.use("/ical", express.static(icalDir));

// Serveur frontend
app.use("/", express.static(path.join(__dirname, "..", "frontend")));

app.post("/api/delete-reservation", (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "ID manquant" });
  }

  try {
    const resa = db.prepare("SELECT bungalow FROM reservations WHERE id = ?").get(id);

    db.prepare("DELETE FROM reservations WHERE id = ?").run(id);

    if (resa) updateICS(resa.bungalow);

    res.json({ success: true });
  } catch (err) {
    console.error("Erreur suppression :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur lancé sur port " + PORT));
