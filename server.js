require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();
app.use(express.json());
app.use(cors());

let top = {};

// Load Database
if (fs.existsSync("top.json")) {
    try {
        top = JSON.parse(fs.readFileSync("top.json", "utf8"));
    } catch (e) {
        top = {};
    }
}

// Đảm bảo đủ 20 slot
for (let i = 1; i <= 20; i++) {
    if (top[i] === undefined) top[i] = null;
}

function saveTop() { 
    fs.writeFileSync("top.json", JSON.stringify(top, null, 2)); 
}

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    try {
        if (commandName === "settop") {
            await interaction.deferReply();
            const robloxId = options.getString("roblox_id"); // Nhập ID Roblox
            const displayName = options.getString("name");   // Nhập tên hiển thị
            const topRank = options.getInteger("top");

            if (topRank < 1 || topRank > 20) return interaction.editReply("Chỉ hỗ trợ Top 1 - 20");

            // Lấy ảnh đại diện từ Roblox dựa trên ID
            const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`);
            const avatarUrl = thumbRes.data.data[0]?.imageUrl || "https://tr.rbxcdn.com/30day-avatar/150/150/AvatarHeadshot/Png/isCircular=false";

            // Xóa người cũ nếu trùng ID
            for (let i in top) {
                if (top[i] && top[i].id === robloxId) top[i] = null;
            }

            top[topRank] = {
                id: robloxId,
                name: displayName,
                avatar: avatarUrl
            };

            saveTop();
            await interaction.editReply(`👑 Đã đặt **${displayName}** (Roblox ID: ${robloxId}) vào **TOP ${topRank}**`);
        }

        if (commandName === "detop") {
            await interaction.deferReply();
            const topRank = options.getInteger("top");
            if (top[topRank]) {
                const oldName = top[topRank].name;
                top[topRank] = null;
                saveTop();
                await interaction.editReply(`❌ Đã xóa **${oldName}** khỏi TOP ${topRank}`);
            } else {
                await interaction.editReply(`⚠️ Vị trí TOP ${topRank} đang trống.`);
            }
        }
    } catch (err) {
        console.error(err);
        if (!interaction.replied) await interaction.editReply("❌ Lỗi: Có thể ID Roblox không hợp lệ.");
    }
});

// API cho Web
app.get("/top", (req, res) => res.json(top));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 API RUNNING ON PORT: " + PORT));
client.login(process.env.TOKEN);
