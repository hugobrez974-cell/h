// ===============================
//  SERVER.JS COMPLET – VERSION FINALE
// ===============================

const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const ical = require("ical");

const app = express();

app.use(cors());
app.use(express.json());

// ===============================
//  SERVIR LES FICHIERS iCal
// ===============================
// Tes fichiers sont dans /backend/ical
// Render ne les sert PAS automatiquement → on le fait ici
app.use("/ical", express.static(path.join(__dirname, "ical")));

// ===============================
//  URLS DES DEUX BUNGALOWS
// ===============================
const ICAL_URLS = {
  bungalow1: "https://h-e5oa.onrender.com/ical/bungalow1.ics",
  bungalow2: "https://h-e5oa.onrender.com/ical/bungalow2.ics"
};

// ===============================
//  ROUTE DISPONIBILITÉS
// ===============================
// Exemple :
// https://h-e5oa.onrender.com/api/disponibilites?bungalow=bungalow1
// ===============================
app.get("/api/disponibilites", async (req, res) => {
  try {
    const bungalow = req.query.bungalow || "bungalow1";

    if (!ICAL_URLS[bungalow]) {
      return res.json([]);
    }

    // Télécharger le fichier iCal
    const response = await axios.get(ICAL_URLS[bungalow]);
    const data = response.data;

    // Parser le iCal
    const events = ical.parseICS(data);
    const dates = [];

    for (const key in events) {
      const ev = events[key];
      if (!ev || ev.type !== "VEVENT") continue;

      const start = ev.start;
      const end = ev.end || ev.start;

      if (!start) continue;

      let d = new Date(start);
      const last = new Date(end);

      // Si end < start → normaliser
      if (last < d) last.setTime(d.getTime());

      // Ajouter toutes les dates du séjour
      while (d <= last) {
        const iso = d.toISOString().split("T")[0];
        if (!dates.includes(iso)) dates.push(iso);
        d.setDate(d.getDate() + 1);
      }
    }

    res.json(dates);

  } catch (err) {
    console.error("Erreur iCal :", err.message);
    res.json([]);
  }
});

// ===============================
//  ROUTE DE TEST
// ===============================
app.get("/", (req, res) => {
  res.send("Backend iCal opérationnel ✔");
});

// ===============================
//  LANCEMENT RENDER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
