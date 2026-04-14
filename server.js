require("dotenv").config();
process.on("unhandledRejection", err => {
    console.log("❌ UNHANDLED:", err);
});

process.on("uncaughtException", err => {
    console.log("❌ CRASH:", err);
});
console.log("🚀 BOT ĐANG KHỞI ĐỘNG...");
const path = require("path");
const fs = require("fs");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const backup = require("discord-backup");

const backupPath = path.join(__dirname, "backups");

// Tạo folder nếu chưa có
if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
    console.log("📁 Đã tạo folder backups");
}


console.log("📂 Backup path:", backupPath);

// Coin functions dùng trực tiếp biến coins + saveCoins (được định nghĩa bên dưới)
// Các hàm này chỉ được GỌI trong event handlers, sau khi module load xong nên an toàn
function getCoins(userId) {
    return coins[userId] || 0;
}
function addCoins(userId, amount) {
    if (!coins[userId]) coins[userId] = 0;
    coins[userId] += amount;
    if (coins[userId] < 0) coins[userId] = 0;
    saveCoins();
}
function setCoins(userId, amount) {
    coins[userId] = Math.max(0, amount);
    saveCoins();
}
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const winStreak = new Map();
const aiModel = genAI.getGenerativeModel({ 
    model: "gemma-4-26b-a4b-it",
    systemInstruction: {
        role: "system",
        parts: [{ text: "BẠN LÀ TRÍ TUỆ NHÂN TẠO CỦA SENSELESS FISH CLAN.\n\n" +
                       "BẮT ĐẦU PHẢN HỒI BẰNG TIẾNG VIỆT NGAY LẬP TỨC. KHÔNG DÙNG TIẾNG ANH TRONG MỌI HOÀN CẢNH." +
                       "CHỈ THỊ NGÔN NGỮ BẮT BUỘC (LANGUAGE ENFORCEMENT):\n" +
                       "1. PHẢI TRẢ LỜI BẰNG TIẾNG VIỆT 100%: Trong mọi tình huống, mọi câu hỏi, bạn phải dùng tiếng Việt thuần thục để phản hồi. Tuyệt đối không bắt đầu bằng bất kỳ từ tiếng Anh nào (ví dụ: không dùng 'Sure', 'Certainly', 'Hello').\n" +
                       "2. XỬ LÝ CÂU HỎI TIẾNG ANH: Nếu người dùng hỏi bằng tiếng Anh, bạn phải ngầm hiểu và trả lời lại bằng tiếng Việt 100%. Không giải thích lại bằng tiếng Anh.\n" +
                       "3. QUY TẮC VIẾT CODE: Khi cung cấp mã nguồn (HTML, JS, Luau...), chỉ các cú pháp lập trình cốt lõi là giữ nguyên. Toàn bộ phần chú thích (comments) và văn bản giải thích bao quanh code PHẢI là tiếng Việt.\n" +
                       "4. CHỐNG NGUY HIỂM: Từ chối mọi yêu cầu về mã độc, công cụ phá hoại Discord hoặc xâm nhập trái phép. Lời từ chối này cũng phải viết bằng tiếng Việt chuyên nghiệp.\n" +
                       "5. HẬU QUẢ: Mọi từ tiếng Anh xuất hiện trong lời nói của bạn (ngoài code) đều được coi là lỗi nghiêm trọng. Hãy tập trung suy nghĩ và phản hồi bằng tiếng Việt ngay từ ký tự đầu tiên." }]
    },
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
    generationConfig: {
        temperature: 0.4, 
        topP: 1,
        maxOutputTokens: 8192, 
    }
});


function hasEnough(userId, amount) {
    return getCoins(userId) >= amount;
}

function getWinChance(userId) {
    const streak = winStreak.get(userId) || 0;

    if (streak <= 2) return 0.55;   // dễ win đầu game
    if (streak <= 5) return 0.45;   // bắt đầu giảm nhẹ
    if (streak <= 8) return 0.30;   // giảm mạnh
    return 0.15;                    // chống farm win
}

function updateStreak(userId, win) {
    let streak = winStreak.get(userId) || 0;

    if (win) {
        streak += 1;
    } else {
        streak = 0; // thua là reset streak
    }

    winStreak.set(userId, streak);
}

const AI_CHANNEL = process.env.AI_CHANNEL;
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
    TextInputStyle,
    ChannelType,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ],
    rest: {
        timeout: 15000,      // 15s là đủ cho Wispbyte
        retries: 0           // KHÔNG retry — retry gây 40060 (ack thành công nhưng response bị mất, retry lên bị báo đã ack)
    },
    ws: {
        large_threshold: 50
    }
});

// client.on("debug", console.log); // ĐÃ TẮT — quá verbose, ngốn RAM Wispbyte free
client.on("warn", (msg) => console.warn("⚠️ WARN:", msg));
client.once("ready", () => {
    console.log("✅ BOT ONLINE:", client.user.username);
    setInterval(() => {
        console.log("⏳ Đang update AOV...");
        console.log("🤖 BOT TAG:", client.user.username);
        console.log("🆔 CLIENT ID:", client.user.id);
        console.log("⚙️ PROCESS ID:", process.pid);
        console.log("🌍 ENV:", process.env.NODE_ENV || "unknown");
        console.log("RUNNING ON:", process.env.HOSTNAME || "local");
        updateAOVLeaderboard().catch(console.error);
    }, 10000);
    setInterval(() => {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) return;
        stats.total = guild.memberCount;
        stats.online = guild.members.cache.filter(m =>
            m.presence && ["online", "idle", "dnd"].includes(m.presence.status)
        ).size;
    }, 10000);
});
client.on("shardDisconnect", () => {
    console.log("❌ BOT DISCONNECTED");
});

client.on("shardReconnecting", () => {
    console.log("🔄 BOT RECONNECTING");
});

client.on("error", (err) => {
    console.log("🚨 CLIENT ERROR:", err);
});
const app = express();
app.use("/image", express.static("images"));
app.use(express.json());
app.use(cors());

/*DATABASE*/
if (!fs.existsSync("coins.json")) fs.writeFileSync("coins.json", "{}");
if (!fs.existsSync("blacklist.json")) fs.writeFileSync("blacklist.json", "[]");
if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");
if (!fs.existsSync("staff.json")) fs.writeFileSync("staff.json", "[]");
if (!fs.existsSync("mainers.json")) fs.writeFileSync("mainers.json", "[]");
if (!fs.existsSync("strike.json")) fs.writeFileSync("strike.json", "[]");

let coins = JSON.parse(fs.readFileSync("coins.json", "utf8"));
let blacklist = JSON.parse(fs.readFileSync("blacklist.json"));
let top = JSON.parse(fs.readFileSync("top.json"));
let register = JSON.parse(fs.readFileSync("register.json"));
let staff = JSON.parse(fs.readFileSync("staff.json"));
let mainers = JSON.parse(fs.readFileSync("mainers.json"));
let strikes = JSON.parse(fs.readFileSync("strike.json"));

for (let i = 1; i <= 20; i++) { if (!top[i]) top[i] = null; }


const saveCoins = () => fs.writeFileSync("coins.json", JSON.stringify(coins, null, 2));
const saveBlacklist = () => fs.writeFileSync("blacklist.json", JSON.stringify(blacklist, null, 2));
const saveTop = () => fs.writeFileSync("top.json", JSON.stringify(top, null, 2));
const saveStaff = () => fs.writeFileSync("staff.json", JSON.stringify(staff, null, 2));
const saveRegister = () => fs.writeFileSync("register.json", JSON.stringify(register, null, 2));
const saveMainers = () => fs.writeFileSync("mainers.json", JSON.stringify(mainers, null, 2));
const saveStrikes = () => fs.writeFileSync("strike.json", JSON.stringify(strikes, null, 2));

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
const dailyCooldown = new Map();
const dailyStreak = new Map(); 
const dailyReward = new Map(); 
const ticketCooldown = new Map(); 
const TICKET_COOLDOWN = 5000; 
const cooldown = new Map();
const LOG_CHANNEL = process.env.LOG_CHANNEL;
const AOV_CHANNEL = process.env.AOV_CHANNEL;
const AOV_MESSAGE = process.env.AOV_MESSAGE;
const RULE_CHANNEL = process.env.RULE_CHANNEL;
const ADMIN_ROLE = process.env.ADMIN_ROLE;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

function hasPermission(member) {
    if (!process.env.ADMIN_ROLE) return false;

    const roles = process.env.ADMIN_ROLE.split(",").map(r => r.trim());

    const userRoles = member.roles.cache.map(r => r.id);

    console.log("USER:", userRoles);
    console.log("ADMIN:", roles);

    return roles.some(roleId => userRoles.includes(roleId));
}

async function sendStrikeLog(client, embed) {
    const channel = await client.channels.fetch(process.env.STRIKE_CHANNEL).catch(() => null);
    if (!channel) return console.log("❌ Không tìm thấy strike channel");

    await channel.send({ embeds: [embed] }).catch(console.error);
}

/*DISCORD BOT*/

const TOP_CHANNEL = process.env.TOP_CHANNEL;
const TOP_MESSAGE = process.env.TOP_MESSAGE;
let lastTopData = "";
let stats = { total: 0, online: 0 };
const selected = new Map();

let aovMessageId = null;

async function updateAOVLeaderboard() {
    try {
        const channel = await client.channels.fetch(AOV_CHANNEL).catch(() => null);
        if (!channel) return console.log("❌ Channel không tồn tại");

        if (!channel.isTextBased()) {
            return console.log("❌ Channel không phải text");
        }

        let message = null;

        if (aovMessageId) {
            message = await channel.messages.fetch(aovMessageId).catch(() => null);
        }

        let apiTop = {};
        try {
            const res = await axios.get("https://senselessfishclanontop.onrender.com/top");
            apiTop = res.data;
        } catch (err) {
            console.log("❌ Lỗi API:", err.message);
            return;
        }

        let text = "";
        for (let i = 1; i <= 20; i++) {
            const member = apiTop[i] || {};

            let medal = (i === 1) ? "👑" : (i <= 3 ? "➤" : "➠");
            let displayName = member?.id ? `<@${member.id}>` : "Vacant";

            if (i === 1) displayName = `***${displayName}***`;
            else if (i <= 3) displayName = `**${displayName}**`;

            text += `${medal} **TOP ${i}** • ${displayName}\n\n`;
        }

        const embed = new EmbedBuilder()
            .setColor("#00eaff")
            .setTitle("🏆 AOV LEADERBOARD")
            .setDescription(text || "Chưa có dữ liệu")
            .setTimestamp();

        if (message && typeof message.edit === "function") {
            await message.edit({ embeds: [embed] });
            return true;
        } else {

            const sent = await channel.send({ embeds: [embed] });
            aovMessageId = sent.id;

            console.log("📌 Đã tạo BXH mới, ID:", aovMessageId);
            return aovMessageId;
        }
    } catch (err) {
        console.error("Lỗi cập nhật AOV:", err);
    }
}

function buildRuleEmbeds() {
    const rules = [
        {
            title: "<a:slf_bleh:1485507133838462976>**1. THÁI ĐỘ**",
            content: `
**Đối xử với mọi người như cách bạn muốn được đối xử.**
\`\`\`
• Không xúc phạm (toxic), kỳ thị, quấy rối, công kích cá nhân hay bắt nạt bất kì ai.  
• Giữ thái độ chuẩn mực khi tranh luận, đừng để mọi chuyện đi quá xa.
\`\`\`           `
        },
        {
            title: "<a:slf_bleh:1485507133838462976>**2. NỘI DUNG**",
            content: `
\`\`\`
• Nói chuyện đúng chủ đề của kênh chat.  
• Không spam tin nhắn, emoji, ping hoặc gây war, cà khịa quá đà.  
• Cấm nội dung 18+, NSFW, gore, phản cảm (kể cả avatar, nickname).  
• Không gửi link độc hại, lừa đảo, jumpscare, gây ám ảnh.
\`\`\`           `
        },
        {
            title: "<a:slf_bleh:1485507133838462976>**3. BA KHÔNG**",
            content: `
\`\`\`
• Không phân biệt vùng miền dưới mọi hình thức.  
• Không phân biệt chủng tộc, màu da (ví dụ: nigga, nigger,...).  
• Không phân biệt giới tính, xúc phạm hay chế giễu người khác.
\`\`\`           `
        },
        {
            title: "<a:slf_bleh:1485507133838462976>**4. KHÔNG QUẢNG CÁO**",
            content: `
\`\`\`
• Cấm quảng cáo Discord, Youtube, website khi chưa được phép.  
• Mọi hình thức quảng cáo sẽ bị xóa và cảnh cáo ngay lập tức.  
• Liên hệ Admin/Owner nếu muốn xin phép quảng cáo.
\`\`\`           `
        },
        {
            title: "<a:slf_bleh:1485507133838462976>**5. GIỌNG NÓI & NHẠC**",
            content: `
\`\`\`
• Không chửi thề, cãi nhau trong voice chat.  
• Không bật nhạc gây ồn ào, làm phiền người khác.  
• Bật lọc tiếng ồn và giữ thái độ lịch sự khi nói chuyện.
\`\`\`           `
        },
        {
            title: "<a:slf_bleh:1485507133838462976>**6. KHÔNG LÀM PHIỀN QUẢN LÍ**",
            content: `
\`\`\`
• Không ping staff khi không cần thiết.  
• Không làm phiền Owner/Admin.  
• Đội ngũ sẽ hỗ trợ bạn sớm nhất có thể.
\`\`\`           `
        },
        {
            title: "<a:slf_capoo_bcmischeifbatcat:1479448873226473616>**7. Vi phạm**",
            content: `
\`\`\`
• STRIKE 1: Cảnh báo 1/3 
• STRIKE 2: Cảnh báo 2/3 
• STRIKE 3: Cảnh báo 3/3 
• Blacklist: STRIKE 3 lần sẽ bị baned (tùy theo mức độ vi phạm mà có thể bị ban ngay từ lần đầu).
\`\`\`
`
        }
    ];
const gradientColors = ["#FFFFFF", "#D1E1EC", "#A2C2D9", "#74A4C5", "#4585B1", "#0B3C5D", "#07263b"]; // Từ trắng đến xanh đậm
    const webLink = "https://senselessfishclan.pages.dev"; 
    
    const fish = "<:slf_Minecraft_Fish7:1482335219099893831>";

    const centerShift = "                "; 

    const header = `${centerShift}${fish}***◞☼✦—SENSELESSFISH RULES—✦☼◟***${fish}\n\n`;

return rules.map((r, i) => {
    let description = (i === 0 ? header : "") + 
        ` ${r.title}\n\n` +
        `${r.content.trim()}\n\n`;

    if (i === 5) {
        description += `\n*Xem thêm [tại đây](${webLink})*`;
    }

    return new EmbedBuilder()
        .setColor(gradientColors[i])
        .setDescription(description)
        .setImage("https://i.postimg.cc/x8HsNw4q/fixedbulletlines.gif")
        .setFooter({ text: `Rule ${i + 1} / 7 • SenselessFish` });
});
}

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const content = message.content.toLowerCase();

    if (selected.has(message.channel.id)) {
        const ticketOwner = selected.get(message.channel.id).userId;
        if (message.author.id !== ticketOwner) return;

        try {
            await message.channel.sendTyping();

const prompt = `YÊU CẦU BẮT BUỘC: Trả lời bằng tiếng Việt 100%. 
Nội dung người dùng: ${message.content}`;

const result = await aiModel.generateContent(prompt);
            const text = result.response.text();

            if (!text || text.trim().length === 0) {
                return message.reply("Gemma 4 không phản hồi, thử lại nhé!");
            }

            if (text.length > 2000) {
                const chunks = text.match(/[\s\S]{1,2000}/g);
                for (const chunk of chunks) {
                    await message.channel.send(chunk);
                }
            } else {
                await message.reply(text);
            }

        } catch (err) {
            console.error("❌ LỖI AI:", err);
            return message.reply("Hệ thống AI trục trặc, thử lại sau!");
        }
        return; // Đã xử lý trong ticket channel, không fall-through
    }
    
    if (content === "!panel") {
    if (!hasPermission(message.member)) return;
    const embed = new EmbedBuilder()
        .setTitle("🎫 AI SUPPORT PANEL")
        .setDescription("Bấm nút bên dưới để tạo ticket hỗ trợ")
        .setColor("#00eaff");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("create_ai_ticket")
            .setLabel("🎫 Tạo Ticket")
            .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
        embeds: [embed],
        components: [row]
    });
    await message.delete().catch(() => {});
}
    //RULE
    if (content.startsWith("rule")) {
        if (message.channel.id !== process.env.RULE_CHANNEL) return;

        if (!hasPermission(message.member)) {
            return message.reply("❌ Bạn không có quyền!").then(m => setTimeout(() => m.delete(), 3000));
        }

        if (content === "rule" || content === "rule list") {
            try {
                const embeds = buildRuleEmbeds();

                await message.channel.send({ embeds });
                await message.channel.send(`
# 💖 CẢM ƠN BẠN ĐÃ ĐỌC RULE

**CHÚC BẠN CÓ TRẢI NGHIỆM TỐT  
TẠI SENSELESSFISH**
`);

                await message.delete().catch(() => {});
                return;

            } catch (err) {
                console.error(err);
                message.channel.send("❌ Lỗi gửi rule!");
            }
        }
    }

    //AOV COMMAND
    if (message.channel.id === process.env.AOV_CHANNEL) {
        if (!hasPermission(message.member)) return;

        if (content === "aov" || content === "aov list") {

            const result = await updateAOVLeaderboard();

            if (result === true) {
                message.reply("✅ Đã cập nhật bảng xếp hạng!").then(m => setTimeout(() => m.delete(), 5000));
            } else if (result) {
                message.reply(`📌 Đã tạo bảng xếp hạng mới!\nCopy ID này vào \`AOV_MESSAGE\` trong env: \`${result}\``);
            }
            
            await message.delete().catch(() => {});
            return;
        }
    }
if (message.channel.id === process.env.AI_CHANNEL) {

        const now = Date.now();
        const lastUsage = cooldown.get(message.author.id) || 0;
if (now - lastUsage < 5000) {
    return message.reply("⏳ Đợi 5 giây");
}
        cooldown.set(message.author.id, now);

        try {
            await message.channel.sendTyping();

const promptWithLanguageLock = `${message.content} (Lưu ý: Luôn trả lời bằng tiếng Việt)`;
const result = await aiModel.generateContent(promptWithLanguageLock);
            const text = result.response.text();

            if (!text || text.trim().length === 0) {
                return message.reply("Gemma 4 không phản hồi, thử lại nhé!");
            }

            if (text.length > 2000) {
                const chunks = text.match(/[\s\S]{1,2000}/g);
                for (const chunk of chunks) {
                    await message.channel.send(chunk);
                }
            } else {
                await message.reply(text);
            }
        } catch (err) {
            console.error("❌ LỖI AI:", err);
            if (err.message.includes("SAFETY")) {
                return message.reply("⚠️ Nội dung bị bộ lọc chặn.");
            }
            return message.reply("Hệ thống trục trặc, thử lại sau!");
        }
    }
});
// ============================================================
// SAFE DEFER HELPERS
// Bắt 40060 ngay tại nguồn — nếu deferReply ném 40060 (đã ack nhưng response bị mất)
// thì tiếp tục bình thường thay vì abort cả flow backup
// ============================================================
async function safeDeferReply(interaction, options = {}) {
    if (interaction.deferred || interaction.replied) return;
    try {
        await interaction.deferReply(options);
    } catch (err) {
        if (err?.code === 40060) return; // Đã ack → tiếp tục
        throw err;
    }
}

async function safeDeferUpdate(interaction) {
    if (interaction.deferred || interaction.replied) return;
    try {
        await interaction.deferUpdate();
    } catch (err) {
        if (err?.code === 40060) return;
        throw err;
    }
}

// ============================================================
// FIX TRIỆT ĐỂ 10062 + 40060
// 10062 = Bot restart, Discord gửi lại interaction cũ (>3s) -> timeout
//         Fix: check tuổi interaction, >2500ms thì bỏ qua
// 40060 = Cùng interaction bị xử lý 2 lần (WebSocket reconnect)
//         Fix: Set handledInteractions chặn duplicate theo ID
// ============================================================
const handledInteractions = new Set();

client.on("interactionCreate", async (interaction) => {

    // --- FIX 10062 ---
    const interactionAge = Date.now() - interaction.createdTimestamp;
    if (interactionAge > 2800) {
        console.warn(`⚠️ [SKIP] Interaction quá hạn (${interactionAge}ms) — bỏ qua tránh 10062`);
        return;
    }

    // --- FIX 40060 ---
    if (handledInteractions.has(interaction.id)) {
        console.warn(`⚠️ [SKIP] Duplicate interaction ${interaction.id} — bỏ qua tránh 40060`);
        return;
    }
    handledInteractions.add(interaction.id);
    setTimeout(() => handledInteractions.delete(interaction.id), 300_000);

    try {
console.log("📩 INTERACTION:", interaction.commandName || interaction.customId);
console.log("👤 USER:", interaction.user.username);
console.log("📍 GUILD:", interaction.guildId);

    //SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;
if (interaction.commandName === "backup") {
    const subcommand = interaction.options.getSubcommand();

    // HELPER: gửi reply an toàn — kiểm tra deferred trước, fallback DM nếu không được
    const safeReply = async (payload) => {
        const data = typeof payload === "string" ? { content: payload } : payload;
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(data);
            } else {
                // Defer chưa xong — gửi DM trực tiếp
                await interaction.user.send(data).catch(() => {});
            }
        } catch {
            await interaction.user.send(data).catch(() => {});
        }
    };

// ===== BACKUP CREATE =====
if (subcommand === "create") {
    // Kiểm tra quyền TRƯỚC khi defer — tránh lãng phí 3s window
    if (!interaction.member.permissions.has("Administrator")) {
        return await interaction.reply({ content: "❌ Bạn không có quyền Administrator!", flags: MessageFlags.Ephemeral });
    }

    // Defer + reply "đang sao lưu" NGAY LẬP TỨC — trả về Discord trong 3s
    await safeDeferReply(interaction);
    await safeReply({
        embeds: [new EmbedBuilder()
            .setColor("#f1c40f")
            .setTitle("🔄 Đang sao lưu server...")
            .setDescription(`Đang quét **${interaction.guild.name}**...\nKết quả sẽ gửi qua **DM** khi xong!`)
            .setTimestamp()]
    });

    // Toàn bộ xử lý nặng chạy ngầm — KHÔNG await để tránh 10062
    const _guild = interaction.guild;
    const _user = interaction.user;
    // Tạo ID CỐ ĐỊNH ngay đây — truyền vào setImmediate để console và DM dùng cùng 1 ID
    const _backupId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setImmediate(async () => {
        const notify = async (embed) => {
            await _user.send({ embeds: [embed] }).catch(() => {});
        };
        try {
            console.log(`\n[BACKUP] 🔄 Bắt đầu sao lưu: ${_guild.name}`);

            if (_guild.roles.cache.size < 2) await _guild.roles.fetch();
            if (_guild.channels.cache.size < 2) await _guild.channels.fetch();

            // ROLES
            const rolesData = [..._guild.roles.cache.values()]
                .filter(r => r.id !== _guild.id)
                .sort((a, b) => a.position - b.position)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    color: r.hexColor,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    position: r.position,
                    permissions: r.permissions.bitfield.toString(),
                    managed: r.managed
                }));

            // CATEGORIES
            const categoriesData = [..._guild.channels.cache.values()]
                .filter(c => c.type === 4)
                .sort((a, b) => a.position - b.position)
                .map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    position: cat.position,
                    permissionOverwrites: [...cat.permissionOverwrites.cache.values()].map(ow => ({
                        id: ow.id,
                        type: ow.type,
                        allow: ow.allow.bitfield.toString(),
                        deny: ow.deny.bitfield.toString()
                    }))
                }));

            // CHANNELS
            const channelsData = [..._guild.channels.cache.values()]
                .filter(c => c.type !== 4)
                .sort((a, b) => a.position - b.position)
                .map(ch => ({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                    position: ch.position,
                    parentId: ch.parentId || null,
                    topic: ch.topic || null,
                    nsfw: ch.nsfw || false,
                    rateLimitPerUser: ch.rateLimitPerUser || 0,
                    bitrate: ch.bitrate || null,
                    userLimit: ch.userLimit || null,
                    permissionOverwrites: [...(ch.permissionOverwrites?.cache?.values() || [])].map(ow => ({
                        id: ow.id,
                        type: ow.type,
                        allow: ow.allow.bitfield.toString(),
                        deny: ow.deny.bitfield.toString()
                    }))
                }));

            const backupData = {
                id: _backupId,
                guildId: _guild.id,
                guildName: _guild.name,
                guildIcon: _guild.iconURL({ extension: "png" }) || null,
                createdAt: new Date().toISOString(),
                roles: rolesData,
                categories: categoriesData,
                channels: channelsData
            };

            const absoluteBackupPath = path.resolve(process.cwd(), "backups");
            if (!fs.existsSync(absoluteBackupPath)) fs.mkdirSync(absoluteBackupPath, { recursive: true });

            console.log("[BACKUP] 📂 Thư mục backup:", absoluteBackupPath);
            console.log("[BACKUP] 📋 File hiện có:", fs.readdirSync(absoluteBackupPath));

            // Xóa TẤT CẢ file cũ TRƯỚC
            let deletedCount = 0;
            for (const file of fs.readdirSync(absoluteBackupPath)) {
                if (file.endsWith(".json")) {
                    try {
                        fs.unlinkSync(path.join(absoluteBackupPath, file));
                        deletedCount++;
                        console.log("[BACKUP] 🗑️ Đã xóa:", file);
                    } catch (unlinkErr) {
                        console.error("[BACKUP] ❌ Không xóa được:", file, unlinkErr.message);
                    }
                }
            }

            // Ghi file mới
            const filePath = path.join(absoluteBackupPath, `${backupData.id}.json`);
            fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf8");
            console.log("[BACKUP] 💾 Đã ghi file mới:", filePath);
            console.log(`[BACKUP] ✅ ID: ${backupData.id} | Roles: ${rolesData.length} | Cats: ${categoriesData.length} | Channels: ${channelsData.length}`);

            await notify(
                new EmbedBuilder()
                    .setColor("#00ff88")
                    .setTitle("✅ Sao lưu Server thành công!")
                    .setThumbnail(_guild.iconURL({ dynamic: true }))
                    .addFields(
                        { name: "🔑 Backup ID", value: `\`${backupData.id}\``, inline: false },
                        { name: "🎭 Roles", value: `**${rolesData.length}**`, inline: true },
                        { name: "📂 Categories", value: `**${categoriesData.length}**`, inline: true },
                        { name: "📁 Channels", value: `**${channelsData.length}**`, inline: true },
                        { name: "💾 File", value: `\`backups/${backupData.id}.json\``, inline: false }
                    )
                    .setFooter({ text: `Dọn ${deletedCount} bản cũ | By: ${_user.username}` })
                    .setTimestamp()
            );
        } catch (err) {
            console.error(`[BACKUP CREATE ERROR]:`, err);
            await notify(
                new EmbedBuilder()
                    .setColor("#ff3333")
                    .setTitle("❌ Lỗi khi tạo bản sao lưu!")
                    .setDescription(`\`\`\`${err.message}\`\`\``)
                    .setTimestamp()
            );
        }
    });

    return;
}

// ===== BACKUP LOAD =====
if (subcommand === "load") {
    // Kiểm tra quyền TRƯỚC khi defer — tránh lãng phí 3s window
    if (interaction.user.id !== interaction.guild.ownerId) {
        return await interaction.reply({
            content: "❌ **NGUY HIỂM:** Chỉ **Server Owner** mới được phép khôi phục dữ liệu!",
            flags: MessageFlags.Ephemeral
        });
    }

    const backupID = interaction.options.getString("id");
    const filePath = path.join(path.resolve(process.cwd(), "backups"), `${backupID}.json`);

    // Kiểm tra file tồn tại TRƯỚC khi defer
    if (!fs.existsSync(filePath)) {
        return await interaction.reply({ content: `❌ Không tìm thấy backup ID: \`${backupID}\`.`, flags: MessageFlags.Ephemeral });
    }

    // Defer sau khi đã validate xong
    await safeDeferReply(interaction);

    // Báo ngay, sau đó chạy ngầm — KHÔNG await restore để tránh interaction timeout
    await safeReply({
        embeds: [new EmbedBuilder()
            .setColor("#f1c40f")
            .setTitle("⚠️ Đang khôi phục server...")
            .setDescription("Kết quả sẽ được gửi qua **DM** khi hoàn tất. Đừng tắt bot!")
            .setTimestamp()]
    });

    // Chạy ngầm hoàn toàn — không liên quan đến interaction nữa
    setImmediate(async () => {
        const guild = interaction.guild;
        const notify = async (embed) => {
            await interaction.user.send({ embeds: [embed] }).catch(() => {});
        };

        try {
            const backupData = JSON.parse(fs.readFileSync(filePath, "utf8"));

            await guild.members.fetch();

            // 1. Xóa toàn bộ channels
            const allCh = await guild.channels.fetch();
            for (const [, ch] of allCh) await ch.delete().catch(() => {});

            // 2. Xóa roles cũ (trừ managed & @everyone)
            const allRoles = await guild.roles.fetch();
            for (const [, role] of allRoles) {
                if (!role.managed && role.id !== guild.id) await role.delete().catch(() => {});
            }

            // 3. Tái tạo ROLES
            const roleIdMap = {};
            const sortedRoles = [...(backupData.roles || [])].sort((a, b) => a.position - b.position);
            for (const r of sortedRoles) {
                if (r.managed) continue;
                try {
                    const newRole = await guild.roles.create({
                        name: r.name,
                        color: r.color || "#000000",
                        hoist: r.hoist,
                        mentionable: r.mentionable,
                        permissions: BigInt(r.permissions)
                    });
                    roleIdMap[r.id] = newRole;
                } catch (e) {
                    console.warn(`[LOAD] Skip role ${r.name}:`, e.message);
                }
            }

            // Helper map overwrite IDs sang role mới
            // - Nếu OW là @everyone (ID = guild cũ) → map sang guild.id (server hiện tại)
            // - Nếu OW là role đã được tạo lại → dùng ID mới
            // - Nếu OW là member (type=1) → giữ nguyên user ID
            const mapOW = (overwrites) => overwrites.map(ow => {
                let resolvedId;
                if (ow.id === backupData.guildId) {
                    resolvedId = guild.id; // @everyone của server mới
                } else {
                    resolvedId = roleIdMap[ow.id]?.id || ow.id;
                }
                return {
                    id: resolvedId,
                    type: ow.type,
                    allow: BigInt(ow.allow),
                    deny: BigInt(ow.deny)
                };
            });

            // 4. Tái tạo CATEGORIES
            const catIdMap = {};
            const sortedCats = [...(backupData.categories || [])].sort((a, b) => a.position - b.position);
            for (const cat of sortedCats) {
                try {
                    const newCat = await guild.channels.create({
                        name: cat.name,
                        type: 4,
                        position: cat.position,
                        permissionOverwrites: mapOW(cat.permissionOverwrites || [])
                    });
                    catIdMap[cat.id] = newCat;
                } catch (e) {
                    console.warn(`[LOAD] Skip category ${cat.name}:`, e.message);
                }
            }

            // 5. Tái tạo CHANNELS
            const sortedChannels = [...(backupData.channels || [])].sort((a, b) => a.position - b.position);
            for (const ch of sortedChannels) {
                try {
                    const opts = {
                        name: ch.name,
                        type: ch.type,
                        position: ch.position,
                        topic: ch.topic || null,
                        nsfw: ch.nsfw || false,
                        rateLimitPerUser: ch.rateLimitPerUser || 0,
                        permissionOverwrites: mapOW(ch.permissionOverwrites || [])
                    };
                    if (ch.parentId && catIdMap[ch.parentId]) opts.parent = catIdMap[ch.parentId].id;
                    if (ch.bitrate)   opts.bitrate   = ch.bitrate;
                    if (ch.userLimit) opts.userLimit = ch.userLimit;
                    await guild.channels.create(opts);
                } catch (e) {
                    console.warn(`[LOAD] Skip channel ${ch.name}:`, e.message);
                }
            }

            console.log(`[BACKUP] ✅ Khôi phục hoàn tất!`);
            await notify(
                new EmbedBuilder()
                    .setColor("#00ff88")
                    .setTitle("✅ Khôi phục hoàn tất!")
                    .setDescription(`Server **${guild.name}** đã được khôi phục từ \`${backupID}\`.`)
                    .addFields(
                        { name: "🎭 Roles", value: `${Object.keys(roleIdMap).length}`, inline: true },
                        { name: "📂 Categories", value: `${Object.keys(catIdMap).length}`, inline: true },
                        { name: "📁 Channels", value: `${sortedChannels.length}`, inline: true }
                    )
                    .setTimestamp()
            );

        } catch (err) {
            console.error(`[BACKUP LOAD ERROR]:`, err);
            await notify(
                new EmbedBuilder()
                    .setColor("#ff3333")
                    .setTitle("❌ Lỗi khi khôi phục!")
                    .setDescription(`\`\`\`${err.message}\`\`\``)
                    .setTimestamp()
            );
        }
    });

    return; // Trả về ngay, không await restore
}

    return;
}

else if (commandName === 'tungdongxu') {
        try {
            await safeDeferReply(interaction);
            const money = options.getInteger('money');
            const userId = interaction.user.id;

            if (!money || money <= 0) {
                return interaction.editReply("❌ Số tiền cược không hợp lệ!");
            }

            const balance = getCoins(userId);
            if (balance < money) {
                return interaction.editReply(`❌ Bạn không đủ coin! Số dư hiện tại: **${balance.toLocaleString()} coin**`);
            }
            addCoins(userId, -money);

            const embed = new EmbedBuilder()
                .setTitle("🪙 TUNG ĐỒNG XU")
                .setDescription(`Bạn đã cược **${money.toLocaleString()} coin**.\nChọn mặt muốn đặt:`)
                .setColor("Gold")
                .setFooter({ text: "Bạn có 30 giây để chọn!" });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`tdx_sap_${money}`).setLabel("SẤP").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`tdx_ngua_${money}`).setLabel("NGỬA").setStyle(ButtonStyle.Success)
            );

            return interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err) {
            console.error("🚨 TUNGDONGXU ERROR:", err);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply("❌ Có lỗi xảy ra khi khởi động trò chơi. Thử lại!");
            }
            return interaction.reply({ content: "❌ Lỗi hệ thống!", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
    
        /*BLACKLIST*/
        else if (commandName === "blacklist") {
            await safeDeferReply(interaction);

            const user = options.getUser("user");
            const reason = options.getString("reason") || "Không có";

            if (!hasPermission(interaction.member)) {
                return interaction.editReply({ content: "❌ Bạn không có quyền thực hiện lệnh này." });
            }

            if (blacklist.some(b => b.id === user.id)) {
                return interaction.editReply({ content: "⚠️ Người dùng đã nằm trong blacklist." });
            }

            blacklist.push({
                id: user.id,
                name: user.username,
                reason,
                time: new Date().toLocaleString("vi-VN")
            });
            saveBlacklist();

            const embed = new EmbedBuilder()
                .setTitle("🚫 BLACKLIST THÀNH CÔNG")
                .setColor("#ff0000")
                .addFields(
                    { name: "User", value: `<@${user.id}> (${user.username})`, inline: true },
                    { name: "Lý do", value: reason, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Các tác vụ chạy ngầm
            await interaction.guild.members.ban(user.id, { reason: `Blacklist: ${reason}` })
                .then(() => console.log(`Đã ban ${user.username}`))
                .catch(err => console.log("Lỗi ban:", err.message));

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
        else if (commandName === "unblacklist") {
            await safeDeferReply(interaction);

            const user = options.getUser("user");

            if (!hasPermission(interaction.member)) {
                return interaction.editReply({ content: "❌ Bạn không có quyền unblacklist." });
            }

            if (!blacklist.some(b => b.id === user.id)) {
                return interaction.editReply({ content: "⚠️ Người dùng không nằm trong blacklist." });
            }

            blacklist = blacklist.filter(b => b.id !== user.id);
            saveBlacklist();

            try {
                await interaction.guild.members.unban(user.id);
            } catch(err) {
                console.log("Unban lỗi (có thể user chưa bị ban hoặc đã rời):", err.message);
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ UNBLACKLIST THÀNH CÔNG")
                .setColor("#00ffcc")
                .addFields({ name: "User", value: `${user.username}`, inline: true })
                .setTimestamp();

            const logChannel = interaction.guild.channels.cache.get(process.env.BLACKLIST_LOG_CHANNEL);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle("✅ UNBLACKLIST LOG")
                    .setColor("#00ffcc")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .addFields(
                        { name: "User", value: `${user.username}`, inline: true },
                        { name: "Người thực hiện", value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: `ID: ${user.id}` })
                    .setTimestamp();
                logChannel.send({ embeds: [logEmbed] }).catch(console.log);
            }

            return interaction.editReply({ embeds: [embed] });
        }

        /* ===== STRIKE ===== */
        else if (commandName === "strike") {
            await safeDeferReply(interaction);

            const target = options.getUser("user");
            const reason = options.getString("reason");
            const proof = options.getAttachment("proof");
            const proofUrl = proof?.url || null;

            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (!hasPermission(member)) {
                return interaction.editReply({ content: "❌ Bạn không phải staff" });
            }

            const targetMember = await interaction.guild.members.fetch(target.id);

            if (targetMember.roles.cache.has(STAFF_ROLE_ID)) {
                return interaction.editReply({ content: "❌ Dùng /staffstrike cho staff" });
            }

            let user = strikes.find(x => x.id === target.id);

            if (!user) {
                user = { id: target.id, name: target.username, staff: false, strikes: [] };
                strikes.push(user);
            }

            user.strikes.push({ reason, proof: proofUrl, time: new Date().toLocaleString("vi-VN") });
            saveStrikes();

            const embed = new EmbedBuilder()
                .setColor("Red")
                .setTitle("🚨 Strike Member")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 User", value: `<@${target.id}>`, inline: true },
                    { name: "🛡 Staff", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "📌 Reason", value: reason }
                )
                .setImage(proofUrl)
                .setFooter({ text: `Strike ${user.strikes.length}/3` })
                .setTimestamp();

            sendStrikeLog(client, embed);

            if (user.strikes.length >= 3) {
                await targetMember.ban({ reason: "Đủ 3 strike" }).catch(() => {});
            }

            return interaction.editReply(`✅ ${target.username} đã bị strike (${user.strikes.length}/3)`);
        }

        /* ===== UNSTRIKE ===== */
        else if (commandName === "unstrike") {
            await safeDeferReply(interaction);

            const target = options.getUser("user");
            const strikeIndex = options.getInteger("strike") - 1;

            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (!hasPermission(member)) {
                return interaction.editReply({ content: "❌ Bạn không phải staff" });
            }

            let user = strikes.find(x => x.id === target.id);

            if (!user || user.strikes.length === 0) {
                return interaction.editReply("⚠️ Người này không có strike");
            }

            if (strikeIndex < 0 || strikeIndex >= user.strikes.length) {
                return interaction.editReply("❌ Strike này không tồn tại");
            }

            const removed = user.strikes.splice(strikeIndex, 1)[0];

            if (user.strikes.length === 0) {
                strikes = strikes.filter(x => x.id !== target.id);
            }

            saveStrikes();

            const embed = new EmbedBuilder()
                .setColor("Green")
                .setTitle("✅ Unstrike")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 User", value: `<@${target.id}>`, inline: true },
                    { name: "🛡 Staff", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "🗑 Removed", value: removed.reason }
                )
                .setFooter({ text: `Còn lại: ${user.strikes.length}` })
                .setTimestamp();

            sendStrikeLog(client, embed);

            return interaction.editReply(
                `✅ Đã gỡ Strike ${strikeIndex + 1}\n📌 ${removed.reason}\n📉 Còn: ${user.strikes.length}/${user.staff ? 4 : 3}`
            );
        }
// --- LỆNH DAILY ---
else if (commandName === 'daily') {
    try {
        await safeDeferReply(interaction);

        const userId = interaction.user.id;
        const now = Date.now();
        const lastDaily = dailyCooldown.get(userId) || 0;
        const oneDay = 86400000;
        const twoDays = 172800000; // 48h — nếu quá 2 ngày thì reset streak

        // cooldown
        if (now - lastDaily < oneDay) {
            const remaining = oneDay - (now - lastDaily);
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);

            return interaction.editReply(
                `⏳ Bạn đã nhận quà hôm nay rồi! Quay lại sau **${hours} giờ ${minutes} phút** nữa nhé.`
            );
        }

        // Tính streak: nếu bỏ lỡ hơn 2 ngày thì reset về 0
        let streak = dailyStreak.get(userId) || 0;
        if (lastDaily > 0 && now - lastDaily >= twoDays) {
            streak = 0; // bỏ lỡ ngày → reset
        }

        // Tính reward: lần đầu 500, mỗi streak +15, max 5000
        const reward = Math.min(500 + streak * 15, 5000);

        // Cập nhật streak cho lần tiếp theo
        streak += 1;
        dailyStreak.set(userId, streak);
        dailyCooldown.set(userId, now);

        addCoins(userId, reward);

        const isMax = reward >= 5000;
        const nextReward = Math.min(500 + streak * 15, 5000);

        const embed = new EmbedBuilder()
            .setTitle("🎁 QUÀ TẶNG HÀNG NGÀY")
            .setColor(isMax ? "Gold" : "Green")
            .setDescription(`Chúc mừng <@${userId}>! Bạn đã nhận được **${reward.toLocaleString()} coin**.`)
            .addFields(
                {
                    name: "🔥 Streak",
                    value: `**${streak} ngày** liên tiếp`,
                    inline: true
                },
                {
                    name: "💰 Số dư hiện tại",
                    value: `**${getCoins(userId).toLocaleString()} coin**`,
                    inline: true
                },
                {
                    name: isMax ? "🏆 Đã đạt tối đa!" : "⏭ Lần sau",
                    value: isMax ? "Bạn đang nhận mức thưởng cao nhất!" : `**${nextReward.toLocaleString()} coin**`,
                    inline: true
                }
            )
            .setFooter({ text: "Nhận mỗi ngày để tăng streak • Bỏ lỡ 1 ngày sẽ mất streak!" })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error("🚨 DAILY ERROR:", err);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply("❌ Có lỗi xảy ra khi xử lý phần thưởng. Vui lòng thử lại!");
        } else {
            return interaction.reply({ content: "❌ Lỗi hệ thống!", flags: MessageFlags.Ephemeral });
        }
    }
}
    // --- LỆNH TOPCOIN ---
else if (commandName === 'topcoin') {
if (!interaction.deferred && !interaction.replied) {
    await safeDeferReply(interaction);
}

const sorted = Object.entries(coins)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    const list = sorted.length
        ? sorted.map(([id, val], i) => `${i + 1}. <@${id}>: **${val}** 🪙`).join("\n")
        : "Chưa có dữ liệu";

    const embed = new EmbedBuilder()
        .setTitle("🏆 TOP COIN")
        .setDescription(list)
        .setColor("#f1c40f");

    return interaction.editReply({ embeds: [embed] });
}

    // --- LỆNH PAY ---
else if (commandName === 'pay') {
if (!interaction.deferred && !interaction.replied) {
    await safeDeferReply(interaction);
}

    const userId = interaction.user.id;
    const target = options.getUser('user');
    const amount = options.getInteger('amount');

    if (!target || !amount || amount <= 0) {
        return interaction.editReply("❌ Dữ liệu không hợp lệ!");
    }

    if (target.id === userId) {
        return interaction.editReply("❌ Không thể chuyển cho chính mình!");
    }

    if (getCoins(userId) < amount) {
        return interaction.editReply("❌ Bạn không đủ coin!");
    }

    addCoins(userId, -amount);
    addCoins(target.id, amount);

    return interaction.editReply(`✅ Đã chuyển **${amount} coin** cho <@${target.id}>`);
}

        /* ===== STAFFSTRIKE ===== */
        else if (commandName === "staffstrike") {
            await safeDeferReply(interaction);

            const target = options.getUser("user");
            const reason = options.getString("reason");
            const proof = options.getAttachment("proof");

            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (!hasPermission(member)) {
                return interaction.editReply({ content: "❌ Bạn không phải staff" });
            }

            const targetMember = await interaction.guild.members.fetch(target.id);

            if (!targetMember.roles.cache.has(STAFF_ROLE_ID)) {
                return interaction.editReply({ content: "❌ Chỉ dùng cho staff" });
            }

            let user = strikes.find(x => x.id === target.id);

            if (!user) {
                user = { id: target.id, name: target.username, staff: true, strikes: [] };
                strikes.push(user);
            }

            if (user.strikes.length >= 4) {
                return interaction.editReply("⚠️ Staff này đã 4/4 strike");
            }

            user.strikes.push({ reason, proof: proof?.url, time: new Date().toLocaleString("vi-VN") });
            saveStrikes();

            const embed = new EmbedBuilder()
                .setColor("Orange")
                .setTitle("⚠️ Staff Strike")
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: "👤 Staff", value: `<@${target.id}>`, inline: true },
                    { name: "🛡 By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "📌 Reason", value: reason }
                )
                .setImage(proof?.url)
                .setFooter({ text: `Strike ${user.strikes.length}/4` })
                .setTimestamp();

            sendStrikeLog(client, embed);

            if (user.strikes.length >= 4) {
                await targetMember.roles.remove(STAFF_ROLE_ID).catch(() => {});
            }

            return interaction.editReply(`🔥 Staff ${target.username} đã bị strike (${user.strikes.length}/4)`);
        }

        /* ===== BXH ===== */
        else if (commandName === "bxh") {
            await safeDeferReply(interaction);
            const sub = options.getSubcommand();
            if (sub === "kill" || sub === "chat") {
                return interaction.editReply({ content: "⚙️ Tính năng **BXH** đang được phát triển, vui lòng chờ!" });
            }
        }

        /* ===== LIST ===== */
        else if (commandName === "list") {
            await safeDeferReply(interaction);

            const type = options.getString("type");
            let text = "";

            if (type === "top") Object.keys(top).forEach(i => {
                if (top[i]) text += `🏆 **TOP ${i}** • ${top[i].name}\n`;
            });
            if (type === "staff") staff.forEach(s => text += `👑 **${s.username}** • ${s.role}\n`);
            if (type === "mainers") mainers.forEach(m => text += `🔥 **${m.name}**\n`);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`📋 Danh sách ${type}`)
                        .setDescription(text || "Không có dữ liệu")
                        .setColor(0x00eaff)
                ]
            });
        }

        /* ===== SETTOP ===== */
        else if (commandName === "settop") {
            await safeDeferReply(interaction);

            const user = options.getUser("user");
            const rank = options.getInteger("top");

            if (rank < 1 || rank > 20) {
                return interaction.editReply("❌ Rank phải từ 1 → 20");
            }

            for (let i = 1; i <= 20; i++) {
                if (top[i]?.id === user.id) top[i] = null;
            }

            let newTop = [];
            for (let i = 1; i <= 20; i++) {
                if (top[i]) newTop.push(top[i]);
            }

            newTop.splice(rank - 1, 0, {
                id: user.id,
                name: user.username,
                avatar: user.displayAvatarURL({ extension: "png" }),
                profile: `https://discord.com/users/${user.id}`
            });

            newTop = newTop.slice(0, 20);
            top = {};
            newTop.forEach((u, index) => { top[index + 1] = u; });

            saveTop();
            await updateAOVLeaderboard();

            return interaction.editReply(`✅ ${user.username} vào TOP ${rank}`);
        }

        /* ===== DETOP ===== */
        else if (commandName === "detop") {
            await safeDeferReply(interaction);

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
                await updateAOVLeaderboard();
                return interaction.editReply(`🗑️ Đã xóa ${user.username} khỏi TOP`);
            }

            return interaction.editReply("❌ User không có trong TOP");
        }

        /* ===== PROMOTE ===== */
        else if (commandName === "promote") {
            await safeDeferReply(interaction);

            const user = options.getUser("user");
            const roleName = options.getString("permission");

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!hasPermission(member)) {
                return interaction.editReply("❌ Bạn không có quyền dùng lệnh này");
            }

            let target = interaction.guild.members.cache.get(user.id);
            if (!target) target = await interaction.guild.members.fetch(user.id);

            const roleId = ROLE_MAP[roleName];
            if (!roleId) return interaction.editReply("❌ Role không tồn tại");

            const newRole = interaction.guild.roles.cache.get(roleId);
            if (!newRole) return interaction.editReply("❌ Không tìm thấy role");

            for (let r of Object.values(ROLE_MAP)) {
                if (r === roleId) continue;
                let role = interaction.guild.roles.cache.get(r);
                if (!role) continue;
                if (target.roles.cache.has(role.id)) {
                    try {
                        await target.roles.remove(role);
                        console.log(`Đã xóa role ${role.name}`);
                    } catch (err) {
                        console.log(`Không xóa được role ${role.name}:`, err.message);
                    }
                }
            }

            if (newRole.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.editReply("❌ Bot không đủ quyền add role này");
            }

            try {
                await target.roles.add(newRole);
                console.log(`Đã add role ${newRole.name} cho ${target.user.username}`);
            } catch (err) {
                console.log("Add role lỗi:", err);
                return interaction.editReply("❌ Không thể add role");
            }

            staff = staff.filter(s => s.id !== user.id);
            staff.push({ id: user.id, username: user.username, role: roleName, avatar: user.displayAvatarURL({ extension: "png" }) });
            saveStaff();

            const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor("#00ffcc")
                    .setTitle("📢 ROLE UPDATE")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .addFields(
                        { name: " User", value: `<@${user.id}>`, inline: true },
                        { name: " Role", value: roleName, inline: true },
                        { name: " Action", value: "Promote", inline: true },
                        { name: " By", value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: `ID: ${user.id}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();
                logChannel.send({ embeds: [embed] });
            }

            return interaction.editReply(`✅ ${user.username} đã được set role **${roleName}**`);
        }

        /* ===== DEMOTE ===== */
        else if (commandName === "demote") {
            await safeDeferReply(interaction);

            const user = options.getUser("user");

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!hasPermission(member)) {
                return interaction.editReply({ content: "❌ Bạn không có quyền dùng lệnh này" });
            }

            const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
            const target = await interaction.guild.members.fetch(user.id);

            for (let r of Object.values(ROLE_MAP)) {
                let role = interaction.guild.roles.cache.get(r);
                if (role && target.roles.cache.has(role.id)) {
                    await target.roles.remove(role);
                }
            }

            staff = staff.filter(s => s.id !== user.id);
            saveStaff();

            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setColor("#ff4d4d")
                    .setTitle("📢 ROLE REMOVED")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .addFields(
                        { name: " User", value: `<@${user.id}>`, inline: true },
                        { name: " Action", value: "Demote", inline: true },
                        { name: " By", value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: `ID: ${user.id}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();
                logChannel.send({ embeds: [embed] });
            }

            return interaction.editReply(`❌ Đã gỡ toàn bộ role của ${user.username}`);
        }

        /* ===== MAINER ===== */
        else if (commandName === "mainer") {
            await safeDeferReply(interaction);

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
        else if (commandName === "demainer") {
            await safeDeferReply(interaction);

            const user = options.getUser("user");
            mainers = mainers.filter(m => m.id !== user.id);
            saveMainers();

            return interaction.editReply(`❌ ${user.username} đã bị xóa khỏi Mainers`);
        }

        /* ===== THIDAU ===== */
        else if (commandName === "thidau") {
            if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

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

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        /* ===== COIN ===== */
        else if (commandName === "coin") {
            await safeDeferReply(interaction);
            const userId = interaction.user.id;
            const balance = getCoins(userId);
            const embed = new EmbedBuilder()
                .setTitle("💰 SỐ DƯ CỦA BẠN")
                .setDescription(`<@${userId}> đang có **${balance.toLocaleString()} coin** 🪙`)
                .setColor("#f1c40f")
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

else if (commandName === "baucua") {
    await safeDeferReply(interaction);

    const embed = new EmbedBuilder()
        .setTitle("🎲 BẦU CUA")
        .setDescription("👉 Chọn linh vật bạn muốn cược")
        .setColor("#00eaff");

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bc_bau").setLabel("🍐 BẦU").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bc_cua").setLabel("🦀 CUA").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("bc_tom").setLabel("🦐 TÔM").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("bc_ca").setLabel("🐟 CÁ").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("bc_ga").setLabel("🐔 GÀ").setStyle(ButtonStyle.Danger)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bc_nai").setLabel("🦌 NAI").setStyle(ButtonStyle.Success)
    );

    return interaction.editReply({ embeds: [embed], components: [row1, row2] });
}

        /* ===== TÀI XỈU ===== */
        else if (commandName === "taixiu") {
            await safeDeferReply(interaction);

            const embed = new EmbedBuilder()
                .setTitle("🎲 TÀI XỈU")
                .setDescription("👉 Chọn Tài hoặc Xỉu\n💰 Sau đó nhập tiền")
                .setColor("Yellow");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("tai")
                    .setLabel("🔥 TÀI")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("xiu")
                    .setLabel("❄️ XỈU")
                    .setStyle(ButtonStyle.Primary)
            );

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

    }

    // ===== BUTTON INTERACTIONS =====
    else if (interaction.isButton()) {

if (interaction.customId.startsWith("tdx_")) {
        const parts = interaction.customId.split("_");
        const userChoice = parts[1]; // "sap" hoặc "ngua"
        const betAmount = parseInt(parts[2]);
        const userId = interaction.user.id;

        // Tỉ lệ 50/50
        const result = Math.random() < 0.5 ? "sap" : "ngua";
        const resultText = result === "sap" ? "SẤP" : "NGỬA";

        if (userChoice === result) {
            const winMoney = Math.floor(betAmount * 2);
            addCoins(userId, winMoney); 
            
            await interaction.update({ 
                content: `✅ Kết quả là **${resultText}**. Bạn thắng **${winMoney.toLocaleString()} coin**!`, 
                embeds: [], 
                components: [] 
            });
        } else {
            // Không cần trừ tiền nữa vì đã trừ lúc dùng lệnh rồi
            await interaction.update({ 
                content: `❌ Kết quả là **${resultText}**. Bạn đã thua mất **${betAmount.toLocaleString()} coin**!`, 
                embeds: [], 
                components: [] 
            });
        }
        return; // Quan trọng để ngắt thực thi
    }

if (interaction.customId.startsWith("bc_")) {
    const choice = interaction.customId.split("_")[1];

    const modal = new ModalBuilder()
        .setCustomId(`bc_bet_${choice}`)
        .setTitle("Nhập tiền cược");

    const input = new TextInputBuilder()
        .setCustomId("money")
        .setLabel("Số coin cược")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
}

 if (interaction.customId.startsWith("cf_")) {
    const [_, betSide, betMoney] = interaction.customId.split("_");
    const money = parseInt(betMoney);
    const userId = interaction.user.id;

    // Chỉ người bấm lệnh mới được chọn - dùng optional chaining đề phòng bot restart
    const originalUserId = interaction.message.interaction?.user?.id ?? interaction.message.mentions?.users?.first()?.id;
    if (originalUserId && originalUserId !== userId) {
        return interaction.reply({ content: "❌ Nút này không phải của bạn!", flags: MessageFlags.Ephemeral });
    }

    await safeDeferUpdate(interaction);

    // Hiệu ứng Animation 3 bước
    const frames = ["⌛ Đang tung...", "🪙 Đang xoay...", "✨ Đang hạ xuống..."];
    for (const frame of frames) {
        await interaction.editReply({ content: `**${frame}**`, embeds: [], components: [] });
        await new Promise(r => setTimeout(r, 800));
    }

    const result = Math.random() < 0.5 ? "ngua" : "up";
    const win = result === betSide;
    const resultText = result === "ngua" ? "🔥 NGỬA" : "❄️ ÚP";

    if (win) {
        const winAmount = Math.floor(money * 1.95); // Trả lại vốn + 95% lời (5% thuế)
        addCoins(userId, money + winAmount); // Hoàn vốn + tiền thắng
        await interaction.editReply({ 
            content: `🎉 Kết quả là: **${resultText}**. Bạn thắng và nhận được **${winAmount}** coin!` 
        });
    } else {
        await interaction.editReply({ 
            content: `💀 Kết quả là: **${resultText}**. Bạn đã mất **${money}** coin. Chúc may mắn lần sau!` 
        });
    }
    return;
}

        if (interaction.customId === "tai" || interaction.customId === "xiu") {
            const modal = new ModalBuilder()
                .setCustomId(`bet_${interaction.customId}`)
                .setTitle("Nhập tiền cược");

            const input = new TextInputBuilder()
                .setCustomId("money")
                .setLabel("Số tiền cược")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (interaction.customId === "close_ticket") {
            if (!interaction.channel.name.startsWith("ai-ticket-")) {
                return interaction.reply({ content: "❌ Không thể đóng kênh này!", flags: MessageFlags.Ephemeral });
            }
            await safeDeferUpdate(interaction);
            await interaction.followUp({ content: "🔒 Đang đóng ticket...", flags: MessageFlags.Ephemeral });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            return;
        }

        if (interaction.customId === "create_ai_ticket") {
            const now = Date.now();
            const lastTicket = ticketCooldown.get(interaction.user.id) || 0;
            if (now - lastTicket < TICKET_COOLDOWN) {
                return interaction.reply({ content: "⏳ Vui lòng chờ trước khi tạo ticket mới!", flags: MessageFlags.Ephemeral });
            }
            ticketCooldown.set(interaction.user.id, now);

            await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });

            try {
                const ticketChannel = await interaction.guild.channels.create({
                    name: `ai-ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: process.env.TICKET_CATEGORY_ID,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                    ]
                });

                selected.set(ticketChannel.id, { userId: interaction.user.id });

                const embed = new EmbedBuilder()
                    .setTitle("🎫 AI SUPPORT TICKET")
                    .setDescription(`Xin chào <@${interaction.user.id}>`)
                    .setColor("#00eaff");

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("close_ticket")
                        .setLabel("🔒 Đóng Ticket")
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({ embeds: [embed], components: [row] });
                return interaction.editReply({ content: `✅ Ticket: ${ticketChannel}` });

            } catch (err) {
                console.error(err);
                return interaction.editReply("❌ Lỗi tạo ticket");
            }
        }
    }

    // ===== SELECT MENU INTERACTIONS =====
    else if (interaction.isStringSelectMenu()) {

        if (interaction.customId === "match_info") {
            return interaction.reply({ content: `📌 Thông tin: ${interaction.values[0]}` });
        }

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

    // ===== MODAL SUBMIT INTERACTIONS =====
    else if (interaction.isModalSubmit()) {

        if (interaction.customId === "submit_score") {
            const score = interaction.fields.getTextInputValue("score");
            const stage = selected.get(interaction.user.id) || "Unknown";

            return interaction.reply({
                content: `✅ Đã gửi!\nStage: **${stage}**\nScore: **${score}**`
            });
        }
if (interaction.customId.startsWith("bc_bet_")) {
    const userId = interaction.user.id;

    try {
        // 1. Phải deferReply ngay lập tức để tránh lỗi "Interaction has already been acknowledged"
        if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

        const choice = interaction.customId.split("_")[2];
        const moneyInput = interaction.fields.getTextInputValue("money");
        const money = parseInt(moneyInput);

        const animals = ["bau", "cua", "tom", "ca", "ga", "nai"];
        const emojiMap = {
            bau: "🍐",
            cua: "🦀",
            tom: "🦐",
            ca: "🐟",
            ga: "🐔",
            nai: "🦌"
        };

        // 2. Kiểm tra tính hợp lệ của tiền
        if (isNaN(money) || money <= 0) {
            return interaction.editReply({
                content: "❌ Số tiền cược không hợp lệ!"
            });
        }

        // 3. Kiểm tra ví tiền
        const balance = getCoins(userId);
        if (balance < money) {
            return interaction.editReply({
                content: `❌ Bạn không đủ coin! Số dư hiện tại: **${balance.toLocaleString()}**`
            });
        }

        // 4. Trừ tiền cược và bắt đầu quay
        addCoins(userId, -money);
        await interaction.editReply("🎲 Đang lắc bầu cua... Chờ chút nhé!");

        // Hiệu ứng chờ 2 giây cho kịch tính
        await new Promise(r => setTimeout(r, 2000));

        const result = [
            animals[Math.floor(Math.random() * animals.length)],
            animals[Math.floor(Math.random() * animals.length)],
            animals[Math.floor(Math.random() * animals.length)]
        ];

        const count = result.filter(x => x === choice).length;

        let winAmount = 0;
        if (count === 1) winAmount = money * 2;
        else if (count === 2) winAmount = money * 3;
        else if (count === 3) winAmount = money * 5;

        if (count > 0) {
            addCoins(userId, winAmount); // Hoàn vốn + tiền thắng (đã trừ tiền cược từ trước)
        }

        // 5. Trả kết quả cuối cùng
        return interaction.editReply({
            content: null, // Xóa nội dung "Đang lắc..."
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎲 KẾT QUẢ BẦU CUA")
                    .setColor(count > 0 ? "Green" : "Red")
                    .setDescription(
                        `Người đặt: <@${userId}>\n` +
                        `Linh vật chọn: ${emojiMap[choice]} **${choice.toUpperCase()}**\n\n` +
                        `🎲 **KẾT QUẢ:** ${result.map(x => emojiMap[x]).join(" | ")}\n\n` +
                        (count > 0
                            ? `🎉 **THẮNG!** Bạn nhận được **+${winAmount.toLocaleString()}** coin (x${count})`
                            : `💀 **THUA!** Bạn đã mất **-${money.toLocaleString()}** coin.`)
                    )
                    .setTimestamp()
            ]
        });

    } catch (err) {
        console.error("❌ LỖI BẦU CUA:", err);
        // Kiểm tra nếu đã defer thì dùng editReply, nếu chưa thì reply
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: "❌ Đã xảy ra lỗi hệ thống khi xử lý kết quả!" });
        } else {
            return interaction.reply({ content: "❌ Lỗi khởi tạo trò chơi!", flags: MessageFlags.Ephemeral });
        }
    }
}
if (interaction.customId.startsWith("bet_")) {
        try {
            const userId = interaction.user.id;
            const choice = interaction.customId.split("_")[1]; // "tai" hoặc "xiu"
            const money = parseInt(interaction.fields.getTextInputValue("money"));

            // 1. deferReply NGAY LẬP TỨC — phải là thao tác đầu tiên để tránh timeout 3 giây
            if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

            // 2. Kiểm tra đầu vào
            if (isNaN(money) || money <= 0) {
                return interaction.editReply({ content: "❌ Tiền cược không hợp lệ!" });
            }

            // 3. Kiểm tra số dư
            const currentBalance = getCoins(userId);
            if (currentBalance < money) {
                return interaction.editReply({
                    content: `❌ Không đủ tiền! (Bạn có: ${currentBalance.toLocaleString()} coin)`
                });
            }

            // 4. Trừ tiền và báo đang lắc
            addCoins(userId, -money);
            await interaction.editReply("🎲 Đang lắc xúc xắc...");

            // 5. Dùng await thay vì setTimeout để tránh lỗi interaction expired
            await new Promise(r => setTimeout(r, 3000));

            const dice = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            const total = dice.reduce((a, b) => a + b, 0);

            const chance = getWinChance(userId);
            const win = Math.random() < chance;
            updateStreak(userId, win);

            const totalLabel = total >= 11 ? "TÀI" : "XỈU";

            let resultEmbed = new EmbedBuilder()
                .setTitle("🎲 KẾT QUẢ TÀI XỈU")
                .setDescription(`Xúc xắc: **${dice.join(" - ")}** (Tổng: **${total}** → **${totalLabel}**)`)
                .setTimestamp();

            if (win) {
                const winMoney = Math.floor(money * 1.95);
                addCoins(userId, money + winMoney); // hoàn lại vốn + tiền thắng
                resultEmbed.setColor("Green")
                    .addFields({ name: "Kết quả", value: `✅ Thắng! Nhận được **+${winMoney.toLocaleString()} coin**` });
            } else {
                resultEmbed.setColor("Red")
                    .addFields({ name: "Kết quả", value: `❌ Thua! Bạn đã mất **-${money.toLocaleString()} coin**` });
            }

            return interaction.editReply({ content: null, embeds: [resultEmbed] });

        } catch (err) {
            console.error("🚨 BET_ MODAL ERROR:", err);
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply("❌ Có lỗi xảy ra! Vui lòng thử lại.").catch(() => {});
            }
            return interaction.reply({ content: "❌ Có lỗi xảy ra! Vui lòng thử lại.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
    } // đóng isModalSubmit

    } catch (err) {
        // Lớp bảo vệ cuối — nếu 10062/40060 vẫn lọt (rất hiếm), bỏ qua im lặng
        if (err?.code === 10062 || err?.message?.includes("Unknown Interaction")) {
            console.warn("[FALLBACK] 10062 lọt qua guard — bỏ qua");
            return;
        }
        if (err?.code === 40060 || err?.message?.includes("already been acknowledged")) {
            console.warn("[FALLBACK] 40060 lọt qua guard — bỏ qua");
            return;
        }
        console.error("🚨 LỖI HỆ THỐNG INTERACTION:", err);

        const errorEmbed = {
            embeds: [new EmbedBuilder()
                .setColor("#ff3333")
                .setTitle("❌ Có lỗi xảy ra!")
                .setDescription("Vui lòng thử lại sau hoặc liên hệ Admin.")
                .setTimestamp()],
            flags: MessageFlags.Ephemeral
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(errorEmbed).catch(() => {});
            } else {
                await interaction.reply(errorEmbed).catch(() => {});
            }
        } catch (finalErr) {
            console.error("🔥 Không thể gửi thông báo lỗi:", finalErr.message);
        }
    }
}); 

app.get("/staff-realtime", async (req, res) => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.members.fetch();

        const roleIds = Object.values(ROLE_MAP);

        const staffMembers = guild.members.cache
            .filter(member => member.roles.cache.some(role => roleIds.includes(role.id)))
            .map(member => {
                const memberRole = Object.keys(ROLE_MAP).find(r => member.roles.cache.has(ROLE_MAP[r]));
                const roleObj = guild.roles.cache.get(ROLE_MAP[memberRole]);
                const color = roleObj ? "#" + roleObj.color.toString(16).padStart(6,"0") : "#55ff8f";

                return {
                    id: member.user.id,
                    username: member.user.username,
                    avatar: member.user.displayAvatarURL({ forceStatic: false }),
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
app.get("/top", (req, res) => {
    for (let i = 1; i <= 20; i++) {
        if (!top[i]) {
            top[i] = {
                id: null,
                name: "Vacant"
            };
        }
    }
    res.json(top);
});
app.get("/blacklist", (req, res) => res.json(blacklist));
app.get("/staff", (req, res) => {
    const roleOrder = ["Founder", "Leader", "Admin", "Mod", "Referee"];
    const sorted = [...staff].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    res.json(sorted);
});
app.get("/strike", (req, res) => {
    res.json(strikes);
});
app.get("/stats", (req, res) => res.json(stats));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Server chạy port " + PORT);
});
console.log("TOKEN LENGTH:", process.env.TOKEN?.length);
console.log("TOKEN START:", process.env.TOKEN?.slice(0, 10));
console.log("TOKEN OK:", process.env.TOKEN ? "CÓ" : "KHÔNG");
console.log("👉 ĐANG LOGIN DISCORD...");
async function loginWithRetry(retries = 5, delay = 5000) {
    for (let i = 1; i <= retries; i++) {
        try {
            await client.login(process.env.TOKEN);
            console.log("🔑 LOGIN SUCCESS");
            return;
        } catch (err) {
            console.log(`❌ LOGIN FAIL (lần ${i}/${retries}):`, err.message);
            if (i < retries) {
                console.log(`⏳ Thử lại sau ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    console.log("💀 Không thể đăng nhập sau nhiều lần thử. Thoát.");
    process.exit(1);
}

loginWithRetry();
