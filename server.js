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

// Khởi tạo 20 slot trống nếu chưa có
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
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    /* /promote - Thêm Staff có kèm Avatar */
    if (commandName === "promote") {
        await interaction.deferReply(); // Tránh lỗi Unknown Interaction (quá 3s)
        try {
            const user = options.getUser("user");
            const role = options.getString("permission");

            const index = staff.findIndex(s => s.id === user.id);
            const staffData = {
                id: user.id,
                username: user.username,
                role: role,
                avatar: user.displayAvatarURL({ extension: "png", size: 256 })
            };

            if (index !== -1) {
                staff[index] = staffData;
            } else {
                staff.push(staffData);
            }

            saveStaff();
            await interaction.editReply(`✅ **${user.username}** đã được bổ nhiệm làm **${role}** (Đã cập nhật ảnh đại diện)`);
        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Có lỗi xảy ra khi thực hiện lệnh.");
        }
    }

    /* /demote */
    else if (commandName === "demote") {
        await interaction.deferReply();
        const user = options.getUser("user");
        staff = staff.filter(s => s.id !== user.id);
        saveStaff();
        await interaction.editReply(`❌ Đã gỡ **${user.username}** khỏi danh sách Staff`);
    }

    /* /settop - Cập nhật Name và Avatar cho Top */
    else if (commandName === "settop") {
        await interaction.deferReply();
        try {
            const user = options.getUser("user");
            const rank = options.getInteger("top");

            top[rank] = {
                id: user.id,
                name: user.username, // Lưu username dạng chuỗi
                avatar: user.displayAvatarURL({ extension: "png", size: 256 })
            };

            saveTop();
            await interaction.editReply(`✅ Đã cập nhật **${user.username}** vào **TOP ${rank}**`);
        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Lỗi khi thiết lập TOP.");
        }
    }

    /* /detop */
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
            await interaction.editReply(`🗑️ Đã xoá **${user.username}** khỏi bảng xếp hạng`);
        } else {
            await interaction.editReply("❌ Người dùng này hiện không có trong TOP");
        }
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

        await interaction.reply({ embeds: [embed] });
    }
});

/* ================= API ENDPOINTS ================= */

app.get("/", (req, res) => res.send("Server đang chạy tốt!"));

app.get("/top", (req, res) => {
    res.json(top);
});

app.get("/staff", (req, res) => {
    res.json(staff);
});

/* API Roblox Profile */
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
        res.status(500).json({ error: "Lỗi Roblox API" });
    }
});

/* API Đăng ký từ Web */
app.post("/register", async (req, res) => {
    try {
        const { discord, robloxId, stage, time } = req.body;
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);

        register.push({ discord, robloxId, stage, time });
        saveRegister();

        const embed = new EmbedBuilder()
            .setTitle("🏆 ĐĂNG KÝ THI ĐẤU")
            .setColor(0x00ff00)
            .addFields(
                { name: "👤 Discord", value: discord || "N/A", inline: true },
                { name: "🆔 Roblox", value: String(robloxId || "N/A"), inline: true },
                { name: "📊 Stage", value: stage || "N/A", inline: true },
                { name: "⏰ Time", value: time || "N/A" }
            )
            .setFooter({ text: "SenselessFish Clan" })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Lỗi gửi tin nhắn đến Discord" });
    }
});

/* ================= SERVER & LOGIN ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 Server chạy port", PORT));

client.login(process.env.TOKEN).catch(() => console.log("❌ TOKEN Discord sai"));
