// server.js
const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DISCORD_WEBHOOK = "DÁN_WEBHOOK_DISCORD_VÀO_ĐÂY";
const DATA_FILE = "./ranking.json";

app.use(express.static("public"));

function getRanking() {
    return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveRanking(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

io.on("connection", socket => {

    socket.emit("ranking_data", getRanking());

    socket.on("register_top", async data => {
        await axios.post(DISCORD_WEBHOOK, {
            content:
`📢 **ĐĂNG KÝ LEO TOP**
👤 Roblox: **${data.name}**
🆔 Roblox ID: ${data.robloxId}`
        });
    });

    socket.on("update_top", data => {
        saveRanking(data);
        io.emit("ranking_data", data);
    });

});

server.listen(3000, () => {
    console.log("✅ Server running https://khoaanhnguyen728-wq.github.io/SenselessFishclan/");
});