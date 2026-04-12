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
      success_url:
        "https://les-tonneaux-des-o.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        "https://les-tonneaux-des-o.onrender.com/cancel.html?session_id={CHECKOUT_SESSION_ID}",
    });

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
// 🔥 ROUTE : FACTURE STRIPE (PDF OFFICIEL STRIPE)
// ---------------------------------------------------------
app.get("/api/invoice/:sessionId", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.params.sessionId
    );

    if (!session.invoice) {
      return res.status(404).json({ error: "Aucune facture Stripe trouvée" });
    }

    const invoice = await stripe.invoices.retrieve(session.invoice);

    if (!invoice.invoice_pdf) {
      return res.status(404).json({ error: "PDF de facture indisponible" });
    }

    res.json({ url: invoice.invoice_pdf });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur lors de la récupération facture" });
  }
});

// ---------------------------------------------------------
// 🔥 ROUTE : FACTURE PDF PERSONNALISÉE (CLIENT)
// ---------------------------------------------------------
app.get("/api/custom-invoice/:sessionId", (req, res) => {
  generateInvoice(res, loadReservations().find(r => r.sessionId === req.params.sessionId), req.params.sessionId);
});

// ---------------------------------------------------------
// 🔥 ROUTE ADMIN : FACTURE PAR ID (SANS STRIPE)
// ---------------------------------------------------------
app.get("/api/admin/invoice/:id", (req, res) => {
  const reservations = loadReservations();
  const reservation = reservations[req.params.id];

  if (!reservation) {
    return res.status(404).send("Réservation introuvable");
  }

  generateInvoice(res, reservation, req.params.id);
});

// ---------------------------------------------------------
// 🔥 FONCTION GÉNÉRATION PDF (UTILISÉE PAR LES 2 ROUTES)
// ---------------------------------------------------------
function generateInvoice(res, reservation, invoiceId) {
  if (!reservation) {
    return res.status(404).send("Réservation introuvable");
  }

  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=facture-${invoiceId}.pdf`
  );

  doc.pipe(res);

  // LOGO (à la racine du backend)
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

  doc.fontSize(12).text(`Numéro de facture : ${invoiceId}`);
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
  doc.moveDown(2);

  doc.fontSize(12).text("Merci pour votre confiance !");
  doc.text("À très bientôt aux Tonneaux des Ô.");

  doc.end();
}

// ---------------------------------------------------------
// 🔥 LANCEMENT SERVEUR
// ---------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
