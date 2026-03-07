require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const fs = require("fs");
const cors = require("cors");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();
app.use(express.json());
app.use(cors());

let top = {};

// Khởi tạo & Đảm bảo luôn đủ 20 slot trong bộ nhớ
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
try {
    top = JSON.parse(fs.readFileSync("top.json", "utf8"));
} catch (e) {
    top = {};
}

// Quan trọng: Đảm bảo dữ liệu luôn đủ từ 1-20 để Frontend không bị lỗi
for (let i = 1; i <= 20; i++) {
    if (top[i] === undefined) top[i] = null;
}

function saveTop() { fs.writeFileSync("top.json", JSON.stringify(top, null, 2)); }

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    try {
        if (commandName === "settop") {
            await interaction.deferReply();
            const user = options.getUser("user");
            const topRank = options.getInteger("top");

            if (topRank < 1 || topRank > 20) return interaction.editReply("Chỉ hỗ trợ Top 1 - 20");

            // Xóa user nếu đang ở top khác
            for (let i in top) {
                if (top[i] && top[i].id === user.id) top[i] = null;
            }

            top[topRank] = {
                id: user.id,
                name: user.username,
                avatar: user.displayAvatarURL({ extension: 'png', size: 256 })
            };

            saveTop();
            await interaction.editReply(`👑 Đã đặt **${user.username}** vào **TOP ${topRank}**`);
        }

        if (commandName === "detop") {
            await interaction.deferReply();
            const user = options.getUser("user");
            let found = false;
            for (let i in top) {
                if (top[i] && top[i].id === user.id) {
                    top[i] = null;
                    found = true;
                }
            }
            if (found) {
                saveTop();
                await interaction.editReply(`❌ Đã xóa **${user.username}** khỏi bảng xếp hạng.`);
            } else {
                await interaction.editReply(`⚠️ Không tìm thấy người dùng này trong Top.`);
            }
        }
    } catch (err) {
        console.error(err);
        if (!interaction.replied) await interaction.editReply("❌ Có lỗi xảy ra.");
    }
});

app.get("/top", (req, res) => {
    res.json(top);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 API RUNNING ON PORT: " + PORT));
client.login(process.env.TOKEN);
