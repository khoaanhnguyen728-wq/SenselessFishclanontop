require("dotenv").config()

const { Client, GatewayIntentBits } = require("discord.js")
const express = require("express")
const fs = require("fs")

/* DISCORD CLIENT */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

/* EXPRESS */

const app = express()
app.use(express.json())

/* DATABASE */

let database = []
let top = {}

/* LOAD FILE */

if(fs.existsSync("database.json")){
  database = JSON.parse(fs.readFileSync("database.json"))
}

if(fs.existsSync("top.json")){
  top = JSON.parse(fs.readFileSync("top.json"))
}

/* SAVE */

function saveDB(){
  fs.writeFileSync("database.json", JSON.stringify(database,null,2))
}

function saveTop(){
  fs.writeFileSync("top.json", JSON.stringify(top,null,2))
}

/* BOT READY */

client.once("clientReady", ()=>{
  console.log("✅ BOT ONLINE")
})

/* COMMAND HANDLER */

client.on("interactionCreate", async interaction => {

if(!interaction.isChatInputCommand()) return

try{

/* PROMOTE */

if(interaction.commandName === "promote"){

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

if(interaction.commandName === "demote"){

await interaction.deferReply()

const user = interaction.options.getUser("user")

database = database.filter(x => x.id !== user.id)

saveDB()

await interaction.editReply(`❌ ${user.username} removed`)
}

/* SETTOP */

if(interaction.commandName === "settop"){

await interaction.deferReply()

const user = interaction.options.getUser("user")
const topRank = interaction.options.getInteger("top")

top[topRank] = {
  name:user.username,
  id:user.id,
  avatar:user.displayAvatarURL()
}

saveTop()

await interaction.editReply(`👑 ${user.username} set to TOP ${topRank}`)
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
res.json(top)
})

/* START SERVER */

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("🌐 API RUNNING : " + PORT)
})

/* LOGIN BOT */

client.login(process.env.TOKEN)
