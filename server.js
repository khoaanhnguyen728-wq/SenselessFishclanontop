require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const fs = require("fs");
const cors = require("cors"); // Thêm thư viện CORS

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const app = express();
app.use(express.json());
app.use(cors()); // Cho phép Frontend truy cập API

let database = [];
let top = {};

// Khởi tạo file nếu chưa có để tránh lỗi crash
if (!fs.existsSync("database.json")) fs.writeFileSync("database.json", "[]");
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");

database = JSON.parse(fs.readFileSync("database.json", "utf8"));
top = JSON.parse(fs.readFileSync("top.json", "utf8"));

function saveDB() { fs.writeFileSync("database.json", JSON.stringify(database, null, 2)); }
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

      // Xóa user này nếu họ đang ở vị trí Top khác
      for (let i in top) {
        if (top[i] && top[i].id === user.id) top[i] = null;
      }

      // Ghi đè vị trí mới
      top[topRank] = {
        id: user.id,
        name: user.username,
        avatar: user.displayAvatarURL({ extension: 'png', size: 256 })
      };

      saveTop();
      await interaction.editReply(`👑 Đã đặt **${user.username}** vào **TOP ${topRank}**`);
    }
    // Các lệnh promote/demote/detop giữ nguyên logic cũ nhưng thêm xử lý lỗi...
  } catch (err) {
    console.error(err);
    interaction.editReply("❌ Có lỗi xảy ra với Bot.");
  }
});

app.get("/top", (req, res) => {
  res.json(top);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 API RUNNING ON PORT: " + PORT));
client.login(process.env.TOKEN);
