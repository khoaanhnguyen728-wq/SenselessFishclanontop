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
StringSelectMenuBuilder
} = require("discord.js");

const app = express();
app.use(express.json());
app.use(cors());

/* ================= DISCORD BOT ================= */

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

/* ================= DATABASE ================= */


if(!fs.existsSync("top.json")) fs.writeFileSync("top.json","{}");
if(!fs.existsSync("register.json")) fs.writeFileSync("register.json","[]");
;

let top = JSON.parse(fs.readFileSync("top.json","utf8"));
let register = JSON.parse(fs.readFileSync("register.json","utf8"));

if(!fs.existsSync("staff.json")) fs.writeFileSync("staff.json","[]");

let staff = JSON.parse(fs.readFileSync("staff.json","utf8"));

function saveStaff(){
fs.writeFileSync("staff.json",JSON.stringify(staff,null,2));
}

const selectedMatch = new Map();

/* đảm bảo đủ 20 slot */

for(let i=1;i<=20;i++){
if(top[i] === undefined) top[i] = null;
}

function saveTop(){
fs.writeFileSync("top.json",JSON.stringify(top,null,2));
}

function saveRegister(){
fs.writeFileSync("register.json",JSON.stringify(register,null,2));
}

/* ================= BOT READY ================= */

client.once("ready",()=>{
console.log("🤖 Bot online:",client.user.tag);
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {

if(!interaction.isChatInputCommand()) return;

const { commandName, options } = interaction;

if(commandName === "promote"){

const user = options.getUser("user");
const role = options.getString("permission");

const avatar = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;

staff.push({
id:user.id,
username:user.username,
avatar:avatar,
role:role
});

saveStaff();

return interaction.reply(`✅ ${user.username} đã được thêm vào staff với role **${role}**`);
}

/* ===== SLASH COMMAND ===== */

if(interaction.isChatInputCommand()){

const {commandName,options} = interaction;

/* /thidau */

if(commandName === "thidau"){

const team1 = options.getString("team1");
const team2 = options.getString("team2");
const time = options.getString("time");
const ref = options.getString("ref");

const embed = new EmbedBuilder()
.setTitle("🏆 THÔNG BÁO THI ĐẤU")
.setColor(0xffcc00)
.addFields(
{name:"⚔️ Trận đấu",value:`${team1} vs ${team2}`},
{name:"⏰ Time",value:time,inline:true},
{name:"🏁 Ref",value:ref,inline:true}
)
.setTimestamp();

return interaction.reply({embeds:[embed]});
}

/* /settop */

if(commandName === "settop"){

const user = options.getUser("user");
const rank = options.getInteger("top");

top[rank] = {
id:user.id,
name:user.username,
avatar:user.displayAvatarURL({ extension:"png", size:256 })
};

saveTop();

return interaction.reply(`✅ ${user.username} đã vào **TOP ${rank}**`);

}

/* /detop */

if(commandName === "detop"){

const user = options.getUser("user");

let found = false;

for(let key in top){

if(top[key] && top[key].id === user.id){

top[key] = null;
found = true;

}

}

if(found){

saveTop();
return interaction.reply(`🗑️ Đã xoá ${user.username} khỏi bảng xếp hạng`);

}

return interaction.reply("❌ User này không có trong TOP");

}

}

/* ===== DROPDOWN ===== */

if(interaction.isStringSelectMenu()){

if(interaction.customId === "match_select"){

const value = interaction.values[0];

selectedMatch.set(interaction.user.id,value);

await interaction.reply({
content:"✅ Đã chọn: "+value,
ephemeral:true
});

}

}

/* ===== BUTTON ===== */

if(interaction.isButton()){

if(interaction.customId === "score_match"){

if(!selectedMatch.has(interaction.user.id)){

return interaction.reply({
content:"❌ Bạn phải chọn dropdown trước!",
ephemeral:true
});

}

await interaction.reply({
content:"📊 Ref nhập: `!score 5-3`",
ephemeral:true
});

}

}

});

/* ================= SCORE COMMAND ================= */

client.on("messageCreate",message=>{

if(message.author.bot) return;

if(!message.content.startsWith("!score")) return;

const score = message.content.split(" ")[1];

if(!score){

return message.reply("VD: `!score 5-0`");

}

message.channel.send(`📊 Kết quả trận đấu: **${score}**`);

});

/* ================= API ================= */

app.get("/",(req,res)=>{
res.send("Server running");
});

/* TOP API */

app.get("/top",(req,res)=>{

const result = {};

for(let i=1;i<=20;i++){
result[i] = top[i] || null;
}

res.json(result);

});
/* STAFF API */

app.get("/staff",(req,res)=>{
res.json(staff);
});

/* ROBLOX API */

app.get("/roblox/:username",async(req,res)=>{

try{

const username = req.params.username;

const userRes = await axios.post(
"https://users.roblox.com/v1/usernames/users",
{
usernames:[username],
excludeBannedUsers:true
}
);

if(!userRes.data.data.length){

return res.status(404).json({
error:"Không tìm thấy User Roblox"
});

}

const userId = userRes.data.data[0].id;

const thumb = await axios.get(
`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
);

res.json({
userId,
username,
displayName:userRes.data.data[0].displayName,
avatarUrl:thumb.data.data[0].imageUrl
});

}catch{

res.status(500).json({
error:"Roblox API lỗi"
});

}

});

/* REGISTER API */

app.post("/register",async(req,res)=>{

try{

const {discord,robloxId,stage,time} = req.body;

const channel = await client.channels.fetch(process.env.CHANNEL_ID);

register.push({discord,robloxId,stage,time});

saveRegister();

const embed = new EmbedBuilder()
.setTitle("🏆 ĐĂNG KÝ THI ĐẤU")
.setColor(0x00ff00)
.addFields(
{name:"👤 Discord",value:discord||"N/A",inline:true},
{name:"🆔 Roblox",value:String(robloxId||"N/A"),inline:true},
{name:"📊 Stage",value:stage||"N/A",inline:true},
{name:"⏰ Time",value:time||"N/A"}
)
.setFooter({text:"SenselessFish Clan"})
.setTimestamp();

const dropdown = new StringSelectMenuBuilder()
.setCustomId("match_select")
.setPlaceholder("Chọn thông tin")
.addOptions([
{label:"Player "+discord,value:"player"},
{label:"Roblox "+robloxId,value:"roblox"},
{label:"Referee",value:"ref"}
]);

const btn = new ButtonBuilder()
.setCustomId("score_match")
.setLabel("Nhập Score")
.setStyle(ButtonStyle.Primary);

const row1 = new ActionRowBuilder().addComponents(dropdown);
const row2 = new ActionRowBuilder().addComponents(btn);

await channel.send({
embeds:[embed],
components:[row1,row2]
});

res.json({success:true});

}catch{

res.status(500).json({
error:"Discord send error"
});

}

});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("🌐 Server chạy port",PORT);
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN).catch(()=>{
console.log("❌ TOKEN Discord sai");
});
