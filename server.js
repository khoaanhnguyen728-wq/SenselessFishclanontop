require("dotenv").config()

const express = require("express")
const fs = require("fs")
const cors = require("cors")

const {
Client,
GatewayIntentBits,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle
} = require("discord.js")

const app = express()
app.use(express.json())
app.use(cors())

// ===== DISCORD BOT =====

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
})

// ===== TOP DATA =====

let top = {}

if (!fs.existsSync("top.json")) fs.writeFileSync("top.json","{}")

try{
top = JSON.parse(fs.readFileSync("top.json","utf8"))
}catch{
top={}
}

for(let i=1;i<=20;i++){
if(top[i]===undefined) top[i]=null
}

function saveTop(){
fs.writeFileSync("top.json",JSON.stringify(top,null,2))
}

// ===== BOT READY =====

client.once("ready",()=>{
console.log("🤖 Bot online: "+client.user.tag)
})

// ===== BUTTON EVENT =====

client.on("interactionCreate",async interaction=>{

if(!interaction.isButton()) return

if(interaction.customId==="score_match"){

await interaction.reply({
content:"Referee nhập score dạng: `!score 5-3`",
ephemeral:true
})

}

})

// ===== SCORE COMMAND =====

client.on("messageCreate",message=>{

if(!message.content.startsWith("!score")) return

const score = message.content.split(" ")[1]

message.channel.send(`📊 Score cập nhật: **${score}**`)

})

// ===== API =====

// test route
app.get("/",(req,res)=>{
res.send("Server running")
})

// top api
app.get("/top",(req,res)=>{
res.json(top)
})

// register api
app.post("/register",async(req,res)=>{

try{

const {discord, robloxId, stage, time} = req.body

const CHANNEL_ID = process.env.CHANNEL_ID

const channel = await client.channels.fetch(CHANNEL_ID)

const embed = new EmbedBuilder()
.setTitle("🏆 ĐĂNG KÝ THI ĐẤU")
.setColor(0x00AEFF)
.addFields(
{name:"👤 Discord",value:discord,inline:true},
{name:"🆔 Roblox ID",value:robloxId,inline:true},
{name:"📊 Stage",value:stage,inline:true},
{name:"⏰ Time",value:time,inline:true}
)
.setTimestamp()

const button = new ButtonBuilder()
.setCustomId("score_match")
.setLabel("Nhập Score")
.setStyle(ButtonStyle.Primary)

const row = new ActionRowBuilder().addComponents(button)

await channel.send({
embeds:[embed],
components:[row]
})

res.json({success:true})

}catch(err){

console.error(err)
res.status(500).json({error:"Send discord failed"})

}

})

// ===== START SERVER =====

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{

console.log("🌐 API RUNNING ON PORT "+PORT)

client.login(process.env.TOKEN)

})
