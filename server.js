require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const app = express();
app.use(express.json());
app.use(cors());

/* ================= DISCORD BOT ================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/* ================= DATABASE ================= */

if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");
if (!fs.existsSync("staff.json")) fs.writeFileSync("staff.json", "[]");

let top = JSON.parse(fs.readFileSync("top.json", "utf8"));
let register = JSON.parse(fs.readFileSync("register.json", "utf8"));
let staff = JSON.parse(fs.readFileSync("staff.json", "utf8"));

// Đảm bảo đủ 20 slot cho bảng xếp hạng
for (let i = 1; i <= 20; i++) {
    if (top[i] === undefined) top[i] = null;
}

function saveStaff() {
    fs.writeFileSync("staff.json", JSON.stringify(staff, null, 2));
}

function saveTop() {
    fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
}

function saveRegister() {
    fs.writeFileSync("register.json", JSON.stringify(register, null, 2));
}

const selectedMatch = new Map();

/* ================= BOT READY ================= */

client.once("ready", () => {
    console.log("🤖 Bot online:", client.user.tag);
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {
    // Xử lý Slash Commands
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        /* /promote */
        if (commandName === "promote") {
            const user = options.getUser("user");
            const role = options.getString("permission");

            // Kiểm tra nếu user đã là staff chưa để cập nhật hoặc thêm mới
            const index = staff.findIndex(s => s.id === user.id);
            if (index !== -1) {
                staff[index].role = role;
            } else {
                staff.push({
                    id: user.id,
                    username: user.username,
                    role: role
                });
            }

            saveStaff();
            return interaction.reply(`✅ **${user.username}** đã được cập nhật vào danh sách Staff với role **${role}**`);
        }

        /* /demote */
        else if (commandName === "demote") {
            const user = options.getUser("user");
            staff = staff.filter(s => s.id !== user.id);
            saveStaff();
            return interaction.reply(`❌ **${user.username}** đã bị gỡ khỏi danh sách Staff`);
        }

        /* /thidau */
        else if (commandName === "thidau") {
            const team1 = options.getString("team1");
            const team2 = options.getString("team2");
            const time = options.getString("time");
            const ref = options.getString("ref");

            const embed = new EmbedBuilder()
                .setTitle("🏆 THÔNG BÁO THI ĐẤU")
                .setColor(0xffcc00)
                .addFields(
                    { name: "⚔️ Trận đấu", value: `${team1} vs ${team2}` },
                    { name: "⏰ Time", value: time, inline: true },
                    { name: "🏁 Ref", value: ref, inline: true }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        /* /settop */
        else if (commandName === "settop") {
            const user = options.getUser("user");
            const rank = options.getInteger("top");

            top[rank] = {
                id: user.id,
                name: user.username,
                avatar: user.displayAvatarURL({ extension: "png", size: 256 })
            };

            saveTop();
            return interaction.reply(`✅ **${user.username}** đã vào **TOP ${rank}**`);
        }

        /* /detop */
        else if (commandName === "detop") {
            const user = options.getUser("user");
            let found = false;

            for (let key in top) {
                if (top[key] && top[key].id === user.id) {
                    top[key] = null;
                    found = true;
                }
            }

            if (found) {
                saveTop();
                return interaction.reply(`🗑️ Đã xoá **${user.username}** khỏi bảng xếp hạng`);
            }
            return interaction.reply("❌ User này không có trong TOP");
        }
    }

    // Xử lý Dropdown
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "match_select") {
            const value = interaction.values[0];
            selectedMatch.set(interaction.user.id, value);
            await interaction.reply({ content: "✅ Đã chọn: " + value, ephemeral: true });
        }
    }

    // Xử lý Button
    if (interaction.isButton()) {
        if (interaction.customId === "score_match") {
            if (!selectedMatch.has(interaction.user.id)) {
                return interaction.reply({ content: "❌ Bạn phải chọn dropdown trước!", ephemeral: true });
            }
            await interaction.reply({ content: "📊 Ref nhập: `!score 5-3`", ephemeral: true });
        }
    }
});

/* ================= SCORE COMMAND (!score) ================= */

client.on("messageCreate", message => {
    if (message.author.bot) return;
    if (!message.content.startsWith("!score")) return;

    const score = message.content.split(" ")[1];
    if (!score) return message.reply("VD: `!score 5-0`");

    message.channel.send(`📊 Kết quả trận đấu: **${score}**`);
});

/* ================= API ENDPOINTS ================= */

app.get("/", (req, res) => res.send("Server running"));

app.get("/top", (req, res) => {
    res.json(top);
});

app.get("/staff", (req, res) => {
    res.json(staff);
});

// Các API Roblox và Register giữ nguyên như cũ...
// [Đoạn code API cũ của bạn]

/* ================= SERVER & LOGIN ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 Server chạy port", PORT));

client.login(process.env.TOKEN).catch(() => console.log("❌ TOKEN Discord sai"));
