require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [

  new SlashCommandBuilder()
    .setName("taixiu")
    .setDescription("Chơi tài xỉu")
    .addStringOption(o =>
  o.setName("choice")
    .setDescription("Chọn tài hoặc xỉu")
    .setRequired(true)
    .addChoices(
      { name: "Tài", value: "tai" },
      { name: "Xỉu", value: "xiu" }
    )
)
    .addIntegerOption(o =>
      o.setName("bet")
        .setDescription("Số coin cược")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("coin")
    .setDescription("Xem coin của bạn"),

new SlashCommandBuilder()
.setName("unstrike")
.setDescription("Gỡ strike")
.addUserOption(o =>
o.setName("user").setDescription("User").setRequired(true)
)
.addIntegerOption(o =>
  o.setName("strike")
    .setDescription("Chọn strike cần gỡ")
    .setRequired(true)
    .addChoices(
      { name: "Strike 1", value: 1 },
      { name: "Strike 2", value: 2 },
      { name: "Strike 3", value: 3 },
      { name: "Strike 4", value: 4 }
    )
),

new SlashCommandBuilder()
.setName("strike")
.setDescription("Strike member")
.addUserOption(o =>
  o.setName("user").setDescription("User").setRequired(true))
.addStringOption(o =>
  o.setName("reason").setDescription("Lý do").setRequired(true))
.addAttachmentOption(o =>
  o.setName("proof").setDescription("Ảnh bằng chứng").setRequired(true)
),

new SlashCommandBuilder()
.setName("staffstrike")
.setDescription("Strike staff")
.addUserOption(o =>
  o.setName("user").setDescription("Staff").setRequired(true))
.addStringOption(o =>
  o.setName("reason").setDescription("Lý do").setRequired(true))
.addAttachmentOption(o =>
  o.setName("proof").setDescription("Ảnh bằng chứng").setRequired(true)
),

new SlashCommandBuilder()
  .setName("blacklist")
  .setDescription("Thêm user vào blacklist")
  .addUserOption(o =>
    o.setName("user")
      .setDescription("User")
      .setRequired(true))
  .addStringOption(o =>
    o.setName("reason")
      .setDescription("Lý do")
      .setRequired(true)
  ),

new SlashCommandBuilder()
  .setName("unblacklist")
  .setDescription("Xóa user khỏi blacklist")
  .addUserOption(o =>
    o.setName("user")
      .setDescription("User")
      .setRequired(true)
  ),

new SlashCommandBuilder()
.setName("bxh")
.setDescription("Bảng xếp hạng Clan")
.addSubcommand(sub =>
sub
.setName("aov")
.setDescription("Xem bảng xếp hạng aov")
)
.addSubcommand(sub =>
sub
.setName("kill")
.setDescription("BXH Kill (đang phát triển)")
)
.addSubcommand(sub =>
sub
.setName("chat")
.setDescription("BXH Chat (đang phát triển)")
),

new SlashCommandBuilder()
.setName("list")
.setDescription("Xem danh sách")
.addStringOption(o=>
o.setName("type")
.setDescription("Danh sách")
.setRequired(true)
.addChoices(
{name:"Top",value:"top"},
{name:"Staff",value:"staff"},
{name:"Mainers",value:"mainers"}
)),

new SlashCommandBuilder()
.setName("mainer")
.setDescription("Add user to Mainers")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true)
),

new SlashCommandBuilder()
.setName("demainer")
.setDescription("Remove user from Mainers")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true)
),
  
new SlashCommandBuilder()
.setName("promote")
.setDescription("Add staff")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true))
.addStringOption(o=>
o.setName("permission")
.setDescription("Role")
.setRequired(true)
.addChoices(
{name:"Founder",value:"Founder"},
{name:"Senior Developer",value:"Senior Developer"},
{name:"Developer",value:"Developer"},
{name:"Admin",value:"Admin"},
{name:"Junior Developer",value:"Junior Developer"},
{name:"Mod",value:"Mod"},
{name:"Rank Management",value:"Rank Management"},
{name:"Experienced Referee",value:"Experienced Referee"},
{name:"Referee",value:"Referee"},
{name:"Tryout host",value:"Tryout host"},
{name:"Training host",value:"Training host"},
)),

  new SlashCommandBuilder()
.setName("demote")
.setDescription("Remove staff")
.addUserOption(o=>
o.setName("user")
.setDescription("user to remove")
.setRequired(true)),

  new SlashCommandBuilder()
    .setName("settop")
    .setDescription("set player top rank")
    .addUserOption(o => o.setName("user").setDescription("member").setRequired(true))
    .addIntegerOption(o =>
      o.setName("top")
        .setDescription("top 1-20")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)
    ),

  new SlashCommandBuilder()
    .setName("detop")
    .setDescription("remove player from top")
    .addUserOption(o => o.setName("user").setDescription("member").setRequired(true)), // Đã sửa ngoặc ở đây

  new SlashCommandBuilder()
    .setName("thidau")
    .setDescription("Tạo thông báo thi đấu")
    .addStringOption(o =>
      o.setName("team1")
        .setDescription("Team 1")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("team2")
        .setDescription("Team 2")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("time")
        .setDescription("Thời gian")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("ref")
        .setDescription("Referee")
        .setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("⏳ Đang cập nhật lại các lệnh Slash...");

console.log("📦 Danh sách commands:");
console.log(commands.map(c => c.name));
// ❌ Xóa hết command cũ
await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: [] }
);

console.log("🧹 Đã xóa toàn bộ commands cũ");

// ⏳ delay nhẹ cho chắc
await new Promise(r => setTimeout(r, 2000));

// ✅ Deploy lại
await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands }
);

    console.log("✅ Commands deployed thành công!");
  } catch (error) {
    console.error("❌ Lỗi khi deploy:", error);
  }
})();
