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
                    let text = "";
                    for (let i = 1; i <= 20; i++) {
                        text += `TOP ${i}: ${top[i]?.id ? `<@${top[i].id}>` : "Vacant"}\n`;
                    }
                    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(text).setColor("#00eaff")] });
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
                const user = options.getUser("user");
                const role = options.getString("permission");
                staff = staff.filter(s => s.id !== user.id);
                staff.push({ id: user.id, username: user.username, role, avatar: user.displayAvatarURL({ extension: "png" }) });
                saveStaff();
                return interaction.reply(`✅ **${user.username}** đã trở thành **${role}**`);
            }
        }

        // Xử lý Select Menu & Modal
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === "select_stage") {
                selected.set(interaction.user.id, interaction.values[0]);
                const modal = new ModalBuilder().setCustomId("submit_score").setTitle("Nhập Score");
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("score").setLabel("Score").setStyle(TextInputStyle.Short).setRequired(true)));
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
