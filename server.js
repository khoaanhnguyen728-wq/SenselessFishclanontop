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
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const app = express();
app.use(express.json());
app.use(cors());

/* ================= DATABASE ================= */
const initDB = (file, content) => { if (!fs.existsSync(file)) fs.writeFileSync(file, content); };
initDB("blacklist.json", "[]");
initDB("top.json", "{}");
initDB("register.json", "[]");
initDB("staff.json", "[]");
initDB("mainers.json", "[]");

let blacklist = JSON.parse(fs.readFileSync("blacklist.json"));
let top = JSON.parse(fs.readFileSync("top.json"));
let staff = JSON.parse(fs.readFileSync("staff.json"));
let mainers = JSON.parse(fs.readFileSync("mainers.json"));

const saveBlacklist = () => fs.writeFileSync("blacklist.json", JSON.stringify(blacklist, null, 2));
const saveTop = () => fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
const saveStaff = () => fs.writeFileSync("staff.json", JSON.stringify(staff, null, 2));
const saveMainers = () => fs.writeFileSync("mainers.json", JSON.stringify(mainers, null, 2));

const ROLE_MAP = {
    "Founder": process.env.ROLE_FOUNDER,
    "Admin": process.env.ROLE_ADMIN,
    "Mod": process.env.ROLE_MOD,
    "Referee": process.env.ROLE_REF
};

function hasPermission(member) {
    if (!process.env.ADMIN_ROLE) return false;
    const roles = process.env.ADMIN_ROLE.split(",").map(r => r.trim());
    return roles.some(roleId => member.roles.cache.has(roleId));
}

/* ================= DISCORD BOT ================= */
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMessages]
});

client.once("ready", () => {
    console.log("Bot online:", client.user.tag);
    setInterval(updateLeaderboard, 30000); // Tăng lên 30s để tránh lag
});

async function updateLeaderboard() {
    try {
        const channel = await client.channels.fetch(process.env.TOP_CHANNEL).catch(() => null);
        const message = await channel?.messages.fetch(process.env.TOP_MESSAGE).catch(() => null);
        if (!message) return;

        let text = `━━━━━━━━ 👑 TOP 1 👑 ━━━━━━━━\n⭐ **${top[1]?.id ? `<@${top[1].id}>` : "Vacant"}**\n\n`;
        for (let i = 2; i <= 20; i++) {
            text += `⁠⊱ **TOP ${i}** • ${top[i]?.id ? `<@${top[i].id}>` : "Vacant"}\n`;
        }

        const embed = new EmbedBuilder()
            .setColor("#00eaff")
            .setTitle("🏆 SENSELESS FISH CLAN LEADERBOARD")
            .setDescription(text)
            .setTimestamp();

        await message.edit({ embeds: [embed] });
    } catch (err) { console.log("Lỗi Leaderboard:", err.message); }
}

client.on("interactionCreate", async interaction => {
    try {
        // 1. XỬ LÝ SLASH COMMANDS
        if (interaction.isChatInputCommand()) {
            await interaction.deferReply({ ephemeral: true });
            const { commandName, options } = interaction;

            if (commandName === "blacklist") {
                if (!hasPermission(interaction.member)) return interaction.editReply("❌ Không có quyền.");
                const user = options.getUser("user");
                const reason = options.getString("reason") || "Không có";

                if (blacklist.some(b => b.id === user.id)) return interaction.editReply("⚠️ Đã có trong blacklist.");

                blacklist.push({ id: user.id, name: user.username, reason, time: new Date().toLocaleString() });
                saveBlacklist();
                
                await interaction.editReply(`🚫 Đã blacklist **${user.tag}**`);
                interaction.guild.members.ban(user.id, { reason }).catch(() => null);
            }

            if (commandName === "unblacklist") {
                if (!hasPermission(interaction.member)) return interaction.editReply("❌ Không có quyền.");
                const user = options.getUser("user");

                blacklist = blacklist.filter(b => b.id !== user.id);
                saveBlacklist();
                
                await interaction.guild.members.unban(user.id).catch(() => null);
                return interaction.editReply(`✅ Đã gỡ blacklist cho **${user.tag}**`);
            }

            if (commandName === "settop") {
                const user = options.getUser("user");
                const rank = options.getInteger("top");
                top[rank] = { id: user.id, name: user.username };
                saveTop();
                return interaction.editReply(`✅ Đã set **${user.username}** vào TOP ${rank}`);
            }

            if (commandName === "demote") {
                if (!hasPermission(interaction.member)) return interaction.editReply("❌ Không có quyền.");
                const user = options.getUser("user");
                const target = await interaction.guild.members.fetch(user.id);
                
                for (let rId of Object.values(ROLE_MAP)) {
                    if (target.roles.cache.has(rId)) await target.roles.remove(rId).catch(() => null);
                }
                staff = staff.filter(s => s.id !== user.id);
                saveStaff();
                return interaction.editReply(`❌ Đã gỡ role của ${user.username}`);
            }
        }

        // 2. XỬ LÝ SELECT MENU (Không defer trước)
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === "select_stage") {
                const modal = new ModalBuilder()
                    .setCustomId("submit_score")
                    .setTitle("Nhập Score")
                    .addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId("score").setLabel("Score").setStyle(TextInputStyle.Short).setRequired(true)
                    ));
                return interaction.showModal(modal);
            }
        }

        // 3. XỬ LÝ MODAL
        if (interaction.isModalSubmit()) {
            if (interaction.customId === "submit_score") {
                const score = interaction.fields.getTextInputValue("score");
                return interaction.reply({ content: `✅ Đã gửi score: **${score}**`, ephemeral: true });
            }
        }
    } catch (err) { 
        console.error(err);
        if (interaction.deferred) await interaction.editReply("❌ Lỗi xử lý.");
    }
});

/* ================= WEB API ================= */
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
