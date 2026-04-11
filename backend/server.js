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

app.use(cors({
  origin: "https://h-1-y7xu.onrender.com",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// ------------------------------------------------------
// 🔥 SERVIR LES ICS
// ------------------------------------------------------
app.get("/icals/:bungalow.ics", (req, res) => {
  const filePath = path.join(__dirname, "icals", `${req.params.bungalow}.ics`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("ICS introuvable");
  }

  res.setHeader("Content-Type", "text/calendar");
  res.send(fs.readFileSync(filePath, "utf8"));
});

// ------------------------------------------------------
// 🔥 VOIR LES RÉSERVATIONS
// ------------------------------------------------------
app.get("/api/reservations", (req, res) => {
  const filePath = path.join(__dirname, "data.json");

  if (!fs.existsSync(filePath)) return res.json([]);

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  res.json(data);
});

// ------------------------------------------------------
// 🔥 BLOQUER UNE DATE (AJOUT ICS)
// ------------------------------------------------------
app.post("/api/block-date", (req, res) => {
  const { bungalow, date } = req.body;

  if (!bungalow || !date) {
    return res.status(400).json({ message: "Champs manquants" });
  }

  const filePath = path.join(__dirname, "icals", `${bungalow}.ics`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "ICS introuvable" });
  }

  const d = date.replace(/-/g, "");

  const event = `
BEGIN:VEVENT
DTSTART:${d}T120000Z
DTEND:${d}T130000Z
SUMMARY:Bloqué
END:VEVENT
`;

  fs.appendFileSync(filePath, event);

  res.json({ message: "Date bloquée !" });
});

// ------------------------------------------------------
// 🔥 DÉBLOQUER UNE DATE (SUPPRESSION ICS)
// ------------------------------------------------------
app.post("/api/unblock-date", (req, res) => {
  const { bungalow, date } = req.body;

  if (!bungalow || !date) {
    return res.status(400).json({ message: "Champs manquants" });
  }

  const filePath = path.join(__dirname, "icals", `${bungalow}.ics`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "ICS introuvable" });
  }

  let ics = fs.readFileSync(filePath, "utf8");

  const d = date.replace(/-/g, "");

  // 🔥 REGEX ULTRA ROBUSTE
  const regex = new RegExp(
    `BEGIN:VEVENT[\\s\\S]*?DTSTART:${d}T[0-9]+Z[\\s\\S]*?END:VEVENT`,
    "g"
  );

  const newIcs = ics.replace(regex, "").trim();

  fs.writeFileSync(filePath, newIcs);

  res.json({ message: "Date débloquée !" });
});

// ------------------------------------------------------
// 🔥 STRIPE CHECKOUT
// ------------------------------------------------------
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { bungalow, name, email, dateArrivee, dateDepart, price } = req.body;

    if (!bungalow || !name || !email || !dateArrivee || !dateDepart || !price) {
      return res.status(400).json({ error: "Champs manquants" });
    }

    // Sauvegarde dans data.json
    const filePath = path.join(__dirname, "data.json");
    let data = [];

    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    data.push({
      bungalow,
      name,
      email,
      dateArrivee,
      dateDepart,
      price,
      createdAt: new Date().toISOString()
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

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
      cancel_url: "https://h-1-y7xu.onrender.com/cancel.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("Erreur Stripe :", err);
    res.status(500).json({ error: "Erreur serveur Stripe" });
  }
});

// ------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Backend en ligne sur le port", PORT);
});
