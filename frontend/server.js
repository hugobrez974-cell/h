const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Dossier uploads dans frontend
const uploadFolder = path.join(__dirname, "../frontend/uploads");
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

// Fonction pour régénérer mp3.json instantanément
function regenerateMp3Json() {
    const frontend = path.join(__dirname, "../frontend");
    const uploadFolder = path.join(frontend, "uploads");

    let files = [];

    // Fichiers du créateur
    fs.readdirSync(frontend).forEach(f => {
        if (f.endsWith(".mp3")) {
            files.push({
                file: "/" + f,
                addedBy: "le créateur"
            });
        }
    });

    // Fichiers uploadés
    if (fs.existsSync(uploadFolder)) {
        fs.readdirSync(uploadFolder).forEach(f => {
            if (f.endsWith(".mp3")) {
                const metaFile = path.join(uploadFolder, f + ".meta.json");
                let addedBy = "le créateur";

                if (fs.existsSync(metaFile)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metaFile));
                        addedBy = meta.addedBy || "le créateur";
                    } catch (e) {}
                }

                files.push({
                    file: "/uploads/" + f,
                    addedBy
                });
            }
        });
    }

    fs.writeFileSync(
        path.join(frontend, "mp3.json"),
        JSON.stringify(files, null, 2)
    );

    console.log("mp3.json mis à jour :", files.length, "fichiers");
}

// Multer config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadFolder),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_ ]/g, "");
        cb(null, safeName);
    }
});

const upload = multer({ storage });

// Servir le frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Upload route
app.post("/upload", upload.single("fichier"), (req, res) => {
    try {
        const prenom = (req.body.prenom || "Inconnu").trim() || "Inconnu";

        const meta = { addedBy: prenom };
        const metaPath = path.join(uploadFolder, req.file.filename + ".meta.json");
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        // Mise à jour instantanée
        regenerateMp3Json();

        res.send("Fichier téléversé avec succès !");
    } catch (e) {
        console.error(e);
        res.status(500).send("Erreur lors du téléversement.");
    }
});

// Démarrage
app.listen(PORT, () => {
    console.log("Backend OK sur port", PORT);
    regenerateMp3Json(); // Génère mp3.json au démarrage
});
