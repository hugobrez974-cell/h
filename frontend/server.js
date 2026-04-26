const fs = require("fs");
const path = require("path");

const folder = path.join(__dirname, "frontend");
const output = path.join(folder, "mp3.json");

const files = fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith(".mp3"));

fs.writeFileSync(output, JSON.stringify(files, null, 2));

console.log("mp3.json généré avec :", files.length, "fichiers");
