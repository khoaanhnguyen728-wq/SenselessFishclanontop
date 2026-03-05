const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [

/* PROMOTE */
new SlashCommandBuilder()
.setName("promote")
.setDescription("Promote member")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true))
.addStringOption(o=>
o.setName("rank")
.setDescription("Leader / Co-Leader / Member / Elite")
.setRequired(true)
),

/* DEMOTE */
new SlashCommandBuilder()
.setName("demote")
.setDescription("Demote member")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true)
),

/* STRIKE */
new SlashCommandBuilder()
.setName("strike")
.setDescription("Strike member")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true)
),

/* SET RANK */
new SlashCommandBuilder()
.setName("setrank")
.setDescription("Set skill rank")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true))
.addStringOption(o=>
o.setName("rank")
.setDescription("A B C D")
.setRequired(true)
.addChoices(
{name:"Rank A",value:"A"},
{name:"Rank B",value:"B"},
{name:"Rank C",value:"C"},
{name:"Rank D",value:"D"},
{name:"Rank E",value:"E"}
)
),

/* SET TOP */
new SlashCommandBuilder()
.setName("settop")
.setDescription("Set leaderboard position")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true))
.addIntegerOption(o=>
o.setName("top")
.setDescription("Top position")
.setMinValue(1)
.setMaxValue(20)
.setRequired(true)
),

/* REMOVE TOP */
new SlashCommandBuilder()
.setName("detop")
.setDescription("Remove from leaderboard")
.addUserOption(o=>
o.setName("user")
.setDescription("user")
.setRequired(true)
)

].map(c=>c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

rest.put(
Routes.applicationCommands("1476208651835408506"),
{ body: commands }
);
