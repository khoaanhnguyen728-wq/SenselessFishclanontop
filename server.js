require("dotenv").config()

const express = require("express")
const fs = require("fs")

const {
Client,
GatewayIntentBits
} = require("discord.js")

const app = express()

const client = new Client({
intents:[GatewayIntentBits.Guilds]
})

/* DATABASE */

let database = []
let top = {}

if(fs.existsSync("database.json")){
database = JSON.parse(fs.readFileSync("database.json"))
}

if(fs.existsSync("top.json")){
top = JSON.parse(fs.readFileSync("top.json"))
}

function saveDB(){
fs.writeFileSync("database.json",JSON.stringify(database,null,2))
}

function saveTop(){
fs.writeFileSync("top.json",JSON.stringify(top,null,2))
}

/* BOT READY */

client.once("ready",()=>{
console.log("BOT ONLINE")
})

/* COMMAND HANDLER */

client.on("interactionCreate", async interaction => {

if(!interaction.isChatInputCommand()) return

/* PROMOTE */

if(interaction.commandName === "promote"){

const user = interaction.options.getUser("user")
const rank = interaction.options.getString("rank")

database.push({
id:user.id,
name:user.username,
avatar:user.displayAvatarURL(),
rank:rank
})

saveDB()

await interaction.reply(`✅ ${user.username} promoted to ${rank}`)

}

/* DEMOTE */

if(interaction.commandName === "demote"){

const user = interaction.options.getUser("user")

database = database.filter(x => x.id !== user.id)

saveDB()

await interaction.reply(`❌ ${user.username} removed`)

}

/* SETTOP */

if(interaction.commandName === "settop"){

const user = interaction.options.getUser("user")
const topRank = interaction.options.getInteger("top")

top[topRank] = {
name:user.username,
id:user.id,
avatar:user.displayAvatarURL()
}

saveTop()

await interaction.reply(`👑 ${user.username} set to TOP ${topRank}`)

}

})

/* API */

app.get("/players",(req,res)=>{
res.json(database)
})

app.get("/top",(req,res)=>{
res.json(top)
})

app.listen(3000,()=>{
console.log("API RUNNING")
})

client.login(process.env.TOKEN)
