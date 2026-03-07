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

// Khởi tạo dữ liệu
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
try {
    top = JSON.parse(fs.readFileSync("top.json", "utf8"));
} catch (e) {
    top = {};
}

// Đảm bảo đủ 20 slot
for (let i = 1; i <= 20; i++) {
    if (top[i] === undefined) top[i] = null;
}

function saveTop() { fs.writeFileSync("top.json", JSON.stringify(top, null, 2)); }

// Đóng gói logic vào hàm async để tránh lỗi ERR_AMBIGUOUS_MODULE_SYNTAX
async function startBot() {
    client.on("interactionCreate", async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const { commandName, options } = interaction;

        try {
            if (commandName === "settop") {
                await interaction.deferReply();
                const user = options.getUser("user");
                const topRank = options.getInteger("top");

                if (topRank < 1 || topRank > 20) return interaction.editReply("Chỉ hỗ trợ Top 1 - 20");

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
            // Thêm lệnh detop nếu cần...
        } catch (err) {
            console.error(err);
        }
    });

    await client.login(process.env.TOKEN);
}
if (commandName === "detop") {
    await interaction.deferReply();

    const user = options.getUser("user");

    let removed = false;

    for (let i in top) {
        if (top[i] && top[i].id === user.id) {
            top[i] = null;
            removed = true;
        }
    }

    if (!removed) {
        return interaction.editReply(`❌ ${user.username} không có trong bảng TOP.`);
    }

    saveTop();

    await interaction.editReply(`🗑️ Đã xoá **${user.username}** khỏi bảng TOP.`);
}

app.get("/top", (req, res) => { res.json(top); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🌐 API RUNNING ON PORT: " + PORT);
    startBot().catch(console.error); // Khởi chạy Bot sau khi Server Express sẵn sàng
});
