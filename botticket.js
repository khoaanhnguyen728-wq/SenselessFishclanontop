require("dotenv").config();

const express = require("express");
const app = express();

// route để Render kiểm tra
app.get("/", (req, res) => {
  res.send("Bot is running");
});

// mở port cho Web Service
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Web server running on port " + PORT);
});

const {
Client,
GatewayIntentBits,
EmbedBuilder,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
PermissionsBitField,
ChannelType
} = require("discord.js");

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages
]
});

const STAFF_ROLES = process.env.STAFF_ROLES.split(",");

client.once("ready", async () => {

console.log(`Bot ready: ${client.user.tag}`);

await client.application.commands.set([
{
name: "ticket",
description: "Gửi panel tạo ticket"
}
]);

});

client.on("interactionCreate", async interaction => {


// SLASH COMMAND
if (interaction.isChatInputCommand()) {

if (interaction.commandName === "ticket") {

const embed = new EmbedBuilder()
.setTitle("🎫 Support Ticket")
.setDescription("Nhấn nút bên dưới để tạo ticket hỗ trợ.")
.setColor("Blue");

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId("create_ticket")
.setLabel("Create Ticket")
.setStyle(ButtonStyle.Success)
);

// gửi PUBLIC cho mọi người thấy
await interaction.reply({
embeds: [embed],
components: [row]
});

}

}


// BUTTON
if (interaction.isButton()) {


// CREATE TICKET
if (interaction.customId === "create_ticket") {

let perms = [

{
id: interaction.guild.id,
deny: [PermissionsBitField.Flags.ViewChannel]
},

{
id: interaction.user.id,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages
]
}

];

// thêm nhiều staff role
STAFF_ROLES.forEach(role => {

const r = interaction.guild.roles.cache.get(role.trim());

if (!r) return;

perms.push({
id: r.id,
allow: [
PermissionsBitField.Flags.ViewChannel,
PermissionsBitField.Flags.SendMessages
]
});

});

const channel = await interaction.guild.channels.create({
name: `ticket-${interaction.user.username}`,
type: ChannelType.GuildText,
permissionOverwrites: perms
});

const embed = new EmbedBuilder()
.setTitle("🎫 Ticket")
.setDescription("Staff sẽ hỗ trợ bạn sớm.")
.setColor("Green");

const row = new ActionRowBuilder().addComponents(

new ButtonBuilder()
.setCustomId("claim")
.setLabel("Claim")
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("close")
.setLabel("Close")
.setStyle(ButtonStyle.Danger)

);

await channel.send({
content: `${interaction.user}`,
embeds: [embed],
components: [row]
});

interaction.reply({
content: `✅ Ticket đã tạo: ${channel}`,
ephemeral: true
});

}


// CLAIM
if (interaction.customId === "claim") {

interaction.channel.send(
`✅ Ticket đã được ${interaction.user} claim`
);

interaction.reply({
content: "Bạn đã claim ticket",
ephemeral: true
});

}


// CLOSE
if (interaction.customId === "close") {

await interaction.reply("🔒 Đang đóng ticket...");

setTimeout(() => {
interaction.channel.delete();
}, 3000);

}

}

});

client.login(process.env.BOT_TOKEN);
