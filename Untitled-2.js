const ws = new WebSocket(location.origin.replace("http","ws"));
// après ngrok, on remplacera par l’URL wss

const messagesDiv = document.getElementById("messages");
const input = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const onlineUsers = document.getElementById("onlineUsers");

let username = "";

document.getElementById("loginBtn").onclick = () => {
  username = document.getElementById("username").value.trim();
  if (!username) return alert("Choisis un pseudo !");
  ws.send(JSON.stringify({ type: "login", user: username }));
  document.getElementById("loginArea").style.display = "none";
  document.getElementById("chatArea").style.display = "block";
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "message") {
    const msg = document.createElement("div");
    msg.textContent = `${data.user} (${data.ip}) : ${data.text}`;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  if (data.type === "online") {
    onlineUsers.textContent = "En ligne: " + data.count;
  }
};

sendBtn.onclick = () => {
  const text = input.value.trim();
  if (text) {
    ws.send(JSON.stringify({ type: "message", text }));
    input.value = "";
  }
};