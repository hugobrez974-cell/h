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

// 📌 Chemin vers data.json (à la racine de backend)
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
// 🔥 CRÉATION SESSION STRIPE (RÉSA CLASSIQUE CLIENT)
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
        "https://h-1-y7xu.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        "https://h-1-y7xu.onrender.com/cancel.html?session_id={CHECKOUT_SESSION_ID}",
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
      status: "paid",
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
// 🔥 LISTE DES RÉSERVATIONS
// ---------------------------------------------------------
app.get("/api/reservations", (req, res) => {
  res.json(loadReservations());
});

// ---------------------------------------------------------
// 🔥 SAUVEGARDE DES RÉSERVATIONS (ADMIN SUPPRESSION / MODIF)
// ---------------------------------------------------------
app.post("/api/reservations", (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) {
    return res.status(400).json({ error: "Format invalide" });
  }
  saveReservations(data);
  res.json({ success: true });
});

// ---------------------------------------------------------
// 🔥 FACTURE STRIPE (PDF OFFICIEL STRIPE)
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
// 🔥 FACTURE PDF PERSONNALISÉE (CLIENT, via sessionId Stripe)
// ---------------------------------------------------------
app.get("/api/custom-invoice/:sessionId", (req, res) => {
  const reservations = loadReservations();
  const reservation = reservations.find(
    (r) => r.sessionId === req.params.sessionId
  );
  generateInvoice(res, reservation, req.params.sessionId);
});

// ---------------------------------------------------------
// 🔥 ADMIN : FACTURE PAR INDEX (SANS STRIPE)
// ---------------------------------------------------------
app.get("/api/admin/invoice/:id", (req, res) => {
  const reservations = loadReservations();
  const reservation = reservations[req.params.id];
  generateInvoice(res, reservation, req.params.id);
});

// ---------------------------------------------------------
// 🔥 ADMIN : CRÉER UNE PRÉ-RÉSERVATION (BLOQUER LES DATES)
// ---------------------------------------------------------
app.post("/api/admin/create", (req, res) => {
  const { bungalow, name, email, dateArrivee, dateDepart, price } = req.body;

  if (!bungalow || !name || !email || !dateArrivee || !dateDepart || !price) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  const reservations = loadReservations();

  const newReservation = {
    bungalow,
    name,
    email,
    dateArrivee,
    dateDepart,
    price,
    status: "non payer", // 🔒 dates bloquées, en attente de paiement
    createdAt: new Date().toISOString(),
  };

  reservations.push(newReservation);
  saveReservations(reservations);

  res.json({ success: true, reservation: newReservation });
});

// ---------------------------------------------------------
// 🔥 ADMIN : CRÉER UN LIEN DE PAIEMENT POUR UNE RÉSA EXISTANTE
// ---------------------------------------------------------
app.post("/api/admin/create-payment-link", async (req, res) => {
  const { bungalow, name, email, dateArrivee, dateDepart, price, index } =
    req.body;

  if (!bungalow || !name || !email || !dateArrivee || !dateDepart || !price) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  try {
    // 1️⃣ Créer un produit Stripe temporaire
    const product = await stripe.products.create({
      name: `Réservation Bungalow ${bungalow} (${dateArrivee} → ${dateDepart})`,
    });

    const priceStripe = await stripe.prices.create({
      product: product.id,
      unit_amount: price * 100,
      currency: "eur",
    });

    // 2️⃣ Créer un lien de paiement
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: priceStripe.id, quantity: 1 }],
      after_completion: {
        type: "redirect",
        redirect: {
          url: "https://les-tonneaux-des-o.onrender.com/success.html",
        },
      },
    });

    // 3️⃣ Mettre à jour la réservation avec le lien
    const reservations = loadReservations();
    if (typeof index === "number" && reservations[index]) {
      reservations[index].paymentLink = paymentLink.url;
      saveReservations(reservations);
    }

    res.json({ success: true, url: paymentLink.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur Stripe" });
  }
});

// ---------------------------------------------------------
// 🔥 FONCTION GÉNÉRATION PDF
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

  const logoPath = path.join(process.cwd(), "logo_official.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 40, { width: 140 });
  }

  doc.fontSize(22).text("Les Tonneaux des Ô", 200, 50);
  doc.fontSize(12).text("Séjour nature et détente à Bois Court", 200, 75);

  doc.moveDown(2);

  doc.fontSize(16).text("Facture", { underline: true });
  doc.moveDown();

  doc.fontSize(12).text(`Numéro de facture : ${invoiceId}`);
  doc.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`);
  doc.moveDown();

  doc.fontSize(14).text("Informations client", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(12).text(`Nom : ${reservation.name}`);
  doc.text(`Email : ${reservation.email}`);
  doc.moveDown();

  doc.fontSize(14).text("Détails de la réservation", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(12).text(`Bungalow : ${reservation.bungalow}`);
  doc.text(`Arrivée : ${reservation.dateArrivee}`);
  doc.text(`Départ : ${reservation.dateDepart}`);
  doc.text(`Montant : ${reservation.price} €`);
  doc.moveDown(2);

doc.fontSize(12).text("Merci pour votre confiance !");
doc.text("À très bientôt aux Tonneaux des Ô.");
doc.text("Nous contacter au +262 693 63 66 81 ou par nos réseaux sociaux");
doc.moveDown(1);

// 🔥 Ajout du site et du lien Google Maps
doc.fontSize(12).fillColor("blue").text(
  "Site web : https://h-1-y7xu.onrender.com/",
  { link: "https://h-1-y7xu.onrender.com/", underline: true }
);

doc.moveDown(0.5);

doc.fontSize(12).fillColor("blue").text(
  "Voir sur Google Maps : Les Tonneaux des Ô, Bois Court, La Réunion",
  {
    link: "https://maps.app.goo.gl/mN6qmCc6vyYHPfSb7",
    underline: true
  }
);

doc.end();
}

// ---------------------------------------------------------
// 🔥 LANCEMENT SERVEUR
// ---------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
