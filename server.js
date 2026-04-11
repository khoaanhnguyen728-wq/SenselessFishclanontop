require("dotenv").config();
process.on("unhandledRejection", err => {
    console.log("❌ UNHANDLED:", err);
});

process.on("uncaughtException", err => {
    console.log("❌ CRASH:", err);
});
console.log("🚀 BOT ĐANG KHỞI ĐỘNG...");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
const { getCoins, addCoins, setCoins } = require("./coins");
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
    PermissionsBitField
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on("debug", console.log);
client.on("warn", console.log);
client.once("ready", () => {
    console.log("✅ BOT ONLINE:", client.user.tag);
    setInterval(() => {
        console.log("⏳ Đang update AOV...");
        console.log("🤖 BOT TAG:", client.user.tag);
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
**Đối xử với mọi người như cách bạn muốn được đối xử.
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
client.on("interactionCreate", async interaction => {
    try {
console.log("📩 INTERACTION:", interaction.commandName || interaction.customId);
console.log("👤 USER:", interaction.user.tag);
console.log("📍 GUILD:", interaction.guildId);

    //SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

if (commandName === 'tungdongxu') {
        await interaction.deferReply();
        const money = options.getInteger('money');
        const userId = interaction.user.id;

        // 1. Kiểm tra tiền hợp lệ
        if (!money || money <= 0) {
            return interaction.editReply("❌ Số tiền cược không hợp lệ!");
        }

        // 2. Kiểm tra ví tiền đồng bộ (Giống Vault)
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
    }
    
        /*BLACKLIST*/
        if (commandName === "blacklist") {
            await interaction.deferReply({ ephemeral: true });

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
                    { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
                    { name: "Lý do", value: reason, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Các tác vụ chạy ngầm
            await interaction.guild.members.ban(user.id, { reason: `Blacklist: ${reason}` })
                .then(() => console.log(`Đã ban ${user.tag}`))
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
            await interaction.deferReply({ ephemeral: true });

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
                .addFields({ name: "User", value: `${user.tag}`, inline: true })
                .setTimestamp();

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

        /* ===== STRIKE ===== */
        else if (commandName === "strike") {
            await interaction.deferReply({ ephemeral: true });

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
            await interaction.deferReply({ ephemeral: true });

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
if (commandName === 'daily') {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        const userId = interaction.user.id;

        const lastDaily = dailyCooldown.get(userId) || 0;
        const now = Date.now();

        // cooldown 24h
        if (now - lastDaily < 86400000) {
            return interaction.editReply("⏳ Bạn đã nhận quà hôm nay rồi!");
        }

        // 🎲 random 500 - 2000
        const reward = Math.floor(Math.random() * 1501) + 500;

        console.log("DAILY REWARD DEBUG:", reward);

        addCoins(userId, reward);
        dailyCooldown.set(userId, now);

        return interaction.editReply(
            `🎁 Bạn nhận được **${reward.toLocaleString()} coin**!`
        );

    } catch (err) {
        console.error("DAILY ERROR:", err);
        return interaction.editReply("❌ Có lỗi xảy ra khi nhận daily!");
    }
}
    // --- LỆNH TOPCOIN ---
if (commandName === 'topcoin') {
if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
}

const data = JSON.parse(fs.readFileSync("coins.json", "utf8") || "{}");

const sorted = Object.entries(data)
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
if (commandName === 'pay') {
if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
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
            await interaction.deferReply({ ephemeral: true });

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
            await interaction.deferReply({ ephemeral: true });
            const sub = options.getSubcommand();
            if (sub === "kill" || sub === "chat") {
                return interaction.editReply({ content: "Tính năng đang phát triển.", ephemeral: true });
            }
        }

        /* ===== LIST ===== */
        else if (commandName === "list") {
            await interaction.deferReply({ ephemeral: true });

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
            await interaction.deferReply({ ephemeral: true });

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
            await interaction.deferReply({ ephemeral: true });

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
            await interaction.deferReply({ ephemeral: true });

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
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
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
            await interaction.deferReply({ ephemeral: true });

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
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
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
            await interaction.deferReply({ ephemeral: true });

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
            await interaction.deferReply({ ephemeral: true });

            const user = options.getUser("user");
            mainers = mainers.filter(m => m.id !== user.id);
            saveMainers();

            return interaction.editReply(`❌ ${user.username} đã bị xóa khỏi Mainers`);
        }

        /* ===== THIDAU ===== */
        else if (commandName === "thidau") {
            await interaction.deferReply({ ephemeral: true });

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
            const userId = interaction.user.id;
            return interaction.reply(`💰 Bạn có: **${getCoins(userId)} coin**`);
        }

else if (commandName === "baucua") {
    await interaction.deferReply();

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

            return interaction.reply({ embeds: [embed], components: [row] });
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
        return interaction.reply({ content: "❌ Nút này không phải của bạn!", ephemeral: true });
    }

    await interaction.deferUpdate();

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
        addCoins(userId, winAmount);
        await interaction.editReply({ 
            content: `🎉 Kết quả là: **${resultText}**. Bạn thắng và nhận được **${winAmount}** coin!` 
        });
    } else {
        await interaction.editReply({ 
            content: `💀 Kết quả là: **${resultText}**. Bạn đã mất **${money}** coin. Chúc may mắn lần sau!` 
        });
    }
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
                return interaction.reply({ content: "❌ Không thể đóng kênh này!", ephemeral: true });
            }
            await interaction.reply({ content: "🔒 Đang đóng ticket..." });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            return;
        }

        if (interaction.customId === "create_ai_ticket") {
            const now = Date.now();
            const lastTicket = ticketCooldown.get(interaction.user.id) || 0;
            if (now - lastTicket < TICKET_COOLDOWN) {
                return interaction.reply({ content: "⏳ Vui lòng chờ trước khi tạo ticket mới!", ephemeral: true });
            }
            ticketCooldown.set(interaction.user.id, now);

            await interaction.deferReply({ ephemeral: true });

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
            return interaction.reply({ content: `📌 Thông tin: ${interaction.values[0]}`, ephemeral: true });
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
                content: `✅ Đã gửi!\nStage: **${stage}**\nScore: **${score}**`,
                ephemeral: true
            });
        }
if (interaction.customId.startsWith("bc_bet_")) {
    const userId = interaction.user.id;

    try {
        const choice = interaction.customId.split("_")[2];
        const money = parseInt(interaction.fields.getTextInputValue("money"));

        const animals = ["bau", "cua", "tom", "ca", "ga", "nai"];
        const emojiMap = {
            bau: "🍐",
            cua: "🦀",
            tom: "🦐",
            ca: "🐟",
            ga: "🐔",
            nai: "🦌"
        };

        // ===== VALIDATE =====
        if (isNaN(money) || money <= 0) {
            return interaction.reply({
                content: "❌ Số tiền cược không hợp lệ!",
                ephemeral: true
            });
        }

        const balance = getCoins(userId);
        if (balance < money) {
            return interaction.reply({
                content: `❌ Không đủ coin! (Bạn có: ${balance.toLocaleString()})`,
                ephemeral: true
            });
        }

        // ===== TRỪ TIỀN TRƯỚC =====
        addCoins(userId, -money);

        // ===== DEFER AN TOÀN =====
        await interaction.deferReply();

        await interaction.editReply("🎲 Đang lắc bầu cua...");

        // ===== ANIMATION =====
        for (let i = 0; i < 2; i++) {
            const temp = Array.from({ length: 3 }, () =>
                emojiMap[animals[Math.floor(Math.random() * animals.length)]]
            );

            await interaction.editReply(`🎰 ĐANG LẮC...\n\n${temp.join(" | ")}`);
            await new Promise(r => setTimeout(r, 800));
        }

        // ===== KẾT QUẢ =====
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
            addCoins(userId, winAmount);
        }

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎲 BẦU CUA")
                    .setColor(count > 0 ? "Green" : "Red")
                    .setDescription(
                        `🎲 ${result.map(x => emojiMap[x]).join(" | ")}\n\n` +
                        (count > 0
                            ? `🎉 THẮNG +${winAmount.toLocaleString()}`
                            : `💀 THUA -${money.toLocaleString()}`)
                    )
            ]
        });

    } catch (err) {
        console.error("BẦU CUA ERROR:", err);

        try {
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply("❌ Lỗi bầu cua!");
            } else {
                return interaction.reply({
                    content: "❌ Lỗi bầu cua!",
                    ephemeral: true
                });
            }
        } catch {}
    }
}
if (interaction.customId.startsWith("bet_")) {
        const userId = interaction.user.id;
        const choice = interaction.customId.split("_")[1];
        const money = parseInt(interaction.fields.getTextInputValue("money"));

        // 1. Kiểm tra đầu vào
        if (isNaN(money) || money <= 0) {
            return interaction.reply({ content: "❌ Tiền cược không hợp lệ!", ephemeral: true });
        }

        // 2. Kiểm tra số dư (Đồng bộ ví)
        const currentBalance = getCoins(userId);
        if (currentBalance < money) {
            return interaction.reply({ 
                content: `❌ Không đủ tiền! (Bạn có: ${currentBalance.toLocaleString()} coin)`, 
                ephemeral: true 
            });
        }

        // 3. Xử lý đặt cược
        await interaction.deferReply();

        await interaction.editReply("🎲 Đang lắc xúc xắc...");
        
        setTimeout(async () => {
            try {
                const dice = [
                    Math.floor(Math.random() * 6) + 1,
                    Math.floor(Math.random() * 6) + 1,
                    Math.floor(Math.random() * 6) + 1
                ];
                const total = dice.reduce((a, b) => a + b, 0);
const chance = getWinChance(userId);

// random theo tỷ lệ thắng
const win = Math.random() < chance;

updateStreak(userId, win);

// đảm bảo kết quả theo win/lose
const result = win ? choice : (choice === "tai" ? "xiu" : "tai");
                
                let resultEmbed = new EmbedBuilder()
                    .setTitle("🎲 KẾT QUẢ TÀI XỈU")
                    .setDescription(`Kết quả: **${dice.join(" - ")}** (Tổng: **${total}** => **${result.toUpperCase()}**)`)
                    .setTimestamp();
if (choice === result) {
    const winMoney = Math.floor(money * 1.95); // ✅ sửa ở đây
    addCoins(userId, winMoney);
    resultEmbed.setColor("Green")
        .addFields({ name: "Kết quả", value: `✅ Thắng! Nhận được **+${winMoney.toLocaleString()} coin**` });
} else {
    addCoins(userId, -money);
    resultEmbed.setColor("Red")
        .addFields({ name: "Kết quả", value: `❌ Thua! Bạn đã mất **-${money.toLocaleString()} coin**` });
}

                await interaction.editReply({ content: null, embeds: [resultEmbed] });
            } catch (innerErr) {
                console.error("Lỗi khi trả kết quả Tài Xỉu:", innerErr);
            }
        }, 3000);
        
        return; // Kết thúc xử lý tại đây
    }
}
    } catch (err) {
        console.error("LỖI HỆ THỐNG INTERACTION:", err);

        const errorMsg = { content: "❌ Đã có lỗi xảy ra!", ephemeral: true };
        if (interaction.deferred || interaction.replied) {
            interaction.editReply(errorMsg).catch(() => {});
        } else {
            interaction.reply(errorMsg).catch(() => {});
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
client.login(process.env.TOKEN)
    .then(() => console.log("🔑 LOGIN SUCCESS"))
    .catch(err => console.log("❌ LOGIN FAIL:", err));
