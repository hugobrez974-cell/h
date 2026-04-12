import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import Stripe from "stripe";
import PDFDocument from "pdfkit";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 📌 Chemin vers data.json
const dataPath = path.join(process.cwd(), "data.json");

// 📌 Charger les réservations
function loadReservations() {
  if (!fs.existsSync(dataPath)) return [];
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

// 📌 Sauvegarder les réservations
function saveReservations(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------
// 🔥 ROUTE : CRÉATION SESSION STRIPE
// ---------------------------------------------------------
app.post("/api/create-checkout-session", async (req, res) => {
  const { bungalow, name, email, dateArrivee, dateDepart, price } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Réservation Bungalow ${bungalow}`,
            },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],
      success_url: "https://les-tonneaux-des-o.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://les-tonneaux-des-o.onrender.com/cancel.html?session_id={CHECKOUT_SESSION_ID}",
    });

    // Sauvegarde
    const reservations = loadReservations();
    reservations.push({
      bungalow,
      name,
      email,
      dateArrivee,
      dateDepart,
      price,
      sessionId: session.id,
      createdAt: new Date().toISOString(),
    });
    saveReservations(reservations);

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur Stripe" });
  }
});

// ---------------------------------------------------------
// 🔥 ROUTE : LISTE DES RÉSERVATIONS
// ---------------------------------------------------------
app.get("/api/reservations", (req, res) => {
  res.json(loadReservations());
});

// ---------------------------------------------------------
// 🔥 ROUTE : FACTURE PDF PERSONNALISÉE
// ---------------------------------------------------------
app.get("/api/custom-invoice/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;
  const reservations = loadReservations();
  const reservation = reservations.find(r => r.sessionId === sessionId);

  if (!reservation) {
    return res.status(404).send("Réservation introuvable");
  }

  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=facture-${sessionId}.pdf`
  );

  doc.pipe(res);

  // LOGO
  const logoPath = path.join(process.cwd(), "logo_official.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 40, { width: 140 });
  }

  // TITRE
  doc.fontSize(22).text("Les Tonneaux des Ô", 200, 50);
  doc.fontSize(12).text("Séjour nature et détente à Bois Court", 200, 75);

  doc.moveDown(2);

  // FACTURE
  doc.fontSize(16).text("Facture", { underline: true });
  doc.moveDown();

  doc.fontSize(12).text(`Numéro de facture : ${sessionId}`);
  doc.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`);
  doc.moveDown();

  // CLIENT
  doc.fontSize(14).text("Informations client", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(12).text(`Nom : ${reservation.name}`);
  doc.text(`Email : ${reservation.email}`);
  doc.moveDown();

  // RÉSERVATION
  doc.fontSize(14).text("Détails de la réservation", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(12).text(`Bungalow : ${reservation.bungalow}`);
  doc.text(`Arrivée : ${reservation.dateArrivee}`);
  doc.text(`Départ : ${reservation.dateDepart}`);
  doc.text(`Montant : ${reservation.price} €`);
  doc.moveDown();

  // MESSAGE FINAL
  doc.moveDown(2);
  doc.fontSize(12).text("Merci pour votre confiance !");
  doc.text("À très bientôt aux Tonneaux des Ô.");

  doc.end();
});

// ---------------------------------------------------------
// 🔥 LANCEMENT SERVEUR
// ---------------------------------------------------------
app.listen(3000, () => {
  console.log("Serveur lancé sur le port 3000");
});
