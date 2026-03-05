require("dotenv").config()

const {REST,Routes,SlashCommandBuilder} = require("discord.js")

const commands=[

// PROMOTE
new SlashCommandBuilder()
.setName("promote")
.setDescription("promote member")
.addUserOption(o=>o.setName("user").setDescription("member").setRequired(true))
.addStringOption(o=>o.setName("rank").setDescription("rank").setRequired(true)),

// DEMOTE
new SlashCommandBuilder()
.setName("demote")
.setDescription("demote member")
.addUserOption(o=>o.setName("user").setDescription("member").setRequired(true))
.addStringOption(o=>o.setName("rank").setDescription("rank").setRequired(true)),

// SET TOP
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
  .setMinValue(1)
  .setMaxValue(20)
)

].map(c=>c.toJSON())

const rest = new REST({version:"10"}).setToken(process.env.TOKEN)

rest.put(
Routes.applicationCommands(process.env.CLIENT_ID),
{body:commands}
)