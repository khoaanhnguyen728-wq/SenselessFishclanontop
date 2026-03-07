require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios"); // Thêm thư viện này

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const app = express();
app.use(express.json());
app.use(cors());

// ===== DISCORD BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent // BẮT BUỘC phải bật cái này trong Discord Developer Portal -> Bot
  ]
});

// ===== TOP DATA =====
let top = {};
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");

try {
  top = JSON.parse(fs.readFileSync("top.json", "utf8"));
} catch {
  top = {};
}

// Đảm bảo luôn đủ 20 slot
for (let i = 1; i <= 20; i++) {
  if (top[i] === undefined) top[i] = null;
}

function saveTop() {
  fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
}

// ===== BOT EVENTS =====
client.once("ready", () => {
  console.log("🤖 Bot online: " + client.user.tag);
});

// Xử lý nút bấm
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId === "score_match") {
    await interaction.reply({
      content: "Referee nhập score dạng: `!score 5-3`",
      ephemeral: true
    });
  }
});

// Lệnh cập nhật điểm bằng tin nhắn
client.on("messageCreate", (message) => {
  if (!message.content.startsWith("!score")) return;
  const score = message.content.split(" ")[1];
  if (!score) return message.reply("Vui lòng nhập score! VD: `!score 5-0` ");
  message.channel.send(`📊 Score cập nhật: **${score}**`);
});

// ===== API ROUTES =====

// Test route
app.get("/", (req, res) => {
  res.send("Server running");
});

// Lấy danh sách TOP
app.get("/top", (req, res) => {
  res.json(top);
});

// API ROBLOX: Lấy ID và Avatar từ Username
app.get("/roblox/:username", async (req, res) => {
  try {
    const username = req.params.username;

    // 1. Lấy UserId từ Username
    const userRes = await axios.post("https://users.roblox.com/v1/usernames/users", {
      usernames: [username],
      excludeBannedUsers: true
    });

    if (!userRes.data.data.length) {
      return res.status(404).json({ error: "Không tìm thấy User Roblox này" });
    }

    const userId = userRes.data.data[0].id;
    const displayName = userRes.data.data[0].displayName;

    // 2. Lấy Ảnh đại diện (Headshot)
    const thumbRes = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
    );
    const avatarUrl = thumbRes.data.data[0].imageUrl;

    res.json({
      userId,
      username,
      displayName,
      avatarUrl
    });
  } catch (err) {
    console.error("Lỗi Roblox API:", err.message);
    res.status(500).json({ error: "Lỗi khi lấy dữ liệu Roblox" });
  }
});

// API Đăng ký thi đấu (Gửi vào Discord)
app.post("/register", async (req, res) => {
  try {
    const { discord, robloxId, stage, time } = req.body;
    const CHANNEL_ID = process.env.CHANNEL_ID;

    if (!CHANNEL_ID) {
        return res.status(500).json({ error: "Chưa cấu hình CHANNEL_ID trong .env" });
    }

    const channel = await client.channels.fetch(CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setTitle("🏆 ĐĂNG KÝ THI ĐẤU")
      .setColor(0x00ff00) // Màu xanh lá cho nổi bật
      .addFields(
        { name: "👤 Discord", value: discord || "N/A", inline: true },
        { name: "🆔 Roblox ID", value: String(robloxId) || "N/A", inline: true },
        { name: "📊 Stage", value: stage || "N/A", inline: true },
        { name: "⏰ Time", value: time || "N/A", inline: false }
      )
      .setTimestamp()
      .setFooter({ text: "Hệ thống đăng ký tự động" });

    const button = new ButtonBuilder()
      .setCustomId("score_match")
      .setLabel("Nhập Score")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({
      embeds: [embed],
      components: [row]
    });

    res.json({ success: true, message: "Đã gửi đơn đăng ký!" });
  } catch (err) {
    console.error("Lỗi gửi Discord:", err);
    res.status(500).json({ error: "Không thể gửi đơn đăng ký vào Discord" });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🌐 API RUNNING ON PORT " + PORT);
  client.login(process.env.TOKEN).catch(err => {
      console.error("Lỗi Login Bot Discord: Kiểm tra TOKEN trong .env");
  });
});
