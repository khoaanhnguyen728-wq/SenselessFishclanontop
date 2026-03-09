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
app.use(express.json());
app.use(cors());

/* ================= DATABASE ================= */

if (!fs.existsSync("top.json")) fs.writeFileSync("top.json", "{}");
if (!fs.existsSync("register.json")) fs.writeFileSync("register.json", "[]");
if (!fs.existsSync("staff.json")) fs.writeFileSync("staff.json", "[]");

let top = JSON.parse(fs.readFileSync("top.json"));
let register = JSON.parse(fs.readFileSync("register.json"));
let staff = JSON.parse(fs.readFileSync("staff.json"));

for (let i = 1; i <= 20; i++) {
if (!top[i]) top[i] = null;
}

function saveTop(){
fs.writeFileSync("top.json",JSON.stringify(top,null,2));
}

function saveStaff(){
fs.writeFileSync("staff.json",JSON.stringify(staff,null,2));
}

function saveRegister(){
fs.writeFileSync("register.json",JSON.stringify(register,null,2));
}

/* ================= DISCORD BOT ================= */

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMembers,
GatewayIntentBits.GuildPresences,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

/* ================= INTERACTION SYSTEM ================= */

const selected = new Map();

let stats = {
total:0,
online:0
};

/* BOT READY */

client.once("ready",()=>{
console.log("🤖 Bot đã sẵn sàng:",client.user.tag);

setInterval(()=>{

const guild = client.guilds.cache.get(process.env.GUILD_ID);

if(!guild) return;

stats.total = guild.memberCount;

stats.online = guild.members.cache.filter(m =>
m.presence && ["online","idle","dnd"].includes(m.presence.status)
).size;

},10000);

});

client.on("interactionCreate", async interaction=>{
try{

/* ---------- SLASH COMMAND ---------- */

if(interaction.isChatInputCommand()){

const {commandName,options}=interaction;

/* SETTOP */

if(commandName==="settop"){

await interaction.deferReply();

const user=options.getUser("user");
const rank=options.getInteger("top");

top[rank]={
id:user.id,
name:user.username,
avatar:user.displayAvatarURL({extension:"png",size:256}),
profile:`https://discord.com/users/${user.id}`
};

saveTop();

return interaction.editReply(`✅ Đã đưa **${user.username}** vào **TOP ${rank}**`);

}

/* DETOP */

if(commandName==="detop"){

await interaction.deferReply();

const user=options.getUser("user");
let found=false;

for(let key in top){
if(top[key] && top[key].id===user.id){
top[key]=null;
found=true;
}
}

if(found){
saveTop();
return interaction.editReply(`🗑️ Đã xóa **${user.username}** khỏi TOP`);
}

return interaction.editReply("❌ User không có trong TOP");

}

/* PROMOTE */

if(commandName==="promote"){

await interaction.deferReply();

const user=options.getUser("user");
const role=options.getString("permission");

staff=staff.filter(s=>s.id!==user.id);

staff.push({
id:user.id,
username:user.username,
role,
avatar:user.displayAvatarURL({extension:"png",size:256})
});

saveStaff();

return interaction.editReply(`✅ **${user.username}** đã trở thành **${role}**`);

}

/* DEMOTE */

if(commandName==="demote"){

await interaction.deferReply();

const user=options.getUser("user");

staff=staff.filter(s=>s.id!==user.id);

saveStaff();

return interaction.editReply(`❌ Đã gỡ quyền của **${user.username}**`);

}

/* THIDAU */

if(commandName==="thidau"){

const team1=options.getString("team1");
const team2=options.getString("team2");
const time=options.getString("time");
const ref=options.getString("ref");

const embed=new EmbedBuilder()
.setTitle("🏆 THÔNG BÁO THI ĐẤU")
.setColor(0x00eaff)
.addFields(
{name:"⚔️ Trận đấu",value:`${team1} VS ${team2}`},
{name:"⏰ Thời gian",value:time,inline:true},
{name:"🏁 Referee",value:ref,inline:true}
)
.setTimestamp();

const dropdown=new StringSelectMenuBuilder()
.setCustomId("match_info")
.setPlaceholder("Xem thông tin / liên hệ")
.addOptions([
{label:`P1: ${team1}`,value:"p1"},
{label:`P2: ${team2}`,value:"p2"},
{label:`Referee: ${ref}`,value:"ref"}
]);

const scoreBtn=new ButtonBuilder()
.setCustomId("score_match")
.setLabel("Score")
.setStyle(ButtonStyle.Primary);

const row1=new ActionRowBuilder().addComponents(dropdown);
const row2=new ActionRowBuilder().addComponents(scoreBtn);

return interaction.reply({
embeds:[embed],
components:[row1,row2]
});

}

}
/* ---------- DROPDOWN ---------- */

if(interaction.isStringSelectMenu()){

if(interaction.customId === "select_stage"){

const stage = interaction.values[0];

selected.set(interaction.user.id, stage);

const modal = new ModalBuilder()
.setCustomId("submit_score")
.setTitle("Nhập Score");

const scoreInput = new TextInputBuilder()
.setCustomId("score")
.setLabel("Score của bạn")
.setStyle(TextInputStyle.Short)
.setPlaceholder("Ví dụ: 12500")
.setRequired(true);

const row = new ActionRowBuilder().addComponents(scoreInput);

modal.addComponents(row);

return interaction.showModal(modal);

}

}

/* ---------- MODAL SUBMIT ---------- */

if(interaction.isModalSubmit()){

if(interaction.customId === "submit_score"){

await interaction.deferReply({ ephemeral:true });

const score = interaction.fields.getTextInputValue("score");

const stage = selected.get(interaction.user.id) || "Unknown";

await interaction.editReply({
content:`✅ Score đã gửi!\n\nStage: **${stage}**\nScore: **${score}**`
});

}

}

/* MATCH INFO */

if(interaction.isStringSelectMenu() && interaction.customId === "match_info"){

const value = interaction.values[0];

return interaction.reply({
content:`📌 Thông tin: **${value}**`,
ephemeral:true
});

}

}catch(err){
console.error(err);
}
});

/* ================= WEB API ================= */

app.get("/",(req,res)=>{
res.send("Senseless Fish Clan API Running");
});

app.get("/top",(req,res)=>{
res.json(top);
});

app.get("/staff",(req,res)=>{
res.json(staff);
});

app.get("/stats",(req,res)=>{
res.json(stats);
});

try{

const guild = client.guilds.cache.get(process.env.GUILD_ID);
const members = await guild.members.fetch();

let online = members.filter(m =>
m.presence &&
["online","idle","dnd"].includes(m.presence.status)
).size;

res.json({
total: members.size,
online: online
});

}catch(err){
console.error(err);
res.json({total:0,online:0});
}


/* ROBLOX PROFILE */

app.get("/roblox/:username",async(req,res)=>{

try{

const username=req.params.username;

const userRes=await axios.post("https://users.roblox.com/v1/usernames/users",{
usernames:[username],
excludeBannedUsers:true
});

if(!userRes.data.data.length) return res.status(404).json({error:"Not found"});

const userId=userRes.data.data[0].id;

const thumb=await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);

res.json({
userId,
username,
displayName:userRes.data.data[0].displayName,
avatarUrl:thumb.data.data[0].imageUrl
});

}catch{

res.status(500).json({error:"Roblox API error"});

}

});

/* REGISTER MATCH */

app.post("/register", async (req, res) => {

try{

const {discord, robloxUsername, robloxId} = req.body;

const channel = await client.channels.fetch(process.env.CHANNEL_ID);

/* Lấy avatar Roblox */

let robloxData = null;

try{

const userRes = await axios.post(
"https://users.roblox.com/v1/usernames/users",
{ usernames:[robloxUsername], excludeBannedUsers:true }
);

if(userRes.data.data.length){

const id = userRes.data.data[0].id;

const thumb = await axios.get(
`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=true`
);

robloxData = {
id,
avatar: thumb.data.data[0].imageUrl
};

}

}catch{}

/* EMBED */

const embed = new EmbedBuilder()
.setTitle("📝 ĐĂNG KÝ THI ĐẤU")
.setColor(0x00ff00)
.setThumbnail(robloxData?.avatar || null)
.addFields(
{ name:"Discord", value:discord },
{ name:"Roblox", value:robloxUsername || "N/A" }
)
.setTimestamp();

/* DROPDOWN STAGE */

const stageMenu = new StringSelectMenuBuilder()
.setCustomId("select_stage")
.setPlaceholder("Chọn Stage")
.addOptions([
{label:"🔥 3 High",value:"3_high"},
{label:"🔥 3 Low",value:"3_low"},
{label:"🔥 4 High",value:"4_high"},
{label:"🔥 4 Low",value:"4_low"}
]);

const row = new ActionRowBuilder().addComponents(stageMenu);

await channel.send({
embeds:[embed],
components:[row]
});

res.json({success:true});

}catch(e){

console.error(e);
res.status(500).json({error:"Register error"});

}

});

/* ================= SERVER ================= */

const PORT=process.env.PORT||3000;

app.listen(PORT,()=>{
console.log("🌐 Web chạy port",PORT);
});

client.login(process.env.TOKEN);
