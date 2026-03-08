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

// ===== DISCORD BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== FILE SETUP =====
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");

let top = JSON.parse(fs.readFileSync("top.json", "utf8"));
let register = JSON.parse(fs.readFileSync("register.json", "utf8"));
const selectedMatch = new Map();

// đảm bảo đủ 20 slot
for (let i = 1; i <= 20; i++) {
  if (top[i] === undefined) top[i] = null;
}

function saveTop() {
  fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
}

function saveRegister() {
  fs.writeFileSync("register.json", JSON.stringify(register, null, 2));
}

// ===== BOT READY =====
client.once("ready", () => {
  console.log("🤖 Bot online: " + client.user.tag);
});

client.on("interactionCreate", async (interaction) => {
  if(interaction.commandName === "thidau"){

const team1 = interaction.options.getString("team1");
const team2 = interaction.options.getString("team2");
const time = interaction.options.getString("time");
const ref = interaction.options.getString("ref");

const msg =
`${team1} vs ${team2}
time: ${time}
ref: ${ref}`;

await interaction.reply(msg);

}
  


  // ===== DROPDOWN =====
  if (interaction.isStringSelectMenu()) {

    const value = interaction.values[0];
    selectedMatch.set(interaction.user.id, value);

    await interaction.reply({
      content: "✅ Đã chọn: " + value,
      ephemeral: true
    });

  }

  // ===== BUTTON SCORE =====
  if (interaction.isButton()) {

    if (interaction.customId === "score_match") {

      if (!selectedMatch.has(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Bạn phải chọn dropdown trước!",
          ephemeral: true
        });
      }

      await interaction.reply({
        content: "📊 Referee nhập score dạng: `!score 5-3`",
        ephemeral: true
      });

    }

  }

});

// ===== SCORE COMMAND =====
client.on("messageCreate", (message) => {
  if (!message.content.startsWith("!score")) return;

  const score = message.content.split(" ")[1];

  if (!score) {
    return message.reply("Vui lòng nhập score! VD: `!score 5-0`");
  }

  message.channel.send(`📊 Score cập nhật: **${score}**`);
});

// ===== API ROUTES =====

app.get("/", (req, res) => {
  res.send("Server running");
});

// ===== GET TOP =====
app.get("/top", (req, res) => {
  res.json(top);
});

// ===== ROBLOX API =====
app.get("/roblox/:username", async (req, res) => {
  try {

    const username = req.params.username;

    const userRes = await axios.post(
      "https://users.roblox.com/v1/usernames/users",
      {
        usernames: [username],
        excludeBannedUsers: true
      }
    );

    if (!userRes.data.data.length) {
      return res.status(404).json({
        error: "Không tìm thấy User Roblox"
      });
    }

    const userId = userRes.data.data[0].id;
    const displayName = userRes.data.data[0].displayName;

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

    console.error("Roblox API error:", err.message);

    res.status(500).json({
      error: "Lỗi Roblox API"
    });
  }
});

// ===== REGISTER API =====
app.post("/register", async (req, res) => {
  try {

    const { discord, robloxId, stage, time } = req.body;

    const CHANNEL_ID = process.env.CHANNEL_ID;

    if (!CHANNEL_ID) {
      return res.status(500).json({
        error: "Thiếu CHANNEL_ID trong .env"
      });
    }

    const channel = await client.channels.fetch(CHANNEL_ID);

    if (!channel) {
      return res.status(500).json({
        error: "Không tìm thấy channel Discord"
      });
    }

    // lưu register.json
    register.push({
      discord,
      robloxId,
      stage,
      time
    });

    saveRegister();

    const embed = new EmbedBuilder()
      .setTitle("🏆 ĐĂNG KÝ THI ĐẤU")
      .setColor(0x00ff00)
      .addFields(
        { name: "👤 Discord", value: discord || "N/A", inline: true },
        { name: "🆔 Roblox ID", value: String(robloxId || "N/A"), inline: true },
        { name: "📊 Stage", value: stage || "N/A", inline: true },
        { name: "⏰ Time", value: time || "N/A", inline: false }
      )
      .setTimestamp()
      .setFooter({
        text: "SenselessFish Clan System"
      });

const dropdown = new StringSelectMenuBuilder()
  .setCustomId("match_select")
  .setPlaceholder("Xem thông tin / Liên hệ")
  .addOptions([
    {
      label: "P1: " + discord,
      value: "p1"
    },
    {
      label: "P2: " + robloxId,
      value: "p2"
    },
    {
      label: "Trọng tài",
      value: "ref"
    }
  ]);

const scoreBtn = new ButtonBuilder()
  .setCustomId("score_match")
  .setLabel("Nhập Score")
  .setStyle(ButtonStyle.Primary);

const row1 = new ActionRowBuilder().addComponents(dropdown);
const row2 = new ActionRowBuilder().addComponents(scoreBtn);

await channel.send({
  embeds: [embed],
  components: [row1, row2]
});

    res.json({
      success: true,
      message: "Đã gửi đăng ký!"
    });

  } catch (err) {

    console.error("Discord send error:", err);

    res.status(500).json({
      error: "Không thể gửi vào Discord"
    });
  }
});

// ===== VIEW REGISTER =====
app.get("/register", (req, res) => {
  res.json(register);
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🌐 Server chạy trên port", PORT);
});

// LOGIN BOT
client.login(process.env.TOKEN).catch(() => {
  console.log("❌ TOKEN Discord sai hoặc thiếu");
});

