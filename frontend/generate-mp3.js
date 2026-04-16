const fs = require("fs");
const path = require("path");

const mainFolder = path.join(__dirname);
const uploadFolder = path.join(__dirname, "uploads");

let files = [];

// Fichiers du dossier principal (créateur)
fs.readdirSync(mainFolder).forEach(f => {
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
                } catch (e) {
                    addedBy = "le créateur";
                }
            }

            files.push({
                file: "/uploads/" + f,
                addedBy
            });
        }
    });
}

fs.writeFileSync(
    path.join(__dirname, "mp3.json"),
    JSON.stringify(files, null, 2)
);

console.log("mp3.json généré :", files.length, "fichiers");
