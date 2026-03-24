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
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const app = express();
app.use("/image", express.static("images"));
app.use(express.json());
app.use(cors());

/* ================= DATABASE ================= */
if (!fs.existsSync("blacklist.json")) fs.writeFileSync("blacklist.json", "[]");
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");
if (!fs.existsSync("staff.json")) fs.writeFileSync("staff.json", "[]");
if (!fs.existsSync("mainers.json")) fs.writeFileSync("mainers.json", "[]");

let blacklist = JSON.parse(fs.readFileSync("blacklist.json"));
let top = JSON.parse(fs.readFileSync("top.json"));
let register = JSON.parse(fs.readFileSync("register.json"));
let staff = JSON.parse(fs.readFileSync("staff.json"));
let mainers = JSON.parse(fs.readFileSync("mainers.json"));

for (let i = 1; i <= 20; i++) { if (!top[i]) top[i] = null; }

const saveBlacklist = () => fs.writeFileSync("blacklist.json", JSON.stringify(blacklist, null, 2));
const saveTop = () => fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
const saveStaff = () => fs.writeFileSync("staff.json", JSON.stringify(staff, null, 2));
const saveRegister = () => fs.writeFileSync("register.json", JSON.stringify(register, null, 2));
const saveMainers = () => fs.writeFileSync("mainers.json", JSON.stringify(mainers, null, 2));

const ROLE_MAP = {
    "Founder": process.env.ROLE_FOUNDER,
    "Senior Developer": process.env.ROLE_SENIOR_DEV,
    "Developer": process.env.ROLE_DEV,
    "Admin": process.env.ROLE_ADMIN,
    "Junior Developer": process.env.ROLE_JUNIOR_DEV,
    "Mod": process.env.ROLE_MOD,
    "Rank Management": process.env.ROLE_RANK,
    "Experienced Referee": process.env.ROLE_EXP_REF,
    "Referee": process.env.ROLE_REF,
    "Tryout host": process.env.ROLE_TRYOUT,
    "Training host": process.env.ROLE_TRAIN
};

const LOG_CHANNEL = process.env.LOG_CHANNEL;

// ✅ FIX CHUẨN
function hasPermission(member) {
    if (!process.env.ADMIN_ROLE) return false;

    const roles = process.env.ADMIN_ROLE.split(",").map(r => r.trim());

    return roles.some(roleId => member.roles.cache.has(roleId));
}

/* ================= DISCORD BOT ================= */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOP_CHANNEL = process.env.TOP_CHANNEL;
const TOP_MESSAGE = process.env.TOP_MESSAGE;
let lastTopData = "";
let stats = { total: 0, online: 0 };
const selected = new Map();

client.once("ready", () => {
    console.log("Bot online:", client.user.tag);
    setInterval(updateLeaderboard, 10000);
    setInterval(() => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return;
        stats.total = guild.memberCount;
        stats.online = guild.members.cache.filter(m =>
            m.presence && ["online", "idle", "dnd"].includes(m.presence.status)
        ).size;
    }, 10000);
});

async function updateLeaderboard() {
    try {
        const res = await axios.get("https://senselessfishclanontop-1.onrender.com/top");
        const data = res.data || {};
        if (JSON.stringify(data) === lastTopData) return;
        lastTopData = JSON.stringify(data);

        let text = `━━━━━━━━ 👑 TOP 1 👑 ━━━━━━━━\n⭐ **${data[1]?.id ? `<@${data[1].id}>` : "Vacant"}**\n━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `🥈 **TOP 2** • ${data[2]?.id ? `<@${data[2].id}>` : "Vacant"}\n`;
        text += `🥉 **TOP 3** • ${data[3]?.id ? `<@${data[3].id}>` : "Vacant"}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n`;

        for (let i = 4; i <= 20; i++) {
            text += `⁠⊱ **TOP ${i}** • ${data[i]?.id ? `<@${data[i].id}>` : "Vacant"}\n`;
        }

        const embed = new EmbedBuilder()
            .setColor("#00eaff")
            .setTitle("🏆 SENSELESS FISH CLAN LEADERBOARD")
            .setDescription(text)
            .setTimestamp();

        const channel = await client.channels.fetch(TOP_CHANNEL);
        const message = await channel.messages.fetch(TOP_MESSAGE);
        await message.edit({ embeds: [embed] });
    } catch (err) { console.log("Lỗi update leaderboard:", err.message); }
}

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

            if (commandName === "blacklist") {
                await interaction.deferReply();
                const user = options.getUser("user");
                const reason = options.getString("reason") || "Không có";
                blacklist = blacklist.filter(b => b.id !== user.id);
                blacklist.push({ id: user.id, name: user.username, reason, time: new Date().toLocaleString("vi-VN") });
                saveBlacklist();
                const embed = new EmbedBuilder().setTitle("🚫 BLACKLIST").setColor("#ff0000").addFields({ name: "User", value: `<@${user.id}>` }, { name: "Lý do", value: reason });
                return interaction.editReply({ embeds: [embed] });
            }

            if (commandName === "unblacklist") {
                const user = options.getUser("user");
                blacklist = blacklist.filter(b => b.id !== user.id);
                saveBlacklist();
                return interaction.reply(`✅ Đã gỡ blacklist **${user.username}**`);
            }

            if (commandName === "bxh") {
                const sub = options.getSubcommand();
if (sub === "aov") {
    await interaction.deferReply();
    
    let text = "\n"; 

    // Hàm hỗ trợ lấy emoji an toàn
    const getEmoji = (id, fallback) => client.emojis.cache.get(id) || fallback;

    // TOP 1
    let t1 = top[1]?.id ? `<@${top[1].id}>` : "*Trống*";
    text += `${getEmoji("1485571100900458499", "👑")} **ＴＯＰ  １**\n╚═⭐ ${t1}\n\n`;

    // TOP 2 & 3
    let t2 = top[2]?.id ? `<@${top[2].id}>` : "*Trống*";
    let t3 = top[3]?.id ? `<@${top[3].id}>` : "*Trống*";
    
    text += `${getEmoji("1485571314420027403", "🥈")} **ＴＯＰ  ２**\n╚═ ${t2}\n\n`;
    text += `${getEmoji("1485571314420027403", "🥉")} **ＴＯＰ  ３**\n╚═ ${t3}\n\n`;

    text += `──────────────────\n\n`;

    // Các TOP còn lại
    for (let i = 4; i <= 20; i++) {
        let user = top[i]?.id ? `<@${top[i].id}>` : "*Vacant*";
        text += `➠ **ＴＯＰ  ${i}** • ${user}\n\n`; 
    }

    const embed = new EmbedBuilder()
        .setTitle("🏆 SENSELESS FISH CLAN LEADERBOARD")
        .setDescription(text)
        .setColor("#00eaff")
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: "Dữ liệu cập nhật tự động", iconURL: client.user.displayAvatarURL() });

    return interaction.editReply({ embeds: [embed] });
}
                
                if (sub === "kill" || sub === "chat") return interaction.reply({ content: "Tính năng đang phát triển.", ephemeral: true });
            }

            if (commandName === "list") {
                await interaction.deferReply();
                const type = options.getString("type");
                let text = "";
                if (type === "top") Object.keys(top).forEach(i => { if (top[i]) text += `🏆 **TOP ${i}** • ${top[i].name}\n` });
                if (type === "staff") staff.forEach(s => text += `👑 **${s.username}** • ${s.role}\n`);
                if (type === "mainers") mainers.forEach(m => text += `🔥 **${m.name}**\n`);
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`📋 Danh sách ${type}`).setDescription(text || "Không có dữ liệu").setColor(0x00eaff)] });
            }

            if (commandName === "settop") {
                const user = options.getUser("user");
                const rank = options.getInteger("top");
                top[rank] = { id: user.id, name: user.username, avatar: user.displayAvatarURL({ extension: "png" }), profile: `https://discord.com/users/${user.id}` };
                saveTop();
                updateLeaderboard();
                return interaction.reply(`✅ Đã đưa **${user.username}** vào **TOP ${rank}**`);
            }

if (commandName === "promote") {
    await interaction.deferReply(); // ✅ thêm dòng này

    const user = options.getUser("user");
    const roleName = options.getString("permission");

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasPermission(member)) {
        return interaction.editReply("❌ Bạn không có quyền dùng lệnh này");
    }

    const target = await interaction.guild.members.fetch(user.id);

    const roleId = ROLE_MAP[roleName];
    if (!roleId) return interaction.editReply("❌ Role không tồn tại");

    const newRole = interaction.guild.roles.cache.get(roleId);
    if (!newRole) return interaction.editReply("❌ Không tìm thấy role");

    // ❗ Xóa role cũ
    for (let r of Object.values(ROLE_MAP)) {
        let role = interaction.guild.roles.cache.get(r);
        if (role && target.roles.cache.has(role.id)) {
            await target.roles.remove(role);
        }
    }

    // ➕ Add role mới
    await target.roles.add(newRole);

    // 💾 Lưu JSON
    staff = staff.filter(s => s.id !== user.id);
    staff.push({
        id: user.id,
        username: user.username,
        role: roleName,
        avatar: user.displayAvatarURL({ extension: "png" })
    });
    saveStaff();

    // 📜 LOG
const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);

if (logChannel) {
    const embed = new EmbedBuilder()
        .setColor("#00ffcc")
        .setTitle("📢 ROLE UPDATE")
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: " User", value: `<@${user.id}>`, inline: true },
            { name: " Role", value: roleName, inline: true },
            { name: " Action", value: "Promote", inline: true },
            { name: " By", value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({
            text: `ID: ${user.id}`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    logChannel.send({ embeds: [embed] });
}

    return interaction.editReply(`✅ ${user.username} đã được set role **${roleName}**`);
}
            if (commandName === "detop") {
    const user = options.getUser("user");

    let found = false;

    for (let i in top) {
        if (top[i] && top[i].id === user.id) {
            top[i] = null;
            found = true;
        }
    }

    if (found) {
        saveTop();
        updateLeaderboard();
        return interaction.reply(`🗑️ Đã xóa **${user.username}** khỏi TOP`);
    }

    return interaction.reply("❌ User không có trong TOP");
}

/* ===== DEMOTE ===== */
if (commandName === "demote") {
    const user = options.getUser("user");

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasPermission(member)) {
        return interaction.reply({ content: "❌ Bạn không có quyền dùng lệnh này", ephemeral: true });
    }

    const target = await interaction.guild.members.fetch(user.id);

    // ❗ Xóa role staff
    for (let r of Object.values(ROLE_MAP)) {
        let role = interaction.guild.roles.cache.get(r);
        if (role && target.roles.cache.has(role.id)) {
            await target.roles.remove(role);
        }
    }

    // 💾 Xóa JSON
    staff = staff.filter(s => s.id !== user.id);
    saveStaff();

    // 📜 LOG
if (logChannel) {
    const embed = new EmbedBuilder()
        .setColor("#ff4d4d")
        .setTitle("📢 ROLE REMOVED")
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: " User", value: `<@${user.id}>`, inline: true },
            { name: " Action", value: "Demote", inline: true },
            { name: " By", value: `<@${interaction.user.id}>`, inline: true }
        )
        .setFooter({
            text: `ID: ${user.id}`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    logChannel.send({ embeds: [embed] });
}

    return interaction.reply(`❌ Đã gỡ toàn bộ role của ${user.username}`);
}

/* ===== MAINER ===== */
if (commandName === "mainer") {
    const user = options.getUser("user");

    mainers = mainers.filter(m => m.id !== user.id);

    mainers.push({
        id: user.id,
        name: user.username,
        avatar: user.displayAvatarURL({ extension: "png" }),
        profile: `https://discord.com/users/${user.id}`
    });

    saveMainers();

    return interaction.reply(`✅ ${user.username} đã vào Mainers`);
}

/* ===== DEMAINER ===== */
if (commandName === "demainer") {
    const user = options.getUser("user");

    mainers = mainers.filter(m => m.id !== user.id);
    saveMainers();

    return interaction.reply(`❌ ${user.username} đã bị xóa khỏi Mainers`);
}

/* ===== THIDAU ===== */
if (commandName === "thidau") {

    const team1 = options.getString("team1");
    const team2 = options.getString("team2");
    const time = options.getString("time");
    const ref = options.getString("ref");

    const embed = new EmbedBuilder()
        .setTitle("🏆 THÔNG BÁO THI ĐẤU")
        .setColor(0x00eaff)
        .addFields(
            { name: "⚔️ Trận đấu", value: `${team1} VS ${team2}` },
            { name: "⏰ Thời gian", value: time, inline: true },
            { name: "🏁 Referee", value: ref, inline: true }
        );

    const dropdown = new StringSelectMenuBuilder()
        .setCustomId("match_info")
        .setPlaceholder("Xem thông tin")
        .addOptions([
            { label: team1, value: team1 },
            { label: team2, value: team2 },
            { label: ref, value: ref }
        ]);

    const row = new ActionRowBuilder().addComponents(dropdown);

    return interaction.reply({
        embeds: [embed],
        components: [row]
    });
}
        }

if (interaction.isStringSelectMenu()) {
    // Select menu xem thông tin trận đấu
    if (interaction.customId === "match_info") {
        return interaction.reply({
            content: `📌 Thông tin: ${interaction.values[0]}`,
            ephemeral: true
        });
    }

    // Select menu đăng ký stage → mở modal nhập score
    if (interaction.customId === "select_stage") {
        selected.set(interaction.user.id, interaction.values[0]);
        const modal = new ModalBuilder()
            .setCustomId("submit_score")
            .setTitle("Nhập Score")
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("score")
                        .setLabel("Score")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );

        return interaction.showModal(modal);
    }
}

        if (interaction.isModalSubmit()) {
            if (interaction.customId === "submit_score") {
                const score = interaction.fields.getTextInputValue("score");
                const stage = selected.get(interaction.user.id) || "Unknown";
                return interaction.reply({ content: `✅ Đã gửi!\nStage: **${stage}**\nScore: **${score}**`, ephemeral: true });
            }
        }
    } catch (err) { console.error(err); }
});

/* ================= WEB API ================= */
app.get("/mainers", (req, res) => {
    res.json(mainers);
});
app.post("/register", async (req, res) => {
    try {
        const { discord, robloxUsername } = req.body;

        const channel = await client.channels.fetch(process.env.CHANNEL_ID);

        const embed = new EmbedBuilder()
            .setTitle("📝 ĐĂNG KÝ THI ĐẤU")
            .setColor(0x00ff00)
            .addFields(
                { name: "Discord", value: discord },
                { name: "Roblox", value: robloxUsername || "N/A" }
            );

        const menu = new StringSelectMenuBuilder()
            .setCustomId("select_stage")
            .setPlaceholder("Chọn Stage")
            .addOptions([
                { label: "3 High", value: "3_high" },
                { label: "3 Low", value: "3_low" },
                { label: "4 High", value: "4_high" },
                { label: "4 Low", value: "4_low" }
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Register error" });
    }
});
app.get("/", (req, res) => res.send("API Running"));
app.get("/top", (req, res) => res.json(top));
app.get("/blacklist", (req, res) => res.json(blacklist));
app.get("/staff", (req, res) => {
    const roleOrder = ["Founder", "Leader", "Admin", "Mod", "Referee"]; // Rút gọn ví dụ
    const sorted = [...staff].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    res.json(sorted);
});
app.get("/stats", (req, res) => res.json(stats));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 Port:", PORT));
client.login(process.env.TOKEN);
