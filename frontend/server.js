const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Dossier frontend
const frontend = path.join(__dirname, "frontend");

// Fonction pour régénérer mp3.json
function regenerateMp3Json() {
    const files = fs.readdirSync(frontend)
        .filter(f => f.toLowerCase().endsWith(".mp3"))
        .map(f => ({ file: "/" + f }));

    fs.writeFileSync(
        path.join(frontend, "mp3.json"),
        JSON.stringify(files, null, 2)
    );

    console.log("mp3.json mis à jour :", files.length, "fichiers");
}

// Servir le frontend
app.use(express.static(frontend));

// Démarrage
app.listen(PORT, () => {
    console.log("Serveur lancé sur port", PORT);
    regenerateMp3Json();
});
