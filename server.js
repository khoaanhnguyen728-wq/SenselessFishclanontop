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

// ===== DISCORD BOT SETUP =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== DATABASE FILE SETUP =====
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");

let top = JSON.parse(fs.readFileSync("top.json", "utf8"));
let register = JSON.parse(fs.readFileSync("register.json", "utf8"));
const selectedMatch = new Map();

// Đảm bảo đủ 20 slot cho bảng xếp hạng
for (let i = 1; i <= 20; i++) {
  if (top[i] === undefined) top[i] = null;
}

function saveTop() {
  fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
}

function saveRegister() {
  fs.writeFileSync("register.json", JSON.stringify(register, null, 2));
}

// ===== BOT EVENTS =====
client.once("ready", () => {
  console.log("🤖 Bot online: " + client.user.tag);
});

client.on("interactionCreate", async (interaction) => {
  
  // 1. XỬ LÝ SLASH COMMANDS
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;

    // Lệnh /thidau
    if (commandName === "thidau") {
      const team1 = options.getString("team1");
      const team2 = options.getString("team2");
      const time = options.getString("time");
      const ref = options.getString("ref");

      const msg = `**🏆 THÔNG BÁO THI ĐẤU**\n⚔️ **${team1}** vs **${team2}**\n⏰ Thời gian: ${time}\n🏁 Trọng tài: ${ref}`;
      return await interaction.reply(msg);
    }

    // Lệnh /settop (Cập nhật BXH)
    if (commandName === "settop") {
      const user = options.getUser("user");
      const rank = options.getInteger("top");
      top[rank] = user.username;
      saveTop();
      return await interaction.reply(`✅ Đã đặt **${user.username}** vào **Top ${rank}**`);
    }

    // Lệnh /detop (Xóa khỏi BXH)
    if (commandName === "detop") {
      const user = options.getUser("user");
      let found = false;
      for (let key in top) {
        if (top[key] === user.username) {
          top[key] = null;
          found = true;
        }
      }
      if (found) {
        saveTop();
        return await interaction.reply(`✅ Đã xóa **${user.username}** khỏi bảng xếp hạng.`);
      }
      return await interaction.reply(`❌ Không tìm thấy user này trong Top.`);
    }
  }

  // 2. XỬ LÝ DROPDOWN (Chọn thông tin)
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "match_select") {
      const value = interaction.values[0];
      selectedMatch.set(interaction.user.id, value);

      await interaction.reply({
        content: "✅ Đã chọn đối tượng: " + value,
        ephemeral: true
      });
    }
  }

  // 3. XỬ LÝ BUTTON (Nhấn nút nhập điểm)
  if (interaction.isButton()) {
    if (interaction.customId === "score_match") {
      if (!selectedMatch.has(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Bạn phải chọn trong Dropdown trước!",
          ephemeral: true
        });
      }

      await interaction.reply({
        content: "📊 Referee hãy nhập điểm theo cú pháp: `!score [số điểm]` (VD: `!score 5-0`)",
        ephemeral: true
      });
    }
  }
});

// ===== SCORE COMMAND (PREFIX !)
client.on("messageCreate", (message) => {
  if (message.author.bot || !message.content.startsWith("!score")) return;

  const score = message.content.split(" ")[1];
  if (!score) {
    return message.reply("Vui lòng nhập score! VD: `!score 5-0`");
  }

  message.channel.send(`📊 **Cập nhật kết quả:** Trận đấu kết thúc với tỉ số **${score}**`);
});

// ===== API ROUTES FOR WEB =====

app.get("/", (req, res) => res.send("Server running"));

app.get("/top", (req, res) => res.json(top)); // Lấy danh sách Top 20

// ROBLOX API: Kiểm tra thông tin người chơi
app.get("/roblox/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const userRes = await axios.post("https://users.roblox.com/v1/usernames/users", {
      usernames: [username],
      excludeBannedUsers: true
    });

    if (!userRes.data.data.length) return res.status(404).json({ error: "Không tìm thấy User Roblox" });

    const userId = userRes.data.data[0].id;
    const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);

    res.json({
      userId,
      username,
      displayName: userRes.data.data[0].displayName,
      avatarUrl: thumbRes.data.data[0].imageUrl
    });
  } catch (err) {
    res.status(500).json({ error: "Lỗi hệ thống Roblox" });
  }
});

// REGISTER API: Tiếp nhận đăng ký từ Web và gửi vào Discord
app.post("/register", async (req, res) => {
  try {
    const { discord, robloxId, stage, time } = req.body;
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    if (!channel) return res.status(500).json({ error: "Không tìm thấy channel Discord" });

    register.push({ discord, robloxId, stage, time });
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
      .setFooter({ text: "SenselessFish Clan System" })
      .setTimestamp();

    const dropdown = new StringSelectMenuBuilder()
      .setCustomId("match_select")
      .setPlaceholder("Chọn thông tin cần xem")
      .addOptions([
        { label: "Người chơi: " + discord, value: "player_" + discord },
        { label: "Roblox ID: " + robloxId, value: "roblox_" + robloxId },
        { label: "Trọng tài điều hành", value: "referee_call" }
      ]);

    const scoreBtn = new ButtonBuilder()
      .setCustomId("score_match")
      .setLabel("Nhập kết quả (Ref)")
      .setStyle(ButtonStyle.Success);

    const row1 = new ActionRowBuilder().addComponents(dropdown);
    const row2 = new ActionRowBuilder().addComponents(scoreBtn);

    await channel.send({ embeds: [embed], components: [row1, row2] });

    res.json({ success: true, message: "Đăng ký thành công!" });
  } catch (err) {
    res.status(500).json({ error: "Lỗi gửi dữ liệu Discord" });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 Server is online on port", PORT));

client.login(process.env.TOKEN).catch(() => console.log("❌ TOKEN Discord không hợp lệ"));
