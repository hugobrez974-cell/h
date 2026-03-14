document.getElementById("resa-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    nom: nom.value,
    email: email.value,
    bungalow: bungalow.value,
    debut: debut.value,
    fin: fin.value
  };

  const res = await fetch("/api/reserver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const json = await res.json();

  if (json.error) {
    message.textContent = "❌ " + json.error;
    message.style.color = "red";
  } else {
    message.textContent = "✅ Réservation confirmée !";
    message.style.color = "green";
  }
});