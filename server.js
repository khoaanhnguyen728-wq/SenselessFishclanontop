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

function hasPermission(member) {
    if (!process.env.ADMIN_ROLE) return false;

    const roles = process.env.ADMIN_ROLE.split(",").map(r => r.trim());

    const userRoles = member.roles.cache.map(r => r.id);

    console.log("USER:", userRoles);
    console.log("ADMIN:", roles);

    return roles.some(roleId => userRoles.includes(roleId));
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

        let text = "";

for (let i = 1; i <= 20; i++) {
    const member = data[i];

    // Chọn medal theo thứ hạng
    let medal = "➠"; // default
    if (i === 1) medal = "👑";
    else if (i === 2) medal = "➤";
    else if (i === 3) medal = "➤";

    // Nếu không có member thì hiển thị Vacant
    let displayName = member?.id ? `<@${member.id}>` : "Vacant";

    // In đậm + in nghiêng + chữ TOP viết to
    let topText = `***➤TOP ${i}***`;

    // TOP 1–3 in đậm + nghiêng + caps
    if (i === 1) displayName = `***${displayName}***`;      // TOP 1 nổi bật nhất
    else if (i === 2 || i === 3) displayName = `**${displayName}**`;

    // Thêm vào text, xuống dòng dài hơn
    text += `${medal} ${topText} • ${displayName}\n\n\n`;
}

        const embed = new EmbedBuilder()
            .setColor("#00eaff")
            .setTitle("🏆 SENSELESS FISH CLAN LEADERBOARD")
            .setDescription(text)
            .setTimestamp();

        const channel = await client.channels.fetch(TOP_CHANNEL);
        const message = await channel.messages.fetch(TOP_MESSAGE);
        await message.edit({ embeds: [embed] });

    } catch (err) {
        console.log("Lỗi update leaderboard:", err.message);
    }
}
client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // Chỉ defer MỘT LẦN DUY NHẤT ở đây cho tất cả các lệnh
            await interaction.deferReply({ ephemeral: true });
            const { commandName, options } = interaction;

/* ===== CAN BLACKLIST FUNCTION ===== */
function canBlacklist(member) {
    // Thay thế bằng quyền admin hoặc role kiểm soát
    if (!process.env.ADMIN_ROLE) return false;
    const roles = process.env.ADMIN_ROLE.split(",").map(r => r.trim());
    return member.roles.cache.some(r => roles.includes(r.id));
}

/* ===== BLACKLIST ===== */
if (commandName === "blacklist") {
    // Không dùng deferReply ở đây nữa vì đã gọi ở dòng 110
    const user = options.getUser("user");
    const reason = options.getString("reason") || "Không có";

    // Kiểm tra quyền (Sử dụng hàm hasPermission bạn đã viết)
    if (!hasPermission(interaction.member)) {
        return interaction.editReply({ content: "❌ Bạn không có quyền thực hiện lệnh này." });
    }

    if (blacklist.some(b => b.id === user.id)) {
        return interaction.editReply({ content: "⚠️ Người dùng đã nằm trong blacklist." });
    }

    // 1. Cập nhật dữ liệu ngay
    blacklist.push({
        id: user.id,
        name: user.username,
        reason,
        time: new Date().toLocaleString("vi-VN")
    });
    saveBlacklist();

    // 2. Chuẩn bị Embed
    const embed = new EmbedBuilder()
        .setTitle("🚫 BLACKLIST THÀNH CÔNG")
        .setColor("#ff0000")
        .addFields(
            { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: "Lý do", value: reason, inline: true }
        )
        .setTimestamp();

    // 3. Phản hồi ngay lập tức bằng editReply
    await interaction.editReply({ embeds: [embed] });

    // 4. Các tác vụ chạy ngầm (Không bắt user đợi)
    // Ban người dùng
    interaction.guild.members.ban(user.id, { reason: `Blacklist: ${reason}` })
        .then(() => console.log(`Đã ban ${user.tag}`))
        .catch(err => console.log("Lỗi ban:", err.message));

    // Gửi log
    const logChannel = interaction.guild.channels.cache.get(process.env.BLACKLIST_LOG_CHANNEL);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle("🚫 BLACKLIST LOG")
            .setColor("#ff0000")
            .setThumbnail(user.displayAvatarURL())
            .addFields(
                { name: "User", value: `<@${user.id}>`, inline: true },
                { name: "Người thực hiện", value: `<@${interaction.user.id}>`, inline: true },
                { name: "Lý do", value: reason }
            )
            .setFooter({ text: `ID: ${user.id}` })
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
}

/* ===== UNBLACKLIST ===== */
if (commandName === "unblacklist") {
    const user = options.getUser("user");

    if (!canBlacklist(interaction.member)) {
        return interaction.editReply({ content: "❌ Bạn không có quyền unblacklist." });
    }

    if (!blacklist.some(b => b.id === user.id)) {
        return interaction.editReply({ content: "⚠️ Người dùng không nằm trong blacklist." });
    }

    // Xóa khỏi cache
    blacklist = blacklist.filter(b => b.id !== user.id);

    try {
        await fs.promises.writeFile("./blacklist.json", JSON.stringify(blacklist, null, 2));
    } catch(err) {
        console.error("Lỗi ghi blacklist.json:", err.message);
    }

    // Thử unban trực tiếp bằng user ID
    try {
        await interaction.guild.members.unban(user.id);
    } catch(err) {
        console.log("Unban lỗi (có thể user chưa bị ban hoặc đã rời):", err.message);
    }

    const embed = new EmbedBuilder()
        .setTitle("✅ UNBLACKLIST THÀNH CÔNG")
        .setColor("#00ffcc")
        .addFields(
            { name: "User", value: `${user.tag}`, inline: true }
        )
        .setTimestamp();

    // Gửi log
    const logChannel = interaction.guild.channels.cache.get(process.env.BLACKLIST_LOG_CHANNEL);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle("✅ UNBLACKLIST LOG")
            .setColor("#00ffcc")
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: "User", value: `${user.tag}`, inline: true },
                { name: "Người thực hiện", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `ID: ${user.id}` })
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(console.log);
    }

    return interaction.editReply({ embeds: [embed] });
}

            if (commandName === "bxh") {
                const sub = options.getSubcommand();
if (sub === "aov") {

    const embeds = [];
    const bar = "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTY3cnc0bGdxaGR3Y3YxZnJ0NTdwZzNrbTBpem82MWpjeTNvZXUxNCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/WpJNpxWwf8dLB1p5j0/giphy.gif";

    const arrow = "<a:emoji_123:1486382493853552810>"; // 👈 emoji động mũi tên

    for (let i = 1; i <= 20; i++) {
        const user = top[i]?.id ? `<@${top[i].id}>` : "VACANT";

        const embed = new EmbedBuilder()
            .setColor("#2b2d31")
            .setTitle(`**ＴＯＰ ${i}**`)
            .setDescription(`\n${arrow} ${user}\n`)
            .setImage(bar);

        embeds.push(embed);
    }

    await interaction.editReply({ embeds: embeds.slice(0, 10) });
    await interaction.followUp({ embeds: embeds.slice(10, 20) });
}
                
                if (sub === "kill" || sub === "chat") return interaction.editReply({ content: "Tính năng đang phát triển.", ephemeral: true });
            }

            if (commandName === "list") {
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
                return interaction.editReply(`✅ Đã đưa **${user.username}** vào **TOP ${rank}**`);
            }

if (commandName === "promote") {

    const user = options.getUser("user");
    const roleName = options.getString("permission");

    const member = interaction.member;
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
        return interaction.editReply(`🗑️ Đã xóa **${user.username}** khỏi TOP`);
    }

    return interaction.editReply("❌ User không có trong TOP");
}

/* ===== DEMOTE ===== */
if (commandName === "demote") {
    const user = options.getUser("user");

    const member = interaction.member;
    if (!hasPermission(member)) {
        return interaction.editReply({ content: "❌ Bạn không có quyền dùng lệnh này", ephemeral: true });
    }

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL); // ✅ THÊM DÒNG NÀY

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

    return interaction.editReply(`❌ Đã gỡ toàn bộ role của ${user.username}`);
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

    return interaction.editReply(`✅ ${user.username} đã vào Mainers`);
}

/* ===== DEMAINER ===== */
if (commandName === "demainer") {
    const user = options.getUser("user");

    mainers = mainers.filter(m => m.id !== user.id);
    saveMainers();

    return interaction.editReply(`❌ ${user.username} đã bị xóa khỏi Mainers`);
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

    return interaction.editReply({
        embeds: [embed],
        components: [row]
    });
}
        }

if (interaction.isStringSelectMenu()) {
    // Select menu xem thông tin trận đấu
    if (interaction.customId === "match_info") {
        return interaction.editReply({
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
                return interaction.editReply({ content: `✅ Đã gửi!\nStage: **${stage}**\nScore: **${score}**`, ephemeral: true });
            }
        }
    } catch (err) { console.error(err); }
});

/* ================= WEB API ================= */
/* ================= STAFF + ROLE COLOR ================= */
app.get("/staff-realtime", async (req, res) => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.members.fetch(); // fetch tất cả member

        const roleIds = Object.values(ROLE_MAP);

        const staffMembers = guild.members.cache
            .filter(member => member.roles.cache.some(role => roleIds.includes(role.id)))
            .map(member => {
                const memberRole = Object.keys(ROLE_MAP).find(r => member.roles.cache.has(ROLE_MAP[r]));
                const roleObj = guild.roles.cache.get(ROLE_MAP[memberRole]); // lấy role Discord object
                const color = roleObj ? "#" + roleObj.color.toString(16).padStart(6,"0") : "#55ff8f"; // fallback màu

                return {
                    id: member.user.id,
                    username: member.user.username,
                    avatar: member.user.displayAvatarURL({ dynamic: true }),
                    role: memberRole || "Member",
                    color,
                    profile: `https://discord.com/users/${member.user.id}`
                };
            });

        res.json(staffMembers);

    } catch (err) {
        console.error("STAFF REALTIME ERROR:", err);
        res.status(500).json({ success:false, message: err.message });
    }
});
app.get("/mainers", (req, res) => {
    res.json(mainers);
});
app.post("/register", async (req, res) => {
    try {
        const { discord, robloxUsername } = req.body;

        if (!discord) {
            return res.status(400).json({ success:false, message:"Thiếu Discord" });
        }

        if (!client.isReady()) {
            return res.status(500).json({ success:false, message:"Bot chưa sẵn sàng" });
        }

        const channel = await client.channels.fetch(process.env.CHANNEL_ID).catch(() => null);

        if (!channel) {
            return res.status(500).json({ success:false, message:"Không tìm thấy channel" });
        }

        if (!channel.permissionsFor(channel.guild.members.me).has("SendMessages")) {
            return res.status(500).json({ success:false, message:"Bot không có quyền gửi tin nhắn" });
        }

        const embed = new EmbedBuilder()
            .setTitle("📝 ĐĂNG KÝ THI ĐẤU")
            .setColor("#00eaff")
            .addFields(
                { name: " Discord", value: discord, inline: true },
                { name: " Roblox", value: robloxUsername || "N/A", inline: true }
            )
            .setTimestamp();

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

        return res.json({ success:true });

    } catch (err) {
        console.error("REGISTER ERROR:", err);
        return res.status(500).json({ success:false, message: err.message });
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
