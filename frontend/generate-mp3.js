const fs = require("fs");
const path = require("path");

const folder = path.join(__dirname);
const files = fs.readdirSync(folder).filter(f => f.endsWith(".mp3"));

fs.writeFileSync(
    path.join(__dirname, "mp3.json"),
    JSON.stringify(files, null, 2)
);

console.log("mp3.json généré avec :", files.length, "fichiers");
