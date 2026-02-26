const socket = io();

async function getAvatar(id) {
    const res = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`
    );
    const data = await res.json();
    return data.data[0].imageUrl;
}

socket.on("ranking", async data => {
    let html = "";

    for (const p of data) {
        const avatar = await getAvatar(p.robloxId);

        html += `
        <div class="card ${p.rank === 1 ? "top1" : ""}">
            ${p.rank === 1 ? "<div class='crown'>👑</div>" : ""}
            <img src="${avatar}">
            <h3>#${p.rank}</h3>
            <p>${p.stage}</p>
            <button onclick="openRoblox(${p.robloxId})">Roblox</button>
        </div>`;
    }

    document.getElementById("top").innerHTML = html;
});

function openRoblox(id) {
    window.open(`https://www.roblox.com/users/${id}/profile`);
}
