const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [

new SlashCommandBuilder()
.setName("promote")
.setDescription("Promote member")
.addUserOption(o=>o.setName("user").setDescription("user").setRequired(true))
.addStringOption(o=>o.setName("rank").setDescription("rank").setRequired(true)),

new SlashCommandBuilder()
.setName("demote")
.setDescription("Demote member")
.addUserOption(o=>o.setName("user").setDescription("user").setRequired(true)),

new SlashCommandBuilder()
.setName("strike")
.setDescription("Strike member")
.addUserOption(o=>o.setName("user").setDescription("user").setRequired(true)),

// ===== SET TOP =====
new SlashCommandBuilder()
.setName("settop")
.setDescription("Set member to leaderboard")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true))
.addIntegerOption(o=>
o.setName("top")
.setDescription("Top position (1-20)")
.setMinValue(1)
.setMaxValue(20)
.setRequired(true)
),

// ===== REMOVE TOP =====
new SlashCommandBuilder()
.setName("detop")
.setDescription("Remove member from leaderboard")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true)
)

].map(c=>c.toJSON());


const rest = new REST({version:"10"}).setToken("BOT_TOKEN");


rest.put(
Routes.applicationCommands("CLIENT_ID"),
{body:commands}
);
