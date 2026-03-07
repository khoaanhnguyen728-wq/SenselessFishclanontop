require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const express = require("express");
const fs = require("fs");
const cors = require("cors");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const app = express();
app.use(express.json());
app.use(cors());

let top = {};

// --- 1. KHỞI TẠO DỮ LIỆU ---
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

function saveTop() { 
    fs.writeFileSync("top.json", JSON.stringify(top, null, 2)); 
}

// --- 2. LOGIC DISCORD BOT ---

client.once("ready", () => {
    console.log(`🤖 Bot online: ${client.user.tag}`);
});

// Xử lý Command (Slash Commands)
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    try {
        if (commandName === "settop") {
            await interaction.deferReply();
            const user = options.getUser("user");
            const topRank = options.getInteger("top");

            if (topRank < 1 || topRank > 20) {
                return interaction.editReply("Chỉ hỗ trợ Top 1 - 20");
            }

            // Xóa user cũ nếu đã có ở vị trí khác
            for (let i in top) {
                if (top[i] && top[i].id === user.id) top[i] = null;
            }

            top[topRank] = {
                id: user.id,
                name: user.username,
                avatar: user.displayAvatarURL({ size: 256 })
            };

            saveTop();
            await interaction.editReply(`👑 Đã đặt **${user.username}** vào **TOP ${topRank}**`);
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

            if (!removed) return interaction.editReply(`❌ ${user.username} không có trong bảng TOP.`);
            
            saveTop();
            await interaction.editReply(`🗑️ Đã xoá **${user.username}** khỏi bảng TOP.`);
        }
    } catch (err) {
        console.error(err);
    }
});

// Xử lý nút bấm (Button)
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId === "score_match") {
        await interaction.reply({
            content: "Referee nhập score dạng: `!score 5-3`",
            ephemeral: true
        });
    }
});

// Xử lý tin nhắn (Lệnh !score)
client.on("messageCreate", message => {
    if (!message.content.startsWith("!score")) return;
    const score = message.content.split(" ")[1];
    if (!score) return message.reply("Vui lòng nhập score. VD: `!score 5-3`");
    message.channel.send(`📊 Score đã cập nhật: **${score}**`);
});

// --- 3. LOGIC API (EXPRESS) ---

app.get("/top", (req, res) => {
    res.json(top);
});

app.post("/register", async (req, res) => {
    try {
        const { discord, robloxId, stage, time } = req.body;
        const CHANNEL_ID = process.env.CHANNEL_ID;
        const channel = await client.channels.fetch(CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setTitle("🏆 ĐĂNG KÝ THI ĐẤU")
            .setColor(0x00AEFF)
            .addFields(
                { name: "👤 Discord", value: discord || "N/A", inline: true },
                { name: "🆔 Roblox ID", value: String(robloxId) || "N/A", inline: true },
                { name: "📊 Stage", value: stage || "N/A", inline: true },
                { name: "⏰ Time", value: time || "N/A", inline: true }
            )
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId("score_match")
            .setLabel("Nhập Score")
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        res.json({ success: true, message: "Đã gửi đăng ký vào Discord" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 4. CHẠY SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("🌐 API RUNNING ON PORT: " + PORT);
    client.login(process.env.TOKEN).catch(console.error);
});
