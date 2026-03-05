require("dotenv").config()

const {REST,Routes,SlashCommandBuilder} = require("discord.js")

const commands=[

new SlashCommandBuilder()
.setName("promote")
.setDescription("promote member")
.addUserOption(o=>o.setName("user").setDescription("user").setRequired(true))
.addStringOption(o=>o.setName("rank").setDescription("rank").setRequired(true)),

new SlashCommandBuilder()
.setName("demote")
.setDescription("demote member")
.addUserOption(o=>o.setName("user").setDescription("user").setRequired(true))

].map(c=>c.toJSON())

const rest = new REST({version:"10"}).setToken(process.env.TOKEN)

rest.put(
Routes.applicationCommands("1476208651835408506"),
{body:commands}
)