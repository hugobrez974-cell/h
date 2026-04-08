const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();

// Stripe Webhook doit lire le RAW body
app.use("/webhook", express.raw({ type: "application/json" }));

app.use(cors());
app.use(bodyParser.json());

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
        <li><b>Nuits :</b> ${resa.nights}</li>
        <li><b>Total :</b> ${resa.price} €</li>
      </ul>

      <p>Nous avons hâte de vous accueillir.</p>

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

// --- CRÉATION SESSION STRIPE ---
app.post("/create-checkout-session", async (req, res) => {
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
          unit_amount: price * 100
        },
        quantity: 1
      }
    ],
    metadata: { date, name, email, nights, price },
    success_url: process.env.SUCCESS_URL,
    cancel_url: process.env.CANCEL_URL
  });

  res.json({ url: session.url });
});

// --- WEBHOOK STRIPE ---
app.post("/webhook", (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;

    const resa = {
      date: s.metadata.date,
      name: s.metadata.name,
      email: s.metadata.email,
      nights: parseInt(s.metadata.nights),
      price: parseFloat(s.metadata.price)
    };

    db.run(
      "INSERT INTO reservations (date, name, email, nights, price) VALUES (?, ?, ?, ?, ?)",
      [resa.date, resa.name, resa.email, resa.nights, resa.price],
      function (err) {
        if (!err) {
          resa.id = this.lastID;
          sendReservationEmail(resa);
        }
      }
    );
  }

  res.json({ received: true });
});

// --- DISPONIBILITÉS ---
app.get("/api/disponibilites", (req, res) => {
  db.all("SELECT date FROM reservations", [], (err, rows) => {
    const dates = rows.map(r => r.date);
    res.json({ dates });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur OK sur port " + PORT));
