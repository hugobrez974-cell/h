const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Dossier uploads dans frontend
const uploadFolder = path.join(__dirname, "../frontend/uploads");
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadFolder),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_ ]/g, "");
        cb(null, safeName);
    }
});

const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "../frontend")));

app.post("/upload", upload.single("fichier"), (req, res) => {
    try {
        const prenom = (req.body.prenom || "Inconnu").trim() || "Inconnu";

        const meta = {
            addedBy: prenom
        };

        const metaPath = path.join(uploadFolder, req.file.filename + ".meta.json");
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

        res.send("Fichier téléversé avec succès !");
    } catch (e) {
        console.error(e);
        res.status(500).send("Erreur lors du téléversement.");
    }
});

app.listen(PORT, () => console.log("Backend OK sur port", PORT));
