require("dotenv").config()

const { REST, Routes, SlashCommandBuilder } = require("discord.js")

const commands = [

new SlashCommandBuilder()
.setName("promote")
.setDescription("promote member")
.addUserOption(o=>o.setName("user").setDescription("member").setRequired(true))
.addStringOption(o=>o.setName("rank").setDescription("rank").setRequired(true)),

new SlashCommandBuilder()
.setName("demote")
.setDescription("demote member")
.addUserOption(o=>o.setName("user").setDescription("member").setRequired(true))
.addStringOption(o=>o.setName("rank").setDescription("rank").setRequired(true)),

new SlashCommandBuilder()
.setName("settop")
.setDescription("set player top rank")
.addUserOption(o=>
o.setName("user")
.setDescription("member")
.setRequired(true)
)
.addIntegerOption(o=>
o.setName("top")
.setDescription("top 1-20")
.setRequired(true)
.setMinValue(1)   // thấp nhất
.setMaxValue(20)  // cao nhất
)

].map(c=>c.toJSON())

const rest = new REST({version:"10"}).setToken(process.env.TOKEN)

rest.put(
Routes.applicationCommands(process.env.CLIENT_ID),
{body:commands}
).then(()=>{
console.log("✅ Commands deployed!")
}).catch(console.error)
