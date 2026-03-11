require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [

new SlashCommandBuilder()
.setName("aov")
.setDescription("Lệnh AOV")
.addSubcommand(sub =>
sub
.setName("top")
.setDescription("Xem bảng xếp hạng AOV Clan")
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
{name:"Leader",value:"Leader"},
{name:"Senior Developer",value:"Senior Developer"},
{name:"Senior Admin",value:"Senior Admin"},
{name:"Developer",value:"Developer"},
{name:"Admin",value:"Admin"},
{name:"Junior Developer",value:"Junior Developer"},
{name:"Junior Admin",value:"Junior Admin"},
{name:"Mod",value:"Mod"},
{name:"Rank Management",value:"Rank Management"},
{name:"Experienced Referee",value:"Experienced Referee"},
{name:"Referee",value:"Referee"},
{name:"Junior Referee",value:"Junior Referee"},
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
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Commands deployed thành công!");
  } catch (error) {
    console.error("❌ Lỗi khi deploy:", error);
  }
})();
