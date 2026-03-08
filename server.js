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

// Khởi tạo các file nếu chưa tồn tại
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");
if (!fs.existsSync("staff.json")) fs.writeFileSync("staff.json", "[]");

let top = JSON.parse(fs.readFileSync("top.json", "utf8"));
let register = JSON.parse(fs.readFileSync("register.json", "utf8"));
let staff = JSON.parse(fs.readFileSync("staff.json", "utf8"));

// Đảm bảo luôn có 20 vị trí trong bảng xếp hạng
for (let i = 1; i <= 20; i++) {
    if (top[i] === undefined) top[i] = null;
}

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

client.once("ready", () => {
    console.log("🤖 Bot đã sẵn sàng:", client.user.tag);
});

/* ================= XỬ LÝ LỆNH SLASH ================= */

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    // --- LỆNH SETTOP ---
    if (commandName === "settop") {
        await interaction.deferReply(); // Chờ xử lý (fix lỗi Unknown Interaction)
        try {
            const user = options.getUser("user");
            const rank = options.getInteger("top");

            top[rank] = {
                id: user.id,
                name: user.username,
                avatar: user.displayAvatarURL({ extension: "png", size: 256 })
            };

            saveTop();
            await interaction.editReply(`✅ Đã đưa **${user.username}** vào **TOP ${rank}**`);
        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Lỗi khi cập nhật bảng xếp hạng.");
        }
    }

    // --- LỆNH DETOP ---
    else if (commandName === "detop") {
        await interaction.deferReply();
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
            await interaction.editReply(`🗑️ Đã xóa **${user.username}** khỏi bảng xếp hạng.`);
        } else {
            await interaction.editReply("❌ Người dùng này không có trong TOP.");
        }
    }

    // --- LỆNH PROMOTE ---
    else if (commandName === "promote") {
        await interaction.deferReply();
        try {
            const user = options.getUser("user");
            const role = options.getString("permission");

            // Xóa cũ nếu đã có để tránh trùng
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
            console.error(err);
            await interaction.editReply("❌ Lỗi khi thêm Staff.");
        }
    }

    // --- LỆNH DEMOTE ---
    else if (commandName === "demote") {
        await interaction.deferReply();
        const user = options.getUser("user");
        staff = staff.filter(s => s.id !== user.id);
        saveStaff();
        await interaction.editReply(`❌ Đã gỡ quyền Staff của **${user.username}**`);
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

// API lấy danh sách TOP
app.get("/top", (req, res) => {
    res.json(top);
});

// API lấy danh sách Staff
app.get("/staff", (req, res) => {
    res.json(staff);
});

// API lấy thông tin Roblox Profile
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

// API Đăng ký thi đấu từ Web
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
        console.error(e);
        res.status(500).json({ error: "Không thể gửi dữ liệu lên Discord" });
    }
});

/* ================= KHỞI CHẠY SERVER ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web Server chạy tại port ${PORT}`));

client.login(process.env.TOKEN).catch(() => console.log("❌ Lỗi: TOKEN Discord không hợp lệ."));
