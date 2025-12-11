const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  const file = req.url === "/script.js" ? "script.js" :
               req.url === "/style.css" ? "style.css" : "index.html";
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const type = file.endsWith(".js") ? "application/javascript"
               : file.endsWith(".css") ? "text/css" : "text/html";
    res.writeHead(200, {"Content-Type": type});
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function broadcast(data) {
  wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(JSON.stringify(data)));
}

wss.on("connection", (ws, req) => {
  ws.ip = req.socket.remoteAddress;
  ws.user = "Anonyme";
  broadcast({ type: "online", count: wss.clients.size });

  ws.on("message", msg => {
    const data = JSON.parse(msg);
    if (data.type === "login") ws.user = data.user;
    if (data.type === "message") broadcast({ type: "message", user: ws.user, ip: ws.ip, text: data.text });
  });

  ws.on("close", () => broadcast({ type: "online", count: wss.clients.size }));
});

const PORT = 3000;
server.listen(PORT, () => console.log("HTTP+WS on port", PORT));