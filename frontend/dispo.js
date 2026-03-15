async function chargerDisponibilites(bungalow) {
  const res = await fetch(`/api/disponibilites?bungalow=${bungalow}`);
  return await res.json();
}

function genererCalendrier(bungalow) {
  const container = document.getElementById(`cal-${bungalow}`);
  if (!container) return;

  const aujourdHui = new Date();
  const mois = aujourdHui.getMonth();
  const annee = aujourdHui.getFullYear();

  chargerDisponibilites(bungalow).then(dispos => {
    container.innerHTML = "";

    const titre = document.createElement("h3");
    titre.textContent = `Disponibilités – ${bungalow}`;
    container.appendChild(titre);

    const table = document.createElement("table");
    table.classList.add("calendrier");

    const jours = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const header = document.createElement("tr");
    jours.forEach(j => {
      const th = document.createElement("th");
      th.textContent = j;
      header.appendChild(th);
    });
    table.appendChild(header);

    const date = new Date(annee, mois, 1);
    let ligne = document.createElement("tr");

    for (let i = 0; i < (date.getDay() + 6) % 7; i++) {
      ligne.appendChild(document.createElement("td"));
    }

    while (date.getMonth() === mois) {
      const td = document.createElement("td");
      td.textContent = date.getDate();

      const iso = date.toISOString().split("T")[0];

      if (dispos.includes(iso)) {
        td.classList.add("occupe");
      } else {
        td.classList.add("libre");
        td.onclick = () => {
          window.location.href = `/reservation.html?bungalow=${bungalow}&date=${iso}`;
        };
      }

      ligne.appendChild(td);

      if (date.getDay() === 0) {
        table.appendChild(ligne);
        ligne = document.createElement("tr");
      }

      date.setDate(date.getDate() + 1);
    }

    table.appendChild(ligne);
    container.appendChild(table);
  });
}

genererCalendrier("bungalow1");
genererCalendrier("bungalow2");
