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

let database = []

if(fs.existsSync("database.json")){
database = JSON.parse(fs.readFileSync("database.json"))
}

function save(){
fs.writeFileSync("database.json",JSON.stringify(database,null,2))
}

client.once("ready",()=>{
console.log("BOT ONLINE")
})

client.on("interactionCreate", async interaction => {

if(!interaction.isChatInputCommand()) return

if(interaction.commandName === "promote"){

const user = interaction.options.getUser("user")
const rank = interaction.options.getString("rank")

database.push({
id:user.id,
name:user.username,
avatar:user.displayAvatarURL(),
rank:rank
})

save()

interaction.reply(`${user.username} promoted to ${rank}`)

}

if(interaction.commandName === "demote"){

const user = interaction.options.getUser("user")

database = database.filter(x => x.id !== user.id)

save()

interaction.reply(`${user.username} removed`)
}

})

app.get("/players",(req,res)=>{
res.json(database)
})

app.listen(3000,()=>{
console.log("API RUNNING")
})

client.login(process.env.TOKEN)