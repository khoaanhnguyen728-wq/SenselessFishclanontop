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

/*=== DATABASE — tất cả khai báo và hàm helper ở đây, TRƯỚC mọi thứ khác ===*/

// ══════════════════════════════════════════════════════════════════
// TÌM THƯ MỤC GHI ĐƯỢC — test write thực sự, không đoán mò
// Ưu tiên: env DATA_DIR → cwd (có data cũ) → __dirname → /tmp
// ══════════════════════════════════════════════════════════════════
function findDataDir() {
    const candidates = [
        process.env.DATA_DIR,          // 1. Cấu hình thủ công qua env (ưu tiên cao nhất)
        process.cwd(),                  // 2. Working dir (nơi file cũ thường nằm)
        __dirname,                      // 3. Cùng thư mục server.js
        path.join(__dirname, "data"),   // 4. Subfolder /data
        "/tmp",                         // 5. Luôn writable trên Linux — last resort
    ].filter(Boolean);

    // Pass 1: tìm thư mục có data CŨ + writable
    for (const dir of candidates) {
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            // Test write thực sự
            const testFile = path.join(dir, ".__write_test__");
            fs.writeFileSync(testFile, "1", "utf8");
            fs.unlinkSync(testFile);
            // Ưu tiên nơi đã có coins.json (data cũ)
            if (fs.existsSync(path.join(dir, "coins.json"))) {
                console.log(`✅ DATA_DIR (có data cũ): ${dir}`);
                return dir;
            }
        } catch(e) {
            console.log(`⚠️ Không ghi được vào: ${dir} — ${e.message}`);
        }
    }
    // Pass 2: lấy thư mục writable đầu tiên
    for (const dir of candidates) {
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const testFile = path.join(dir, ".__write_test__");
            fs.writeFileSync(testFile, "1", "utf8");
            fs.unlinkSync(testFile);
            console.log(`✅ DATA_DIR (writable mới): ${dir}`);
            return dir;
        } catch(_) {}
    }
    console.error("💀 KHÔNG TÌM ĐƯỢC THƯ MỤC GHI ĐƯỢC — dùng cwd và cầu trời!");
    return process.cwd();
}

const DATA_DIR = findDataDir();
console.log("📁 CWD      :", process.cwd());
console.log("📁 __dirname:", __dirname);
console.log("📁 DATA_DIR :", DATA_DIR);

// ══════════════════════════════════════════════════════════════════
// ĐỌC JSON AN TOÀN — fallback .bak nếu file chính lỗi/rỗng
// ══════════════════════════════════════════════════════════════════
function safeReadJSON(filePath, defaultValue) {
    const tryParse = (fp) => {
        try {
            if (!fs.existsSync(fp)) return null;
            const raw = fs.readFileSync(fp, "utf8").trim();
            if (!raw || raw === "null") return null;
            return JSON.parse(raw);
        } catch(e) {
            console.error(`❌ Parse lỗi [${fp}]: ${e.message}`);
            return null;
        }
    };
    const result = tryParse(filePath);
    if (result !== null) { console.log(`  ✅ Đọc OK: ${filePath}`); return result; }
    const bak = filePath + ".bak";
    const bakResult = tryParse(bak);
    if (bakResult !== null) { console.warn(`  ⚠️ Dùng .bak: ${bak}`); return bakResult; }
    console.error(`  ❌ Không đọc được → dùng mặc định: ${filePath}`);
    return defaultValue;
}

// ══════════════════════════════════════════════════════════════════
// GHI FILE AN TOÀN — ghi ra file .tmp trước, rename nguyên tử
// Đảm bảo thư mục tồn tại, verify nội dung sau khi ghi
// ══════════════════════════════════════════════════════════════════
function atomicWrite(filePath, data) {
    // Đảm bảo thư mục tồn tại
    const dir = path.dirname(filePath);
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch(_) {}

    // Backup file cũ
    try {
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, filePath + ".bak");
        }
    } catch(_) {}

    const tmpPath = filePath + ".tmp";
    try {
        const json = JSON.stringify(data, null, 2);
        // Ghi ra .tmp trước (nếu crash ở đây, file gốc vẫn còn)
        fs.writeFileSync(tmpPath, json, "utf8");
        // Verify nội dung .tmp trước khi rename
        const verify = fs.readFileSync(tmpPath, "utf8").trim();
        if (!verify || verify.length < 2) throw new Error("File .tmp bị rỗng sau khi ghi!");
        // Rename nguyên tử — thay thế file cũ bằng file mới một lần
        fs.renameSync(tmpPath, filePath);
        // Double-check: đọc lại file đích
        const final = fs.readFileSync(filePath, "utf8").trim();
        if (!final || final.length < 2) throw new Error("File đích bị rỗng sau rename!");
        console.log(`  💾 Đã ghi: ${path.basename(filePath)} (${final.length} bytes)`);
    } catch(e) {
        console.error(`❌ atomicWrite FAILED [${filePath}]: ${e.message}`);
        // Dọn .tmp nếu còn
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch(_) {}
        // Restore từ .bak nếu file đích bị hỏng
        try {
            if (fs.existsSync(filePath + ".bak")) {
                const bakContent = fs.readFileSync(filePath + ".bak", "utf8").trim();
                if (bakContent && bakContent.length >= 2) {
                    fs.copyFileSync(filePath + ".bak", filePath);
                    console.warn(`  ↩️ Đã restore từ .bak: ${path.basename(filePath)}`);
                }
            }
        } catch(_) {}
    }
}

// ══════════════════════════════════════════════════════════════════
// KHỞI TẠO FILE — chỉ tạo nếu chưa có (KHÔNG ghi đè data cũ!)
// ══════════════════════════════════════════════════════════════════
const DB = {
    coins:     path.join(DATA_DIR, "coins.json"),
    blacklist: path.join(DATA_DIR, "blacklist.json"),
    top:       path.join(DATA_DIR, "top.json"),
    register:  path.join(DATA_DIR, "register.json"),
    staff:     path.join(DATA_DIR, "staff.json"),
    mainers:   path.join(DATA_DIR, "mainers.json"),
    strike:    path.join(DATA_DIR, "strike.json"),
    daily:     path.join(DATA_DIR, "daily.json"),
    giveaways: path.join(DATA_DIR, "giveaways.json"),
};

// Hàm khởi tạo file an toàn — KHÔNG ghi đè nếu đã tồn tại và hợp lệ
function initDBFile(filePath, defaultContent) {
    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, "utf8").trim();
            if (raw && raw.length >= 2 && raw !== "null") {
                JSON.parse(raw); // validate JSON
                console.log(`  📂 DB tồn tại OK: ${path.basename(filePath)} (${raw.length} bytes)`);
                return; // File OK, không làm gì
            }
        } catch(e) {
            console.warn(`  ⚠️ DB corrupt [${path.basename(filePath)}]: ${e.message} → ghi lại default`);
        }
    }
    // File chưa có hoặc bị corrupt → ghi default
    try {
        fs.writeFileSync(filePath, defaultContent, "utf8");
        console.log(`  📝 DB khởi tạo mới: ${path.basename(filePath)}`);
    } catch(e) {
        console.error(`  ❌ Không thể khởi tạo DB [${filePath}]: ${e.message}`);
    }
}

initDBFile(DB.coins,    "{}");
initDBFile(DB.blacklist,"[]");
initDBFile(DB.top,      "{}");
initDBFile(DB.register, "[]");
initDBFile(DB.staff,    "[]");
initDBFile(DB.mainers,  "[]");
initDBFile(DB.strike,   "[]");
initDBFile(DB.daily,    "{}");
initDBFile(DB.giveaways,"[]");

// ══════════════════════════════════════════════════════════════════
// ĐỌC DATA VÀO BỘ NHỚ
// ══════════════════════════════════════════════════════════════════
let coins      = safeReadJSON(DB.coins,    {});
let blacklist  = safeReadJSON(DB.blacklist,[]);
let top        = safeReadJSON(DB.top,      {});
let register   = safeReadJSON(DB.register, []);
let staff      = safeReadJSON(DB.staff,    []);
let mainers    = safeReadJSON(DB.mainers,  []);
let strikes    = safeReadJSON(DB.strike,   []);
let dailyData  = safeReadJSON(DB.daily,    {});
let giveaways  = safeReadJSON(DB.giveaways,[]);

// Đảm bảo đúng kiểu — phòng file bị corrupt
if (!Array.isArray(blacklist)) { console.warn("⚠️ blacklist reset []"); blacklist = []; }
if (!Array.isArray(register))  { console.warn("⚠️ register reset []");  register = []; }
if (!Array.isArray(staff))     { console.warn("⚠️ staff reset []");     staff = []; }
if (!Array.isArray(mainers))   { console.warn("⚠️ mainers reset []");   mainers = []; }
if (!Array.isArray(strikes))   { console.warn("⚠️ strikes reset []");   strikes = []; }
if (typeof coins !== "object" || Array.isArray(coins))         { console.warn("⚠️ coins reset {}");    coins = {}; }
if (typeof top !== "object"   || Array.isArray(top))           { console.warn("⚠️ top reset {}");      top = {}; }
if (typeof dailyData !== "object" || Array.isArray(dailyData)) { console.warn("⚠️ daily reset {}");    dailyData = {}; }

for (let i = 1; i <= 20; i++) { if (!top[i]) top[i] = null; }

// ══════════════════════════════════════════════════════════════════
// SAVE FUNCTIONS
// ══════════════════════════════════════════════════════════════════
const saveCoins     = () => atomicWrite(DB.coins,    coins);
const saveBlacklist = () => atomicWrite(DB.blacklist,blacklist);
const saveTop       = () => atomicWrite(DB.top,      top);
const saveStaff     = () => atomicWrite(DB.staff,    staff);
const saveRegister  = () => atomicWrite(DB.register, register);
const saveMainers   = () => atomicWrite(DB.mainers,  mainers);
const saveStrikes   = () => atomicWrite(DB.strike,   strikes);
const saveDaily     = () => atomicWrite(DB.daily,    dailyData);

// ══════════════════════════════════════════════════════════════════
// STARTUP LOG
// ══════════════════════════════════════════════════════════════════
console.log("━━━━━━━━━━━ DATABASE STARTUP ━━━━━━━━━━━");
console.log(`📊 coins   : ${Object.keys(coins).length} users | tổng ${Object.values(coins).reduce((a,b)=>a+(typeof b==="number"?b:0),0).toLocaleString()} coin`);
console.log(`📊 daily   : ${Object.keys(dailyData).length} users`);
console.log(`📊 staff   : ${staff.length}`);
console.log(`📊 strikes : ${strikes.length}`);
// Test ghi thực tế ngay lúc khởi động — dùng file test riêng, KHÔNG ghi đè data
try {
    const testPath = path.join(DATA_DIR, ".__startup_write_test__");
    fs.writeFileSync(testPath, Date.now().toString(), "utf8");
    fs.unlinkSync(testPath);
    console.log("✅ Write test PASSED — ghi file OK");
} catch(e) {
    console.error("💀 Write test FAILED — KHÔNG THỂ GHI FILE:", e.message);
    console.error("💀 DATA SẼ MẤT KHI RESTART! Kiểm tra quyền thư mục:", DATA_DIR);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// Coin helpers — PHẢI đứng SAU khai báo let coins ở trên
function getCoins(userId) {
    const val = coins[userId];
    return (val === undefined || val === null) ? 0 : val;
}
function addCoins(userId, amount) {
    if (coins[userId] === undefined || coins[userId] === null) coins[userId] = 0;
    coins[userId] += amount;
    if (coins[userId] < 0) coins[userId] = 0;
    saveCoins();
}
function setCoins(userId, amount) {
    coins[userId] = Math.max(0, amount);
    saveCoins();
}
function reloadCoins() {
    const fresh = safeReadJSON(DB.coins, null);
    if (fresh !== null) { coins = fresh; console.log("🔄 Reload coins: " + Object.keys(coins).length + " users"); }
}
function reloadDaily() {
    const fresh = safeReadJSON(DB.daily, null);
    if (fresh !== null) { dailyData = fresh; console.log("🔄 Reload daily: " + Object.keys(dailyData).length + " users"); }
}
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const winStreak = new Map();
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
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
    setTimeout(() => restoreGiveawayTimers(), 3000);
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

/*DATABASE — đã được khai báo ở đầu file*/

const ROLE_MAP = {
    "Founder": process.env.ROLE_FOUNDER,
    "Leader": process.env.ROLE_LEADER,
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

if (!Array.isArray(giveaways)) { console.warn("⚠️ giveaways reset []"); giveaways = []; }
const saveGiveaways = () => {
    if (!Array.isArray(giveaways)) giveaways = [];
    atomicWrite(DB.giveaways, giveaways);
};

// ══ AUTO-SAVE mỗi 60 giây — phòng crash mất data in-memory chưa ghi ══
setInterval(() => {
    try { atomicWrite(DB.coins,    coins);    } catch(_) {}
    try { atomicWrite(DB.daily,    dailyData);} catch(_) {}
    try { atomicWrite(DB.giveaways,giveaways);} catch(_) {}
}, 60_000);

// Khi bot khởi động lại — khôi phục timers cho giveaways chưa hết hạn
function restoreGiveawayTimers() {
    if (!Array.isArray(giveaways)) { giveaways = []; return; }
    const now = Date.now();
    for (const gw of giveaways.filter(g => !g.ended)) {
        const remaining = gw.endsAt - now;
        if (remaining <= 0) {
            endGiveaway(gw.messageId, gw.channelId).catch(console.error);
        } else {
            setTimeout(() => endGiveaway(gw.messageId, gw.channelId).catch(console.error), remaining);
        }
    }
}

async function endGiveaway(messageId, channelId) {
    const gw = giveaways.find(g => g.messageId === messageId && !g.ended);
    if (!gw) return;
    gw.ended = true;
    saveGiveaways();

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;

        const participants = gw.participants || [];
        const winnerCount = gw.winnerCount || 1;

        // Xáo trộn và chọn người thắng
        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(0, Math.min(winnerCount, shuffled.length));

        // ── Embed kết quả đẹp ──
        const endedEmbed = new EmbedBuilder()
            .setTitle("🎊 GIVEAWAY KẾT THÚC!")
            .setColor(winners.length > 0 ? "#FFD700" : "#555555")
            .setDescription(
                `> 🏆 **Giải thưởng:** ${gw.prize}\n` +
                `> 👥 **Tham gia:** ${participants.length} người\n` +
                `> 🎖 **Số người thắng:** ${winnerCount}\n\n` +
                (winners.length > 0
                    ? `🎉 **NGƯỜI THẮNG:**\n${winners.map(id => `> <@${id}>`).join("\n")}`
                    : `> 😢 Không có ai tham gia...`)
            )
            .setFooter({ text: `Tổ chức bởi ${gw.hostedBy} • Đã kết thúc` })
            .setTimestamp();

        // Disable nút tham gia
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("giveaway_ended")
                .setLabel(`🎁 Đã kết thúc • ${participants.length} người tham gia`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        await message.edit({ embeds: [endedEmbed], components: [disabledRow] });

        // Thông báo winner
        if (winners.length > 0) {
            const winnerPing = winners.map(id => `<@${id}>`).join(", ");
            await channel.send({
                content: `🎊 Chúc mừng ${winnerPing}! Bạn đã thắng **${gw.prize}**! 🎉`,
                embeds: [
                    new EmbedBuilder()
                        .setColor("#FFD700")
                        .setTitle("🏆 NGƯỜI CHIẾN THẮNG!")
                        .setDescription(
                            winners.map(id => `🥇 <@${id}>`).join("\n") +
                            `\n\n**Giải thưởng:** ${gw.prize}\n` +
                            `Liên hệ <@${gw.hostId}> để nhận thưởng!`
                        )
                        .setTimestamp()
                ]
            });

            // Thưởng coin nếu prize là số coin
            const coinMatch = gw.prize.match(/(\d+)\s*(coin|🪙)/i);
            if (coinMatch) {
                const coinAmount = parseInt(coinMatch[1]);
                for (const wId of winners) {
                    addCoins(wId, coinAmount);
                }
            }
        }
    } catch (err) {
        console.error("❌ Lỗi kết thúc giveaway:", err);
    }
}

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

            let medal = (i === 1) ? "👑" : (i === 2) ? "🥈" : (i === 3) ? "🥉" : (i <= 10 ? "➤" : "➠");
            let displayName = member?.id ? `<@${member.id}>` : "*Vacant*";

            if (i === 1) displayName = `### ${displayName}`;
            else if (i <= 3) displayName = `**${displayName}**`;

            text += `${medal} \`TOP ${String(i).padStart(2," ")}\` ${displayName}\n`;
        }

        const embed = new EmbedBuilder()
            .setColor("#00eaff")
            .setTitle("🏆 AOV LEADERBOARD — SENSELESSFISH")
            .setDescription(text || "Chưa có dữ liệu")
            .setFooter({ text: "🔄 Cập nhật mỗi 10 giây • SenselessFish Clan" })
            .setTimestamp();

        if (message && typeof message.edit === "function") {
            try {
                await message.edit({ embeds: [embed] });
                return true;
            } catch (editErr) {
                // 50001 = Missing Access, 50005 = Cannot edit a message authored by another user
                // → Reset messageId và tạo mới thay vì crash
                if (editErr?.code === 50001 || editErr?.code === 50005 || editErr?.status === 403) {
                    console.warn("⚠️ Không thể edit AOV message cũ (lỗi quyền) — tạo message mới...");
                    aovMessageId = null;
                    message = null;
                } else {
                    throw editErr; // Lỗi khác thì vẫn ném ra ngoài
                }
            }
        }

        if (!message) {
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
        .setFooter({ text: `Rule ${i + 1} / 7 • Tiệm Cà Phê Capoo` });
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
        .setTitle("🎫 AI SUPPORT — TIỆM CÀ PHÊ CAPOO")
        .setColor("#00eaff")
        .setDescription(
            `## 🤖 Hỗ trợ 24/7\n\n` +
            `> 💬 Đặt câu hỏi cho AI bất kỳ lúc nào\n` +
            `> 🎫 Mỗi ticket là một phòng chat riêng tư\n` +
            `> 🔒 Chỉ bạn mới thấy ticket của mình\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Nhấn **Tạo Ticket** bên dưới để bắt đầu!\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: "SenselessFish Clan • AI Support" })
        .setTimestamp();

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
        // ✅ FIX InteractionNotReplied:
        // 40060 = đã được ack bởi lần gọi trước (duplicate interaction).
        // KHÔNG return im lặng ở đây vì sẽ để editReply chạy tiếp mà interaction
        // chưa deferred trong process này → gây InteractionNotReplied.
        // Thay vào đó throw để outer catch xử lý (bỏ qua im lặng).
        throw err; // Ném tất cả lỗi (10062, 40060, ...) lên outer catch
    }
}

async function safeDeferUpdate(interaction) {
    if (interaction.deferred || interaction.replied) return;
    try {
        await interaction.deferUpdate();
    } catch (err) {
        // ✅ FIX: Throw tất cả lỗi để outer catch xử lý đúng, không return im lặng
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

// ============================================================
// ⏳ COOLDOWN MANAGER — Áp dụng cho TẤT CẢ lệnh & nút
// Chỉnh thời gian (ms) tại đây, không cần sửa chỗ khác!
// ============================================================
const CMD_COOLDOWNS = {
    // ── Slash commands người dùng thường ──────────────────
    "tungdongxu":   8_000,   //  8 giây
    "topcoin":     10_000,   // 10 giây
    "pay":         15_000,   // 15 giây
    "coin":         5_000,   //  5 giây
    "baucua":       5_000,   //  5 giây
    "taixiu":       5_000,   //  5 giây
    "list":        10_000,   // 10 giây
    "bxh":         10_000,   // 10 giây

    "give":         5_000,   //  5 giây

    // ── Slash commands staff / admin (5-15s tránh nhấn 2 lần) ──
    "strike":       5_000,
    "unstrike":     5_000,
    "staffstrike":  5_000,
    "blacklist":    5_000,
    "unblacklist":  5_000,
    "promote":      5_000,
    "demote":       5_000,
    "mainer":       5_000,
    "demainer":     5_000,
    "settop":       5_000,
    "detop":        5_000,
    "thidau":      15_000,

    // ── Buttons ───────────────────────────────────────────
    "tai":          3_000,   //  3 giây
    "xiu":          3_000,
    "tx_":          3_000,   // prefix — tài xỉu nút mới
    "bc_":          3_000,   // prefix — bầu cua chọn linh vật
    "tdx_":         8_000,   // prefix — tung đồng xu bấm nút

    // ── Modals ────────────────────────────────────────────
    "bc_bet_":     10_000,   // prefix — bầu cua nhập tiền
    "txbet_":      10_000,   // prefix — tài xỉu nhập tiền (mới)
    "bet_":        10_000,   // prefix — tài xỉu nhập tiền (cũ)
    "submit_score":30_000,   // 30 giây
    "match_info":   5_000,
    "giveaway":    10_000,   // 10 giây
    "giveaway_join": 2_000, // 2 giây (prefix check đã xử lý)
};

const _cmdCooldownStore = new Map();

/**
 * Kiểm tra cooldown.
 * @returns {number} Số giây còn lại (0 = không bị cooldown)
 */
function checkCooldown(userId, cmdKey) {
    const ms = CMD_COOLDOWNS[cmdKey];
    if (!ms) return 0;
    const storeKey = `${userId}:${cmdKey}`;
    const last = _cmdCooldownStore.get(storeKey) || 0;
    const diff = Date.now() - last;
    if (diff < ms) return Math.ceil((ms - diff) / 1000);
    _cmdCooldownStore.set(storeKey, Date.now());
    return 0;
}

/**
 * Lấy key cooldown từ interaction.
 * Prefix (kết thúc bằng "_") được khớp với startsWith.
 */
function getCooldownKey(interaction) {
    if (interaction.isChatInputCommand()) return interaction.commandName;
    const id = interaction.customId || "";
    // Kiểm tra prefix trước (bc_, cf_, tdx_, bc_bet_, bet_)
    for (const key of Object.keys(CMD_COOLDOWNS)) {
        if (key.endsWith("_") && id.startsWith(key)) return key;
    }
    return id;
}
// ============================================================

const handledInteractions = new Set();
let backupRunning = false; // Lock chống backup chạy 2 lần cùng lúc

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

    // --- ⏳ COOLDOWN CHECK (tập trung) ---
    try {
        const _cdKey = getCooldownKey(interaction);
        const _cdLeft = checkCooldown(interaction.user.id, _cdKey);
        if (_cdLeft > 0) {
            const _cdMsg = { content: `⏳ Đợi thêm **${_cdLeft}s** trước khi dùng lại lệnh này!`, flags: MessageFlags.Ephemeral };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(_cdMsg).catch(() => {});
            } else {
                await interaction.reply(_cdMsg).catch(() => {});
            }
            return;
        }
    } catch (_cdErr) { /* bỏ qua lỗi cooldown không ảnh hưởng flow chính */ }
    // --- END COOLDOWN CHECK ---

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
    // Kiểm tra quyền TRƯỚC khi defer — chỉ ADMIN_ROLE trong .env mới dùng được
    if (!hasPermission(interaction.member)) {
        return await interaction.reply({ content: "❌ Bạn không có quyền dùng lệnh này!", flags: MessageFlags.Ephemeral });
    }

    // Chặn chạy 2 lần cùng lúc (duplicate interaction hoặc user bấm 2 lần)
    if (backupRunning) {
        return await interaction.reply({ content: "⏳ Đang có backup đang chạy, vui lòng chờ!", flags: MessageFlags.Ephemeral });
    }
    backupRunning = true;

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
    const _interaction = interaction; // Giữ ref để editReply cập nhật embed trên server
    // Tạo ID CỐ ĐỊNH ngay đây — truyền vào setImmediate để console và DM dùng cùng 1 ID
    const _backupId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setImmediate(async () => {
        // Gửi kết quả cả lên server (editReply) lẫn DM
        const notify = async (embed) => {
            await _interaction.editReply({ embeds: [embed] }).catch(() => {});
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
        } finally {
            backupRunning = false; // Luôn giải phóng lock dù thành công hay lỗi
        }
    });

    return;
}

// ===== BACKUP LOAD =====
if (subcommand === "load") {
    // Kiểm tra quyền TRƯỚC khi defer — chỉ ADMIN_ROLE trong .env mới dùng được
    if (!hasPermission(interaction.member)) {
        return await interaction.reply({
            content: "❌ Bạn không có quyền dùng lệnh này!",
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
        else if (commandName === "giveaway") {
            const subCmd = options.getSubcommand();

            // Kiểm tra quyền ADMIN
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!hasPermission(member)) {
                return interaction.reply({ content: "❌ Bạn không có quyền tổ chức giveaway!", flags: MessageFlags.Ephemeral });
            }

            // ── /giveaway start ──
            if (subCmd === "start") {
                await safeDeferReply(interaction);

                const prize = options.getString("prize");
                const timeInput = options.getString("time");
                const winnerCount = options.getInteger("winners") || 1;
                const channel = options.getChannel("channel") || interaction.channel;

                // Parse thời gian: 10m, 1h, 2h30m, 1d
                const parseTime = (str) => {
                    let ms = 0;
                    const d = str.match(/(\d+)d/); if (d) ms += parseInt(d[1]) * 86400000;
                    const h = str.match(/(\d+)h/); if (h) ms += parseInt(h[1]) * 3600000;
                    const m = str.match(/(\d+)m/); if (m) ms += parseInt(m[1]) * 60000;
                    const s = str.match(/(\d+)s/); if (s) ms += parseInt(s[1]) * 1000;
                    return ms;
                };

                const duration = parseTime(timeInput);
                if (!duration || duration < 10000) {
                    return interaction.editReply("❌ Thời gian không hợp lệ! Ví dụ: `10m`, `1h`, `2h30m`, `1d`");
                }

                const endsAt = Date.now() + duration;
                const endsAtDate = new Date(endsAt);

                // Format thời gian đếm ngược đẹp
                const formatDuration = (ms) => {
                    const d = Math.floor(ms / 86400000);
                    const h = Math.floor((ms % 86400000) / 3600000);
                    const m = Math.floor((ms % 3600000) / 60000);
                    const s = Math.floor((ms % 60000) / 1000);
                    let out = "";
                    if (d) out += `${d} ngày `;
                    if (h) out += `${h} giờ `;
                    if (m) out += `${m} phút `;
                    if (s && !d) out += `${s} giây`;
                    return out.trim();
                };

                // ── Embed giveaway đẹp ──
                const giveawayEmbed = new EmbedBuilder()
                    .setTitle("🎉 GIVEAWAY 🎉")
                    .setColor("#FF6B9D")
                    .setDescription(
                        `## 🏆 ${prize}\n\n` +
                        `> 🎖 **Số người thắng:** ${winnerCount}\n` +
                        `> ⏰ **Kết thúc:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:F>)\n` +
                        `> ⌛ **Thời gian:** ${formatDuration(duration)}\n` +
                        `> 👤 **Tổ chức:** <@${interaction.user.id}>\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `🎁 **Nhấn nút bên dưới để tham gia!**\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━`
                    )
                    .setThumbnail("https://i.imgur.com/wSTFkRM.png")
                    .setFooter({ text: `Kết thúc lúc` })
                    .setTimestamp(endsAtDate);

                const joinRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("giveaway_join")
                        .setLabel("🎁 Tham gia (0)")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId("giveaway_list")
                        .setLabel("👥 Xem danh sách")
                        .setStyle(ButtonStyle.Secondary)
                );

                const targetChannel = channel.isTextBased() ? channel : interaction.channel;
                const sentMsg = await targetChannel.send({
                    content: "🎉 **GIVEAWAY MỚI!** 🎉",
                    embeds: [giveawayEmbed],
                    components: [joinRow]
                });

                // Lưu giveaway
                const gwData = {
                    messageId: sentMsg.id,
                    channelId: targetChannel.id,
                    prize,
                    winnerCount,
                    endsAt,
                    hostId: interaction.user.id,
                    hostedBy: interaction.user.username,
                    participants: [],
                    ended: false
                };
                giveaways.push(gwData);
                saveGiveaways();

                // Set timer
                setTimeout(() => endGiveaway(sentMsg.id, targetChannel.id).catch(console.error), duration);

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#00ff88")
                            .setTitle("✅ Giveaway đã được tạo!")
                            .setDescription(
                                `**Giải thưởng:** ${prize}\n` +
                                `**Channel:** <#${targetChannel.id}>\n` +
                                `**Kết thúc:** <t:${Math.floor(endsAt / 1000)}:R>`
                            )
                    ]
                });
            }

            // ── /giveaway end ──
            else if (subCmd === "end") {
                await safeDeferReply(interaction);
                const msgId = options.getString("id");
                const gw = giveaways.find(g => g.messageId === msgId && !g.ended);
                if (!gw) return interaction.editReply("❌ Không tìm thấy giveaway hoặc đã kết thúc!");
                await endGiveaway(gw.messageId, gw.channelId);
                return interaction.editReply("✅ Đã kết thúc giveaway!");
            }

            // ── /giveaway reroll ──
            else if (subCmd === "reroll") {
                await safeDeferReply(interaction);
                const msgId = options.getString("id");
                const gw = giveaways.find(g => g.messageId === msgId && g.ended);
                if (!gw) return interaction.editReply("❌ Không tìm thấy giveaway đã kết thúc!");

                const { participants, winnerCount, prize, channelId } = gw;
                if (!participants.length) return interaction.editReply("❌ Không có người tham gia để reroll!");

                const shuffled = [...participants].sort(() => Math.random() - 0.5);
                const newWinners = shuffled.slice(0, Math.min(winnerCount, shuffled.length));

                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (channel) {
                    await channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("#FF6B9D")
                                .setTitle("🔄 GIVEAWAY REROLL!")
                                .setDescription(
                                    `**Người thắng mới:**\n` +
                                    newWinners.map(id => `🥇 <@${id}>`).join("\n") +
                                    `\n\n**Giải thưởng:** ${prize}`
                                )
                                .setTimestamp()
                        ]
                    });
                }

                return interaction.editReply(`✅ Đã reroll! Người thắng mới: ${newWinners.map(id => `<@${id}>`).join(", ")}`);
            }

            // ── /giveaway list ──
            else if (subCmd === "list") {
                await safeDeferReply(interaction);
                const active = giveaways.filter(g => !g.ended);
                if (!active.length) return interaction.editReply("📭 Không có giveaway nào đang diễn ra!");

                const list = active.map((gw, i) =>
                    `**${i+1}.** ${gw.prize}\n` +
                    `> 👥 ${gw.participants.length} người • Kết thúc <t:${Math.floor(gw.endsAt / 1000)}:R>\n` +
                    `> 📌 ID: \`${gw.messageId}\``
                ).join("\n\n");

                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🎉 DANH SÁCH GIVEAWAY ĐANG DIỄN RA")
                            .setDescription(list)
                            .setColor("#FF6B9D")
                            .setFooter({ text: `${active.length} giveaway đang hoạt động` })
                    ]
                });
            }
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

            // KHÔNG trừ tiền ở đây — chỉ trừ khi user thực sự bấm nút chọn mặt (tdx_ handler)
            const embed = new EmbedBuilder()
                .setTitle("🪙 TUNG ĐỒNG XU")
                .setColor("#f1c40f")
                .setDescription(
                    `## 💵 ${money.toLocaleString()} coin\n\n` +
                    `> 🎯 Chọn mặt bạn muốn đặt cược\n` +
                    `> 💰 Thắng nhận **x2** tiền cược\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `🔵 **SẤP** hay 🔴 **NGỬA**?\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                )
                .setFooter({ text: "🪙 Tung Đồng Xu • Tiệm Cà Phê Capoo | Bạn có 30 giây để chọn!" })
                .setTimestamp();

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
                .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                .setDescription(
                    `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                    `> 🔨 **Bởi:** <@${interaction.user.id}>\n` +
                    `> 📌 **Lý do:** ${reason}\n` +
                    `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
                )
                .setFooter({ text: `ID: ${user.id}` })
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
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                        `> 🔨 **Thực hiện bởi:** <@${interaction.user.id}>\n` +
                        `> 📌 **Lý do:** ${reason}\n` +
                        `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
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
                .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                .setDescription(
                    `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                    `> 🔓 **Bởi:** <@${interaction.user.id}>\n` +
                    `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
                )
                .setFooter({ text: `ID: ${user.id}` })
                .setTimestamp();

            const logChannel = interaction.guild.channels.cache.get(process.env.BLACKLIST_LOG_CHANNEL);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle("✅ UNBLACKLIST LOG")
                    .setColor("#00ffcc")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                        `> 🔓 **Thực hiện bởi:** <@${interaction.user.id}>\n` +
                        `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
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
                .setColor("#ff4444")
                .setTitle("🚨 STRIKE MEMBER")
                .setThumbnail(target.displayAvatarURL({ forceStatic: false }))
                .setDescription(
                    `> 👤 **User:** <@${target.id}> \`(${target.username})\`\n` +
                    `> 🛡️ **Staff:** <@${interaction.user.id}>\n` +
                    `> 📌 **Lý do:** ${reason}\n` +
                    `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
                )
                .setImage(proofUrl)
                .setFooter({ text: `⚠️ Strike ${user.strikes.length}/3 • Đủ 3 sẽ bị BAN` })
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
                .setColor("#00cc66")
                .setTitle("✅ GỠ STRIKE THÀNH CÔNG")
                .setThumbnail(target.displayAvatarURL({ forceStatic: false }))
                .setDescription(
                    `> 👤 **User:** <@${target.id}> \`(${target.username})\`\n` +
                    `> 🛡️ **Staff:** <@${interaction.user.id}>\n` +
                    `> 🗑️ **Strike đã gỡ:** ${removed.reason}\n` +
                    `> 📊 **Còn lại:** ${user.strikes.length}/${user.staff ? 4 : 3} strikes`
                )
                .setFooter({ text: `Strike #${strikeIndex + 1} đã được xóa` })
                .setTimestamp();

            sendStrikeLog(client, embed);

            return interaction.editReply(
                `✅ Đã gỡ Strike ${strikeIndex + 1}\n📌 ${removed.reason}\n📉 Còn: ${user.strikes.length}/${user.staff ? 4 : 3}`
            );
        }
// --- LỆNH DAILY ---
else if (commandName === 'daily') {
    // Defer trước — nếu 10062 thì interaction đã hết hạn, return im lặng
    try {
        await safeDeferReply(interaction);
    } catch (deferErr) {
        if (deferErr?.code === 10062) return; // Interaction hết hạn — bỏ qua
        throw deferErr;
    }

    try {
        const userId = interaction.user.id;
        const now = Date.now();
        const oneDay = 86400000;
        const twoDays = 172800000; // 48h — nếu quá 2 ngày thì reset streak

        // Lấy dữ liệu từ file (tồn tại qua restart)
        const userDaily = dailyData[userId] || { lastDaily: 0, streak: 0 };
        const lastDaily = userDaily.lastDaily || 0;

        // Cooldown check
        if (now - lastDaily < oneDay) {
            const remaining = oneDay - (now - lastDaily);
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);

            return interaction.editReply(
                `⏳ Bạn đã nhận quà hôm nay rồi! Quay lại sau **${hours} giờ ${minutes} phút** nữa nhé.`
            ).catch(() => {});
        }

        // Tính streak: nếu bỏ lỡ hơn 2 ngày thì reset về 0
        let streak = userDaily.streak || 0;
        if (lastDaily > 0 && now - lastDaily >= twoDays) {
            streak = 0; // bỏ lỡ ngày → reset
        }

        // Tính reward: lần đầu 500, mỗi streak +15, max 5000
        const reward = Math.min(500 + streak * 15, 5000);

        // Cập nhật streak và lưu vào file NGAY — trước addCoins để tránh mất dữ liệu nếu crash
        streak += 1;
        dailyData[userId] = { lastDaily: now, streak };
        saveDaily();

        addCoins(userId, reward);

        const isMax = reward >= 5000;
        const nextReward = Math.min(500 + streak * 15, 5000);

        const embed = new EmbedBuilder()
            .setTitle(isMax ? "🏆 QUÀ TẶNG HÀNG NGÀY — TỐI ĐA!" : "🎁 QUÀ TẶNG HÀNG NGÀY")
            .setColor(isMax ? "#FFD700" : streak >= 7 ? "#ff6b35" : "#00cc66")
            .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }))
            .setDescription(
                `## 🪙 +${reward.toLocaleString()} coin\n\n` +
                `> 👤 <@${userId}>\n` +
                `> 🔥 **Streak:** ${streak} ngày liên tiếp ${"🌟".repeat(Math.min(streak, 7))}\n` +
                `> 💰 **Số dư:** ${getCoins(userId).toLocaleString()} coin\n` +
                (isMax
                    ? `> 🏆 **Đã đạt mức thưởng tối đa mỗi ngày!**`
                    : `> ⏭️ **Lần sau:** ${nextReward.toLocaleString()} coin`)
            )
            .setFooter({ text: "🎁 Nhận mỗi ngày để tăng streak • Bỏ lỡ 1 ngày sẽ mất streak!" })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});

    } catch (err) {
        console.error("🚨 DAILY ERROR:", err);
        // Chỉ thử editReply — không bao giờ gọi reply() vì đã defer rồi
        interaction.editReply("❌ Có lỗi xảy ra khi xử lý phần thưởng. Vui lòng thử lại!").catch(() => {});
    }
}
    // --- LỆNH TOPCOIN ---
else if (commandName === 'topcoin') {
    try {
        await safeDeferReply(interaction);
    } catch (e) {
        if (e?.code === 10062) return;
        throw e;
    }

    // ✅ FIX: KHÔNG gọi reloadCoins() ở đây.
    // In-memory `coins` luôn là source of truth vì mọi addCoins/setCoins
    // đều ghi file ngay lập tức (synchronous). Nếu gọi reloadCoins() mà
    // file bị rỗng/reset thì sẽ GHI ĐÈ data đúng trong bộ nhớ bằng data rỗng,
    // khiến /daily sau đó chỉ lưu 500 thay vì 100500.

    const entries = Object.entries(coins).filter(([, v]) => typeof v === "number" && v > 0);
    const sorted = entries.sort(([, a], [, b]) => b - a).slice(0, 10);

    const medals = ["🥇", "🥈", "🥉"];
    const list = sorted.length
        ? sorted.map(([id, val], i) => {
            const medal = medals[i] || `**${i + 1}.**`;
            return `${medal} <@${id}> — **${val.toLocaleString()} 🪙**`;
        }).join("\n")
        : "Chưa có dữ liệu";

    const totalCoins = sorted.reduce((a, [, v]) => a + v, 0);

    const embed = new EmbedBuilder()
        .setTitle("🏆 BẢNG XẾP HẠNG COIN")
        .setColor("#f1c40f")
        .setDescription(
            `## 💰 Top 10 giàu nhất\n\n` +
            list +
            `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `> 🌐 **Tổng lưu thông:** ${totalCoins.toLocaleString()} 🪙`
        )
        .setFooter({ text: "Dùng /daily mỗi ngày để leo bảng xếp hạng!" })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] }).catch(() => {});
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

    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("💸 CHUYỂN COIN THÀNH CÔNG")
            .setColor("#00cc88")
            .setDescription(
                `## 🪙 ${amount.toLocaleString()} coin\n\n` +
                `> 📤 **Từ:** <@${userId}>\n` +
                `> 📥 **Đến:** <@${target.id}>\n` +
                `> 💰 **Số dư của bạn:** ${getCoins(userId).toLocaleString()} coin`
            )
            .setFooter({ text: `Giao dịch lúc` })
            .setTimestamp()
        ]
    });
}

    // --- LỆNH GIVE (chỉ GIVECOINS_ID mới dùng được) ---
else if (commandName === 'give') {
    if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

    // Chỉ cho phép user có ID trong env GIVECOINS_ID
    const allowedId = process.env.GIVECOINS_ID;
    if (!allowedId || interaction.user.id !== allowedId) {
        return interaction.editReply({ content: "❌ Bạn không có quyền dùng lệnh này!", flags: MessageFlags.Ephemeral });
    }

    const target = options.getUser('user');
    const amount = options.getInteger('amount');

    if (!target || !amount || amount <= 0) {
        return interaction.editReply("❌ Dữ liệu không hợp lệ!");
    }

    addCoins(target.id, amount);

    const embed = new EmbedBuilder()
        .setTitle("💸 CẤP COIN THÀNH CÔNG")
        .setColor("#00ff88")
        .setThumbnail(target.displayAvatarURL({ forceStatic: false }))
        .setDescription(
            `## 🪙 +${amount.toLocaleString()} coin\n\n` +
            `> 👤 **Nhận:** <@${target.id}> \`(${target.username})\`\n` +
            `> 💰 **Số dư mới:** ${getCoins(target.id).toLocaleString()} coin\n` +
            `> 🔑 **Admin:** <@${interaction.user.id}>`
        )
        .setFooter({ text: "Admin • Give Coin" })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
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
                .setColor("#ff8c00")
                .setTitle("⚠️ STAFF STRIKE")
                .setThumbnail(target.displayAvatarURL({ forceStatic: false }))
                .setDescription(
                    `> 👤 **Staff:** <@${target.id}> \`(${target.username})\`\n` +
                    `> 🛡️ **Bởi:** <@${interaction.user.id}>\n` +
                    `> 📌 **Lý do:** ${reason}\n` +
                    `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
                )
                .setImage(proof?.url || null)
                .setFooter({ text: `⚠️ Strike ${user.strikes.length}/4 • Đủ 4 sẽ bị gỡ role` })
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
            let title = "";
            let color = 0x00eaff;

            if (type === "top") {
                title = "🏆 DANH SÁCH AOV TOP";
                color = 0xFFD700;
                Object.keys(top).forEach(i => {
                    if (top[i]) {
                        const medal = i == 1 ? "👑" : i <= 3 ? "🥈🥉".charAt(i-2) : "➤";
                        text += `${medal} **TOP ${i}** • <@${top[i].id || "0"}> \`${top[i].name}\`\n`;
                    }
                });
            }
            if (type === "staff") {
                title = "👑 DANH SÁCH STAFF";
                color = 0x9b59b6;
                staff.forEach(s => text += `> 👤 **${s.username}** — \`${s.role}\`\n`);
            }
            if (type === "mainers") {
                title = "🔥 DANH SÁCH MAINER";
                color = 0xff6b35;
                mainers.forEach((m, i) => text += `**${i+1}.** 🔥 **${m.name}**\n`);
            }

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(title || `📋 Danh sách ${type}`)
                        .setDescription(text || "Chưa có dữ liệu")
                        .setColor(color)
                        .setFooter({ text: `Tổng: ${text ? text.split("\n").filter(Boolean).length : 0} mục` })
                        .setTimestamp()
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
                    .setTitle("📢 PROMOTE — ROLE UPDATE")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                        `> 🎭 **Role mới:** \`${roleName}\`\n` +
                        `> ✅ **Action:** Promote\n` +
                        `> 🔑 **Bởi:** <@${interaction.user.id}>\n` +
                        `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
                    )
                    .setFooter({ text: `ID: ${user.id}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();
                logChannel.send({ embeds: [embed] });
            }

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor("#00ffcc")
                    .setTitle("✅ PROMOTE THÀNH CÔNG")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `> 👤 **User:** <@${user.id}>\n` +
                        `> 🎭 **Role:** \`${roleName}\`\n` +
                        `> 🔑 **Bởi:** <@${interaction.user.id}>`
                    )
                    .setTimestamp()
                ]
            });
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
                    .setTitle("📢 DEMOTE — ROLE REMOVED")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                        `> ❌ **Action:** Demote — Gỡ toàn bộ role\n` +
                        `> 🔑 **Bởi:** <@${interaction.user.id}>\n` +
                        `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>`
                    )
                    .setFooter({ text: `ID: ${user.id}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();
                logChannel.send({ embeds: [embed] });
            }

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor("#ff4d4d")
                    .setTitle("❌ DEMOTE THÀNH CÔNG")
                    .setThumbnail(user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `> 👤 **User:** <@${user.id}> \`(${user.username})\`\n` +
                        `> ❌ **Đã gỡ toàn bộ role staff\n` +
                        `> 🔑 **Bởi:** <@${interaction.user.id}>`
                    )
                    .setTimestamp()
                ]
            });
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
                .setTitle("⚔️ THÔNG BÁO THI ĐẤU")
                .setColor("#e74c3c")
                .setDescription(
                    `## 🏟️ ${team1} ⚔️ ${team2}\n\n` +
                    `> ⏰ **Thời gian:** ${time}\n` +
                    `> 🏁 **Referee:** ${ref}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Chúc các đội thi đấu công bằng! 🎮\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                )
                .setFooter({ text: "SenselessFish Clan • Tournament" })
                .setTimestamp();

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
            try { await safeDeferReply(interaction); } catch (e) { if (e?.code === 10062) return; throw e; }
            // ✅ FIX: Không gọi reloadCoins() - tránh ghi đè in-memory bằng file rỗng
            const userId = interaction.user.id;
            const balance = getCoins(userId);
            const embed = new EmbedBuilder()
                .setTitle("💰 SỐ DƯ TÀI KHOẢN")
                .setColor("#f1c40f")
                .setDescription(
                    `## 🪙 ${balance.toLocaleString()} coin\n\n` +
                    `> 👤 <@${userId}>\n` +
                    `> 💵 Số dư hiện tại của bạn`
                )
                .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }))
                .setFooter({ text: "Dùng /daily để nhận coin miễn phí mỗi ngày!" })
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] }).catch(() => {});
        }

else if (commandName === "baucua") {
    await safeDeferReply(interaction);

    const embed = new EmbedBuilder()
        .setTitle("🎲 BẦU CUA TÔM CÁ")
        .setColor("#e67e22")
        .setDescription(
            `## 🫙 Lắc Bát!\n\n` +
            `> 🍐 **BẦU** • 🦀 **CUA** • 🦐 **TÔM**\n` +
            `> 🐟 **CÁ** • 🐔 **GÀ** • 🦌 **NAI**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Chọn linh vật để đặt cược!\n` +
            `🎯 Trúng **x2** • x2 **x3** • x3 **x5 JACKPOT!**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: "🎲 Bầu Cua Tôm Cá • Tiệm Cà Phê Capoo" })
        .setTimestamp();

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

            // ── Payouts cho từng ô số ──────────────────────────
            // Số 3 và 18 (triple only): x150 | 4/17: x60 | 5/16: x30 | 6/15: x18
            // 7/14: x12 | 8/13: x8 | 9/10/11/12: x6

            const txEmbed = new EmbedBuilder()
                .setTitle("🎲 TÀI XỈU")
                .setColor("#1a1a2e")
                .setDescription(
                    "```\n" +
                    "  🎰  CHỌN Ô CƯỢC CỦA BẠN  🎰\n" +
                    "```\n" +
                    "> 🔥 **Tài (11-18)** / ❄️ **Xỉu (3-10)** → x**1.95**\n" +
                    "> 🟡 **Chẵn** / 🟣 **Lẻ** → x**1.95**\n" +
                    "> 🎯 **Số lẻ 3/18** → x**150** | **4/17** → x**60**\n" +
                    "> 🎯 **5/16** → x**30** | **6/15** → x**18** | **7/14** → x**12**\n" +
                    "> 🎯 **8/13** → x**8** | **9–12** → x**6**"
                )
                .setFooter({ text: "🎲 Tài Xỉu • Tiệm Cà Phê Capoo" })
                .setTimestamp();

            // Row 1: Xỉu | Tài | Chẵn | Lẻ
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("tx_xiu").setLabel("❄️ Xỉu (3-10)").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("tx_tai").setLabel("🔥 Tài (11-18)").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("tx_chan").setLabel("🟡 Chẵn").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("tx_le").setLabel("🟣 Lẻ").setStyle(ButtonStyle.Danger)
            );
            // Row 2: Số 3 → 7
            const row2 = new ActionRowBuilder().addComponents(
                ...[3,4,5,6,7].map(n =>
                    new ButtonBuilder().setCustomId(`tx_so_${n}`).setLabel(`Số ${n}`).setStyle(ButtonStyle.Primary)
                )
            );
            // Row 3: Số 8 → 12
            const row3 = new ActionRowBuilder().addComponents(
                ...[8,9,10,11,12].map(n =>
                    new ButtonBuilder().setCustomId(`tx_so_${n}`).setLabel(`Số ${n}`).setStyle(ButtonStyle.Primary)
                )
            );
            // Row 4: Số 13 → 17
            const row4 = new ActionRowBuilder().addComponents(
                ...[13,14,15,16,17].map(n =>
                    new ButtonBuilder().setCustomId(`tx_so_${n}`).setLabel(`Số ${n}`).setStyle(ButtonStyle.Primary)
                )
            );
            // Row 5: Số 18
            const row5 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("tx_so_18").setLabel("Số 18").setStyle(ButtonStyle.Primary)
            );

            return interaction.editReply({ embeds: [txEmbed], components: [row1, row2, row3, row4, row5] });
        }

    }

    // ===== BUTTON INTERACTIONS =====
    else if (interaction.isButton()) {

    // ── Nút tham gia giveaway ──
    if (interaction.customId === "giveaway_join") {
        const msgId = interaction.message.id;
        const gw = giveaways.find(g => g.messageId === msgId && !g.ended);

        if (!gw) {
            return interaction.reply({ content: "❌ Giveaway này đã kết thúc!", flags: MessageFlags.Ephemeral });
        }

        const userId = interaction.user.id;
        const alreadyJoined = gw.participants.includes(userId);

        if (alreadyJoined) {
            // Rời giveaway
            gw.participants = gw.participants.filter(id => id !== userId);
            saveGiveaways();

            // Cập nhật nút
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("giveaway_join")
                    .setLabel(`🎁 Tham gia (${gw.participants.length})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("giveaway_list")
                    .setLabel("👥 Xem danh sách")
                    .setStyle(ButtonStyle.Secondary)
            );
            await interaction.update({ components: [updatedRow] });

            await interaction.followUp({
                content: "😢 Bạn đã **rời** khỏi giveaway!",
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return;
        } else {
            // Tham gia giveaway
            gw.participants.push(userId);
            saveGiveaways();

            // Cập nhật nút
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("giveaway_join")
                    .setLabel(`🎁 Tham gia (${gw.participants.length})`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("giveaway_list")
                    .setLabel("👥 Xem danh sách")
                    .setStyle(ButtonStyle.Secondary)
            );
            await interaction.update({ components: [updatedRow] });

            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#00ff88")
                        .setDescription(
                            `🎉 **Bạn đã tham gia giveaway!**\n\n` +
                            `🏆 **Giải thưởng:** ${gw.prize}\n` +
                            `👥 **Tổng tham gia:** ${gw.participants.length} người\n` +
                            `⏰ **Kết thúc:** <t:${Math.floor(gw.endsAt / 1000)}:R>\n\n` +
                            `_Nhấn nút lại để rời giveaway_`
                        )
                ],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return;
        }
    }

    // ── Nút xem danh sách giveaway ──
    if (interaction.customId === "giveaway_list") {
        const msgId = interaction.message.id;
        const gw = giveaways.find(g => g.messageId === msgId);
        if (!gw) return interaction.reply({ content: "❌ Không tìm thấy dữ liệu!", flags: MessageFlags.Ephemeral });

        const list = gw.participants.length
            ? gw.participants.slice(0, 30).map((id, i) => `${i+1}. <@${id}>`).join("\n") +
              (gw.participants.length > 30 ? `\n... và ${gw.participants.length - 30} người nữa` : "")
            : "Chưa có ai tham gia";

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`👥 Danh sách tham gia — ${gw.prize}`)
                    .setDescription(list)
                    .setColor("#FF6B9D")
                    .setFooter({ text: `${gw.participants.length} người tham gia` })
            ],
            flags: MessageFlags.Ephemeral
        });
    }

if (interaction.customId.startsWith("tdx_")) {
    const parts = interaction.customId.split("_");
    const userChoice = parts[1]; // "sap" hoặc "ngua"
    const betAmount = parseInt(parts[2]);
    const userId = interaction.user.id;

    await safeDeferUpdate(interaction);

    // Kiểm tra và trừ tiền tại đây (slash command không trừ nữa)
    const currentBal = getCoins(userId);
    if (currentBal < betAmount) {
        return interaction.editReply({
            content: `❌ Không đủ coin! Số dư hiện tại: **${currentBal.toLocaleString()} 🪙**`,
            embeds: [],
            components: []
        });
    }
    addCoins(userId, -betAmount);

    // 🪙 Animation tung đồng xu — 5 frames
    const coinFrames = [
        { coin: "🪙", status: "Tung lên..." },
        { coin: "✨", status: "Đang xoay..." },
        { coin: "🌀", status: "Đang bay..." },
        { coin: "💫", status: "Sắp rơi xuống..." },
        { coin: "🪙", status: "Đang hạ xuống..." },
    ];

    const choiceLabel = userChoice === "sap" ? "SẤP" : "NGỬA";

    for (const frame of coinFrames) {
        await interaction.editReply({
            content: null,
            embeds: [
                new EmbedBuilder()
                    .setTitle("🪙 TUNG ĐỒNG XU")
                    .setColor("#f1c40f")
                    .setDescription(
                        `## ${frame.coin}\n\n` +
                        `\`\`\`\n${frame.status}\n\`\`\`` +
                        `\n🎯 **Bạn chọn:** ${choiceLabel} — **${betAmount.toLocaleString()} 🪙**`
                    )
            ],
            components: []
        });
        await new Promise(r => setTimeout(r, 600));
    }

    // Kết quả
    const result = Math.random() < 0.5 ? "sap" : "ngua";
    const resultText = result === "sap" ? "SẤP 🔵" : "NGỬA 🔴";
    const win = userChoice === result;

    if (win) {
        const winMoney = Math.floor(betAmount * 2);
        addCoins(userId, winMoney);

        await interaction.editReply({
            content: null,
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎉 THẮNG RỒI!")
                    .setColor("#00ff88")
                    .setDescription(
                        `## ${result === "sap" ? "🔵" : "🔴"} ${resultText}\n\n` +
                        `🎯 **Bạn chọn:** ${choiceLabel} ✅\n\n` +
                        `> 🎊 **THẮNG** **+${winMoney.toLocaleString()} 🪙** (x2)\n\n` +
                        `💰 Số dư: **${getCoins(userId).toLocaleString()} 🪙**`
                    )
                    .setFooter({ text: "🪙 Tung Đồng Xu • Tiệm Cà Phê Capoo" })
                    .setTimestamp()
            ],
            components: []
        });
    } else {
        await interaction.editReply({
            content: null,
            embeds: [
                new EmbedBuilder()
                    .setTitle("💀 THUA MẤT!")
                    .setColor("#ff3333")
                    .setDescription(
                        `## ${result === "sap" ? "🔵" : "🔴"} ${resultText}\n\n` +
                        `🎯 **Bạn chọn:** ${choiceLabel} ❌\n\n` +
                        `> 😢 **THUA** **-${betAmount.toLocaleString()} 🪙**\n\n` +
                        `💰 Số dư: **${getCoins(userId).toLocaleString()} 🪙**`
                    )
                    .setFooter({ text: "🪙 Tung Đồng Xu • Tiệm Cà Phê Capoo" })
                    .setTimestamp()
            ],
            components: []
        });
    }
    return;
}

        // ── Tài Xỉu: nút chọn ô cược → mở modal nhập tiền ──
        if (interaction.customId.startsWith("tx_")) {
            const choice = interaction.customId.slice(3); // "tai", "xiu", "chan", "le", "so_3"...
            const labelMap = {
                tai: "🔥 Tài (11-18)",
                xiu: "❄️ Xỉu (3-10)",
                chan: "🟡 Chẵn",
                le: "🟣 Lẻ",
            };
            let label = labelMap[choice];
            if (!label && choice.startsWith("so_")) {
                label = `🎯 Số ${choice.split("_")[1]}`;
            }
            const modal = new ModalBuilder()
                .setCustomId(`txbet_${choice}`)
                .setTitle(`Cược: ${label}`);

            const input = new TextInputBuilder()
                .setCustomId("money")
                .setLabel("Số tiền cược (coin)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Ví dụ: 500")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // ── Nút tai/xiu cũ (backwards compat) ──
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

        // ── Bầu cua: chọn linh vật → mở modal nhập tiền ──
        if (interaction.customId.startsWith("bc_") && !interaction.customId.startsWith("bc_bet_")) {
            const validAnimals = ["bc_bau", "bc_cua", "bc_tom", "bc_ca", "bc_ga", "bc_nai"];
            if (validAnimals.includes(interaction.customId)) {
                const choice = interaction.customId.split("_")[1];
                const modal = new ModalBuilder()
                    .setCustomId(`bc_bet_${choice}`)
                    .setTitle("Nhập tiền cược Bầu Cua");

                const input = new TextInputBuilder()
                    .setCustomId("money")
                    .setLabel("Số tiền cược")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("Ví dụ: 100")
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
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
                    .setColor("#00eaff")
                    .setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }))
                    .setDescription(
                        `## 👋 Xin chào <@${interaction.user.id}>!\n\n` +
                        `> 🤖 **AI hỗ trợ** sẵn sàng giúp bạn\n` +
                        `> 💬 Nhắn tin bất cứ điều gì bạn cần\n` +
                        `> 🔒 Nhấn nút bên dưới để đóng ticket\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `_Ticket này chỉ bạn và staff có thể xem_\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━`
                    )
                    .setFooter({ text: `Ticket của ${interaction.user.username} • SenselessFish` })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("close_ticket")
                        .setLabel("🔒 Đóng Ticket")
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({ embeds: [embed], components: [row] });
                return interaction.editReply({ content: `✅ Ticket đã tạo: ${ticketChannel}` });

            } catch (err) {
                console.error(err);
                return interaction.editReply("❌ Lỗi tạo ticket");
            }
        }
    }

    // ===== SELECT MENU INTERACTIONS =====
    else if (interaction.isStringSelectMenu()) {

        if (interaction.customId === "match_info") {
            // ✅ FIX: Dùng safeDeferReply thay vì raw deferReply().catch() để xử lý đúng 40060/10062
            try { await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral }); } catch { return; }
            return interaction.editReply({ content: `📌 Thông tin: ${interaction.values[0]}` }).catch(() => {});
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
if (interaction.customId.startsWith("txbet_")) {
    try {
        const userId = interaction.user.id;
        const choice = interaction.customId.slice(6); // "tai","xiu","chan","le","so_3"...

        if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

        const money = parseInt(interaction.fields.getTextInputValue("money"));
        if (isNaN(money) || money <= 0) {
            return interaction.editReply({ content: "❌ Tiền cược không hợp lệ!" });
        }

        const currentBalance = getCoins(userId);
        if (currentBalance < money) {
            return interaction.editReply({
                content: `❌ Không đủ coin! Bạn có: **${currentBalance.toLocaleString()} 🪙**`
            });
        }

        addCoins(userId, -money);

        // ── Payout table ──
        const payoutMap = {
            3: 150, 4: 60, 5: 30, 6: 18, 7: 12, 8: 8,
            9: 6, 10: 6, 11: 6, 12: 6,
            13: 8, 14: 12, 15: 18, 16: 30, 17: 60, 18: 150
        };

        const labelMap = {
            tai: "🔥 Tài (11-18)", xiu: "❄️ Xỉu (3-10)",
            chan: "🟡 Chẵn", le: "🟣 Lẻ"
        };
        let choiceLabel = labelMap[choice];
        let targetNum = null;
        if (choice.startsWith("so_")) {
            targetNum = parseInt(choice.split("_")[1]);
            choiceLabel = `🎯 Số ${targetNum}`;
        }

        const diceEmojiMap = { 1:"⚀", 2:"⚁", 3:"⚂", 4:"⚃", 5:"⚄", 6:"⚅" };

        // 🎲 Animation lắc xúc xắc
        const animFrames = [
            "┃ 🎲  Đang lắc...  🎲 ┃",
            "┃ 🎰  Đang lắc...  🎰 ┃",
            "┃ 🎲  Sắp ra...   🎲 ┃",
            "┃ 🎰  Kết quả!    🎰 ┃",
        ];
        const bars = ["⬛⬛⬛⬛⬛⬛⬛⬛", "🟥⬛⬛⬛⬛⬛⬛⬛", "🟥🟧⬛⬛⬛⬛⬛⬛", "🟥🟧🟨🟩⬛⬛⬛⬛",
                      "🟥🟧🟨🟩🟦⬛⬛⬛", "🟥🟧🟨🟩🟦🟣⬛⬛", "🟥🟧🟨🟩🟦🟣🟤⬛", "🟥🟧🟨🟩🟦🟣🟤⬜"];
        const getRandomDice = () => {
            const d = [Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1, Math.floor(Math.random()*6)+1];
            return d.map(x => diceEmojiMap[x]).join("  +  ");
        };

        for (let i = 0; i < 4; i++) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🎲 TÀI XỈU — Đang Lắc...")
                        .setColor(i % 2 === 0 ? "#ff6b35" : "#0099ff")
                        .setDescription(
                            `\`\`\`\n${animFrames[i]}\n\`\`\`\n` +
                            `## ${getRandomDice()}\n\n` +
                            `${bars[i * 2]}\n\n` +
                            `🎯 **Ô cược:** ${choiceLabel}\n` +
                            `💵 **Tiền cược:** ${money.toLocaleString()} 🪙`
                        )
                ]
            });
            await new Promise(r => setTimeout(r, 700));
        }

        // ── Tung xúc xắc thật ──
        const dice = [
            Math.floor(Math.random()*6)+1,
            Math.floor(Math.random()*6)+1,
            Math.floor(Math.random()*6)+1
        ];
        const total = dice.reduce((a,b) => a+b, 0);
        const diceDisplay = dice.map(d => diceEmojiMap[d]).join("  +  ");

        // Kiểm tra thắng
        let actualWin = false;
        let payout = 0;
        if (choice === "tai")  { actualWin = total >= 11; payout = Math.floor(money * 1.95); }
        else if (choice === "xiu") { actualWin = total <= 10; payout = Math.floor(money * 1.95); }
        else if (choice === "chan") { actualWin = total % 2 === 0; payout = Math.floor(money * 1.95); }
        else if (choice === "le")  { actualWin = total % 2 !== 0; payout = Math.floor(money * 1.95); }
        else if (targetNum !== null) {
            actualWin = total === targetNum;
            payout = money * (payoutMap[targetNum] || 6);
        }

        if (actualWin) addCoins(userId, money + payout);

        const totalLabel = total >= 11
            ? `**TÀI 🔥** (${total})`
            : `**XỈU ❄️** (${total})`;
        const parityLabel = total % 2 === 0 ? "**CHẴN 🟡**" : "**LẺ 🟣**";

        const resultEmbed = new EmbedBuilder()
            .setTitle(actualWin ? "🎉 THẮNG RỒI!" : "💀 THUA MẤT!")
            .setColor(actualWin ? "#00ff88" : "#ff3333")
            .setDescription(
                `## ${diceDisplay}\n\n` +
                `🎲 **Tổng:** ${total} → ${totalLabel} | ${parityLabel}\n\n` +
                `🎯 **Ô cược:** ${choiceLabel}\n\n` +
                (actualWin
                    ? `> 🎊 **THẮNG** **+${payout.toLocaleString()} 🪙** (x${
                        choice==="tai"||choice==="xiu"||choice==="chan"||choice==="le"
                          ? "1.95" : payoutMap[targetNum]
                      })`
                    : `> 😢 **THUA** **-${money.toLocaleString()} 🪙**`) +
                `\n\n💰 **Số dư:** ${getCoins(userId).toLocaleString()} 🪙`
            )
            .setFooter({ text: "🎲 Tài Xỉu • Tiệm Cà Phê Capoo" })
            .setTimestamp();

        // Nút chơi lại
        const replayRow1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("tx_xiu").setLabel("❄️ Xỉu").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("tx_tai").setLabel("🔥 Tài").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("tx_chan").setLabel("🟡 Chẵn").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("tx_le").setLabel("🟣 Lẻ").setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ content: null, embeds: [resultEmbed], components: [replayRow1] });

    } catch (err) {
        console.error("🚨 TXBET_ MODAL ERROR:", err);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: "❌ Có lỗi xảy ra! Vui lòng thử lại." }).catch(() => {});
        }
        return interaction.reply({ content: "❌ Có lỗi xảy ra! Vui lòng thử lại.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
}
if (interaction.customId.startsWith("bc_bet_")) {
    const userId = interaction.user.id;

    try {
        // Defer NGAY LẬP TỨC trước mọi xử lý — tránh 10062 nếu logic chậm
        if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

        const choice = interaction.customId.split("_")[2];
        const moneyInput = interaction.fields.getTextInputValue("money");
        const money = parseInt(moneyInput);

        const animals = ["bau", "cua", "tom", "ca", "ga", "nai"];
        const emojiMap = {
            bau: "🍐", cua: "🦀", tom: "🦐", ca: "🐟", ga: "🐔", nai: "🦌"
        };
        const nameMap = {
            bau: "BẦU", cua: "CUA", tom: "TÔM", ca: "CÁ", ga: "GÀ", nai: "NAI"
        };

        if (isNaN(money) || money <= 0) {
            return interaction.editReply({ content: "❌ Số tiền cược không hợp lệ!" });
        }

        const balance = getCoins(userId);
        if (balance < money) {
            return interaction.editReply({
                content: `❌ Không đủ coin! Số dư: **${balance.toLocaleString()} 🪙**`
            });
        }

        addCoins(userId, -money);

        // 🎲 Animation lắc bát — 5 frames
        const frames = [
            { title: "🎲 Bầu Cua Tôm Cá", desc: "```\n🫙  Đang lắc bát...  🫙\n```\n⬛⬛⬛⬛⬛" },
            { title: "🎲 Bầu Cua Tôm Cá", desc: "```\n🫙  Đang lắc bát...  🫙\n```\n🟨⬛⬛⬛⬛" },
            { title: "🎲 Bầu Cua Tôm Cá", desc: "```\n🫙  Đang lắc bát...  🫙\n```\n🟨🟨⬛⬛⬛" },
            { title: "🎲 Bầu Cua Tôm Cá", desc: "```\n🎭  Sắp mở bát...  🎭\n```\n🟨🟨🟨⬛⬛" },
            { title: "🎲 Bầu Cua Tôm Cá", desc: "```\n🎭  Mở bát ra...  🎭\n```\n🟨🟨🟨🟨⬛" },
            { title: "🎲 Bầu Cua Tôm Cá", desc: "```\n✨  Kết quả!  ✨\n```\n🟨🟨🟨🟨🟨" },
        ];

        for (const frame of frames) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(frame.title)
                        .setColor("#f1c40f")
                        .setDescription(frame.desc + `\n\n🎯 Bạn cược: **${emojiMap[choice]} ${nameMap[choice]}** — **${money.toLocaleString()} 🪙**`)
                ]
            });
            await new Promise(r => setTimeout(r, 600));
        }

        // Kết quả
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

        if (count > 0) addCoins(userId, winAmount);

        const resultDisplay = result.map(x => `${emojiMap[x]}`).join("  ╋  ");

        const resultEmbed = new EmbedBuilder()
            .setTitle(count > 0 ? "🎉 THẮNG RỒI!" : "💀 THUA MẤT!")
            .setColor(count > 0 ? "#00ff88" : "#ff3333")
            .setDescription(
                `## ${resultDisplay}\n\n` +
                `🎯 **Bạn chọn:** ${emojiMap[choice]} **${nameMap[choice]}** (x${count})\n\n` +
                (count > 0
                    ? `> 🎊 **THẮNG** **+${winAmount.toLocaleString()} 🪙**\n> (${count === 1 ? "x2" : count === 2 ? "x3" : "x5 JACKPOT!"})`
                    : `> 😢 **THUA** **-${money.toLocaleString()} 🪙**`) +
                `\n\n💰 Số dư: **${getCoins(userId).toLocaleString()} 🪙**`
            )
            .setFooter({ text: `🎲 Bầu Cua Tôm Cá • Tiệm Cà Phê Capoo` })
            .setTimestamp();

        // Nút chơi lại
        const playAgainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("bc_" + choice)
                .setLabel("🎲 Cược lại " + emojiMap[choice])
                .setStyle(count > 0 ? ButtonStyle.Success : ButtonStyle.Danger)
        );

        return interaction.editReply({ content: null, embeds: [resultEmbed], components: [playAgainRow] });

    } catch (err) {
        console.error("❌ LỖI BẦU CUA:", err);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: "❌ Đã xảy ra lỗi hệ thống!" });
        } else {
            return interaction.reply({ content: "❌ Lỗi khởi tạo trò chơi!", flags: MessageFlags.Ephemeral });
        }
    }
}
if (interaction.customId.startsWith("bet_")) {
    try {
        const userId = interaction.user.id;
        const choice = interaction.customId.split("_")[1]; // "tai" hoặc "xiu"

        // Defer NGAY LẬP TỨC trước mọi xử lý — tránh 10062 nếu logic chậm
        if (!interaction.deferred && !interaction.replied) await safeDeferReply(interaction);

        const money = parseInt(interaction.fields.getTextInputValue("money"));

        if (isNaN(money) || money <= 0) {
            return interaction.editReply({ content: "❌ Tiền cược không hợp lệ!" });
        }

        const currentBalance = getCoins(userId);
        if (currentBalance < money) {
            return interaction.editReply({
                content: `❌ Không đủ tiền! Bạn có: **${currentBalance.toLocaleString()} 🪙**`
            });
        }

        addCoins(userId, -money);

        // 🎲 Animation xúc xắc — lắc từng frame
        const diceFrames = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
        const randomDice = () => diceFrames[Math.floor(Math.random() * 6)];

        const shakeFrames = [
            `${randomDice()} ${randomDice()} ${randomDice()}`,
            `${randomDice()} ${randomDice()} ${randomDice()}`,
            `${randomDice()} ${randomDice()} ${randomDice()}`,
            `${randomDice()} ${randomDice()} ${randomDice()}`,
        ];

        const choiceLabel = choice === "tai" ? "🔥 TÀI" : "❄️ XỈU";

        for (let i = 0; i < shakeFrames.length; i++) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🎲 TÀI XỈU")
                        .setColor(choice === "tai" ? "#ff4500" : "#00b4ff")
                        .setDescription(
                            `## ${shakeFrames[i]}\n\n` +
                            `\`\`\`\n🎯 Đang lắc xúc xắc... (${i+1}/4)\n\`\`\`` +
                            `\n💵 Cược: **${choiceLabel}** — **${money.toLocaleString()} 🪙**`
                        )
                ]
            });
            await new Promise(r => setTimeout(r, 700));
        }

        // Tung xúc xắc thật
        const dice = [
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1
        ];
        const total = dice.reduce((a, b) => a + b, 0);
        const diceEmojiMap = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" };
        const diceDisplay = dice.map(d => diceEmojiMap[d]).join("  +  ");

        const chance = getWinChance(userId);
        const win = Math.random() < chance;
        updateStreak(userId, win);

        const totalLabel = total >= 11 ? "TÀI 🔥" : "XỈU ❄️";
        const userWon = (choice === "tai" && total >= 11) || (choice === "xiu" && total < 11);
        // Dùng kết quả thực tế (không dùng "win" giả — chỉ dùng win để bonus)
        const actualWin = userWon;

        let winMoney = 0;
        if (actualWin) {
            winMoney = Math.floor(money * 1.95);
            addCoins(userId, money + winMoney);
        }

        const resultEmbed = new EmbedBuilder()
            .setTitle(actualWin ? "🎉 THẮNG RỒI!" : "💀 THUA MẤT!")
            .setColor(actualWin ? "#00ff88" : "#ff3333")
            .setDescription(
                `## ${diceDisplay}\n\n` +
                `🎲 **Tổng điểm:** ${total} → **${totalLabel}**\n\n` +
                `🎯 **Bạn chọn:** ${choiceLabel}\n\n` +
                (actualWin
                    ? `> 🎊 **THẮNG** **+${winMoney.toLocaleString()} 🪙** (x1.95)`
                    : `> 😢 **THUA** **-${money.toLocaleString()} 🪙**`) +
                `\n\n💰 Số dư: **${getCoins(userId).toLocaleString()} 🪙**`
            )
            .setFooter({ text: "🎲 Tài Xỉu • Tiệm Cà Phê Capoo" })
            .setTimestamp();

        // Nút chơi lại
        const replayRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("tai")
                .setLabel("🔥 TÀI")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("xiu")
                .setLabel("❄️ XỈU")
                .setStyle(ButtonStyle.Primary)
        );

        return interaction.editReply({ content: null, embeds: [resultEmbed], components: [replayRow] });

    } catch (err) {
        console.error("🚨 BET_ MODAL ERROR:", err);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: "❌ Có lỗi xảy ra! Vui lòng thử lại." }).catch(() => {});
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
            return; // duplicate interaction — bỏ qua im lặng
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

        // Thứ tự ưu tiên: role cao nhất được chọn khi member có nhiều role
        const ROLE_PRIORITY = [
            "Founder", "Leader", "Senior Developer", "Admin",
            "Developer", "Junior Developer", "Mod",
            "Rank Management", "Experienced Referee", "Referee",
            "Tryout host", "Training host"
        ];

        const staffMembers = guild.members.cache
            .filter(member => member.roles.cache.some(role => roleIds.includes(role.id)))
            .map(member => {
                // Tìm role ưu tiên cao nhất mà member đang có
                const memberRole = ROLE_PRIORITY.find(r => ROLE_MAP[r] && member.roles.cache.has(ROLE_MAP[r]));
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
            .setTitle("📝 ĐĂNG KÝ THI ĐẤU MỚI")
            .setColor("#00eaff")
            .setDescription(
                `> 🎮 **Discord:** \`${discord}\`\n` +
                `> 🕹️ **Roblox:** \`${robloxUsername || "N/A"}\`\n` +
                `> 🕐 **Thời gian:** <t:${Math.floor(Date.now()/1000)}:F>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Vui lòng chọn **Stage** bên dưới để tiếp tục!\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setFooter({ text: "SenselessFish Clan • Đăng ký thi đấu" })
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

// ✅ FIX: Kiểm tra TOKEN trước khi thử login
if (!process.env.TOKEN) {
    console.error("💀 LỖI: Biến môi trường TOKEN chưa được set trong .env! Thoát.");
    process.exit(1);
}

console.log("👉 ĐANG LOGIN DISCORD...");

async function loginWithRetry(retries = 5, delay = 5000) {
    for (let i = 1; i <= retries; i++) {
        try {
            console.log(`🔄 Thử login lần ${i}/${retries}...`);
            // ✅ FIX: Thêm timeout 30s — tránh treo vô thời hạn nếu mạng/Discord chậm
            await Promise.race([
                client.login(process.env.TOKEN),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("LOGIN TIMEOUT (30s) — Kiểm tra mạng hoặc token")), 30000)
                )
            ]);
            console.log("✅ LOGIN DISCORD THÀNH CÔNG!");
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
