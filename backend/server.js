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

// --- DISPONIBILITÉS ---
app.get("/api/disponibilites", (req, res) => {
  const rows = db.prepare("SELECT date FROM reservations").all();
  res.json({ dates: rows.map(r => r.date) });
});

// --- CRÉATION SESSION STRIPE ---
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { date, name, email, nights, price } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Réservation Tonneaux des Ô (${date})`
            },
            unit_amount: Math.round(price * 100)
          },
          quantity: 1
        }
      ],
      metadata: { date, name, email, nights: String(nights), price: String(price) },
      success_url: process.env.SUCCESS_URL,
      cancel_url: process.env.CANCEL_URL
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur création session Stripe" });
  }
});

// --- WEBHOOK STRIPE ---
function handleStripeWebhook(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;

    const resa = {
      date: s.metadata.date,
      name: s.metadata.name,
      email: s.metadata.email,
      nights: parseInt(s.metadata.nights, 10),
      price: parseFloat(s.metadata.price)
    };

    const stmt = db.prepare(`
      INSERT INTO reservations (date, name, email, nights, price)
      VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(resa.date, resa.name, resa.email, resa.nights, resa.price);
    resa.id = info.lastInsertRowid;

    sendReservationEmail(resa).catch(err => console.error("Erreur email:", err));
  }

  res.json({ received: true });
}

// --- ADMIN LOGIN ---
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ success: true });
  res.status(401).json({ success: false, error: "Mot de passe incorrect" });
});

// --- ADMIN LISTE RÉSA ---
app.get("/admin/reservations", (req, res) => {
  const rows = db.prepare("SELECT * FROM reservations ORDER BY date ASC").all();
  res.json(rows);
});

// --- ADMIN AJOUT RÉSA ---
app.post("/admin/add-reservation", async (req, res) => {
  const { password, date, name, email, nights, price } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Accès refusé" });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO reservations (date, name, email, nights, price)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(date, name, email, nights, price);

    const resa = { id: info.lastInsertRowid, date, name, email, nights, price };
    await sendReservationEmail(resa);

    res.json({ success: true, reservation: resa });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur DB" });
  }
});

// --- SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
