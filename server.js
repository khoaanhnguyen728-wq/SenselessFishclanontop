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

/* ================= DATABASE SYSTEM ================= */

if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");
if (!fs.existsSync("staff.json")) fs.writeFileSync("staff.json", "[]");

let top = JSON.parse(fs.readFileSync("top.json", "utf8"));
let register = JSON.parse(fs.readFileSync("register.json", "utf8"));
let staff = JSON.parse(fs.readFileSync("staff.json", "utf8"));

// Đảm bảo cấu trúc dữ liệu luôn sẵn sàng
function saveTop() {
    fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
}

function saveStaff() {
    fs.writeFileSync("staff.json", JSON.stringify(staff, null, 2));
}

function saveRegister() {
    fs.writeFileSync("register.json", JSON.stringify(register, null, 2));
}

/* ================= DISCORD BOT ================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Thay đổi "ready" thành "clientReady" để hết cảnh báo Deprecation
client.once("clientReady", () => {
    console.log("🤖 Bot đã sẵn sàng:", client.user.tag);
});

/* ================= XỬ LÝ LỆNH SLASH ================= */

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    // --- LỆNH SETTOP ---
    if (commandName === "settop") {
        try {
            await interaction.deferReply(); // Bắt đầu xử lý
            
            const user = options.getUser("user");
            const rank = options.getInteger("top");

            // Đồng bộ: Lưu key là String để API trả về ổn định
            top[String(rank)] = {
                id: user.id,
                name: user.username,
                avatar: user.displayAvatarURL({ extension: "png", size: 256 })
            };

            saveTop();
            await interaction.editReply(`✅ Đã đưa **${user.username}** vào **TOP ${rank}**`);
        } catch (err) {
            console.error("Lỗi settop:", err);
            if (interaction.deferred) await interaction.editReply("❌ Lỗi khi cập nhật bảng xếp hạng.");
        }
    }

    // --- LỆNH DETOP ---
    else if (commandName === "detop") {
        try {
            await interaction.deferReply();
            const user = options.getUser("user");
            let found = false;

            for (let key in top) {
                if (top[key] && top[key].id === user.id) {
                    top[key] = null; // Reset vị trí thay vì delete để giữ cấu trúc mảng cho Web
                    found = true;
                }
            }

            if (found) {
                saveTop();
                await interaction.editReply(`🗑️ Đã xóa **${user.username}** khỏi bảng xếp hạng.`);
            } else {
                await interaction.editReply("❌ Người dùng này không có trong TOP.");
            }
        } catch (err) {
            console.error("Lỗi detop:", err);
        }
    }

    // --- LỆNH PROMOTE ---
    else if (commandName === "promote") {
        try {
            await interaction.deferReply();
            const user = options.getUser("user");
            const role = options.getString("permission");

            staff = staff.filter(s => s.id !== user.id);
            staff.push({
                id: user.id,
                username: user.username,
                role: role,
                avatar: user.displayAvatarURL({ extension: "png", size: 256 })
            });

            saveStaff();
            await interaction.editReply(`✅ **${user.username}** đã trở thành **${role}**`);
        } catch (err) {
            console.error("Lỗi promote:", err);
        }
    }

    // --- LỆNH DEMOTE ---
    else if (commandName === "demote") {
        try {
            await interaction.deferReply();
            const user = options.getUser("user");
            staff = staff.filter(s => s.id !== user.id);
            saveStaff();
            await interaction.editReply(`❌ Đã gỡ quyền Staff của **${user.username}**`);
        } catch (err) {
            console.error("Lỗi demote:", err);
        }
    }

    // --- LỆNH THIDAU ---
    else if (commandName === "thidau") {
        const team1 = options.getString("team1");
        const team2 = options.getString("team2");
        const time = options.getString("time");
        const ref = options.getString("ref");

        const embed = new EmbedBuilder()
            .setTitle("🏆 THÔNG BÁO THI ĐẤU")
            .setColor(0x00eaff)
            .addFields(
                { name: "⚔️ Trận đấu", value: `${team1} VS ${team2}`, inline: false },
                { name: "⏰ Thời gian", value: time, inline: true },
                { name: "🏁 Trọng tài", value: ref, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
});

/* ================= API CHO GIAO DIỆN WEB ================= */

app.get("/", (req, res) => res.send("Senseless Fish Clan API is Running!"));

// API TOP: Tự động điền đầy 20 vị trí để file HTML không bị lỗi
app.get("/top", (req, res) => {
    let responseData = {};
    for (let i = 1; i <= 20; i++) {
        responseData[i] = top[String(i)] || null;
    }
    res.json(responseData);
});

app.get("/staff", (req, res) => {
    res.json(staff);
});

app.get("/roblox/:username", async (req, res) => {
    try {
        const username = req.params.username;
        const userRes = await axios.post("https://users.roblox.com/v1/usernames/users", {
            usernames: [username],
            excludeBannedUsers: true
        });
        if (!userRes.data.data.length) return res.status(404).json({ error: "Không tìm thấy" });
        const userId = userRes.data.data[0].id;
        const thumb = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        res.json({
            userId,
            username,
            displayName: userRes.data.data[0].displayName,
            avatarUrl: thumb.data.data[0].imageUrl
        });
    } catch (e) {
        res.status(500).json({ error: "Lỗi kết nối Roblox" });
    }
});

app.post("/register", async (req, res) => {
    try {
        const { discord, robloxId, stage, time } = req.body;
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
        register.push({ discord, robloxId, stage, time });
        saveRegister();
        const embed = new EmbedBuilder()
            .setTitle("📝 ĐƠN ĐĂNG KÝ THI ĐẤU")
            .setColor(0x00ff00)
            .addFields(
                { name: "👤 Discord", value: discord || "N/A", inline: true },
                { name: "🆔 Roblox ID", value: String(robloxId || "N/A"), inline: true },
                { name: "📊 Giai đoạn", value: stage || "N/A", inline: true },
                { name: "⏰ Giờ hẹn", value: time || "N/A", inline: false }
            )
            .setFooter({ text: "Hệ thống tự động SenselessFish" })
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Không thể gửi dữ liệu lên Discord" });
    }
});

/* ================= KHỞI CHẠY SERVER ================= */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌐 Web Server chạy tại port ${PORT}`));

client.login(process.env.TOKEN).catch(() => console.log("❌ Lỗi: TOKEN Discord không hợp lệ."));
