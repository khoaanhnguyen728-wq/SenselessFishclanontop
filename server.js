require("dotenv").config()

const { Client, GatewayIntentBits } = require("discord.js")
const express = require("express")
const fs = require("fs")

/* DISCORD CLIENT */

const client = new Client({
  intents:[GatewayIntentBits.Guilds]
})

/* EXPRESS */

const app = express()
app.use(express.json())

/* DATABASE */

let database = []
let top = {}

/* LOAD FILE */

if(fs.existsSync("database.json")){
  database = JSON.parse(fs.readFileSync("database.json","utf8"))
}

if(fs.existsSync("top.json")){
  top = JSON.parse(fs.readFileSync("top.json","utf8"))
}

/* đảm bảo top 1-20 tồn tại */

for(let i=1;i<=20;i++){
  if(top[i] === undefined){
    top[i] = null
  }
}

/* SAVE */

function saveDB(){
  fs.writeFileSync("database.json", JSON.stringify(database,null,2))
}

function saveTop(){
  fs.writeFileSync("top.json", JSON.stringify(top,null,2))
}

/* BOT READY */

client.once("clientReady",()=>{
  console.log("✅ BOT ONLINE")
})

/* COMMAND HANDLER */

client.on("interactionCreate",async interaction=>{

if(!interaction.isChatInputCommand()) return

try{

/* PROMOTE */

if(interaction.commandName==="promote"){

await interaction.deferReply()

const user = interaction.options.getUser("user")
const rank = interaction.options.getString("rank")

database.push({
  id:user.id,
  name:user.username,
  avatar:user.displayAvatarURL(),
  rank:rank
})

saveDB()

await interaction.editReply(`✅ ${user.username} promoted to ${rank}`)
}

/* DEMOTE */

if(interaction.commandName==="demote"){

await interaction.deferReply()

const user = interaction.options.getUser("user")

database = database.filter(x=>x.id!==user.id)

saveDB()

await interaction.editReply(`❌ ${user.username} removed`)
}

/* SETTOP */

if(interaction.commandName==="settop"){

await interaction.deferReply()

const user = interaction.options.getUser("user")
const topRank = interaction.options.getInteger("top")

/* remove user khỏi top cũ */

for(let i=1;i<=20;i++){
  if(top[i] && top[i].id === user.id){
    top[i] = null
  }
}

top[topRank] = {
  id:user.id,
  name:user.username,
  avatar:user.displayAvatarURL({size:256})
}

saveTop()

await interaction.editReply(`👑 ${user.username} set to TOP ${topRank}`)
}

/* DETOP */

if(interaction.commandName==="detop"){

await interaction.deferReply()

const user = interaction.options.getUser("user")

let removed = false

for(let i=1;i<=20;i++){
  if(top[i] && top[i].id === user.id){
    top[i] = null
    removed = true
  }
}

saveTop()

if(removed){
await interaction.editReply(`❌ ${user.username} removed from TOP`)
}else{
await interaction.editReply(`⚠️ ${user.username} not in TOP`)
}

}

}catch(err){
console.error(err)

if(!interaction.replied){
interaction.reply("❌ Bot error")
}

}

})

/* API */

app.get("/players",(req,res)=>{
res.json(database)
})

app.get("/top",(req,res)=>{

/* đảm bảo format đúng */

let result = {}

for(let i=1;i<=20;i++){
result[i] = top[i] || null
}

res.json(result)

})

/* START SERVER */

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("🌐 API RUNNING : "+PORT)
})

/* LOGIN */

client.login(process.env.TOKEN)
