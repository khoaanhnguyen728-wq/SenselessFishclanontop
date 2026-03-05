const { Client, GatewayIntentBits } = require('discord.js');
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

let membersCache = [];

client.once("ready", async () => {

  console.log("BOT READY");

  const guild = await client.guilds.fetch("SERVER_ID");
  const members = await guild.members.fetch();

  membersCache = members.map(m => ({
    name: m.user.username,
    avatar: m.user.displayAvatarURL(),
    online: m.presence?.status === "online"
  }));

});

app.get("/members", (req,res)=>{

  const total = membersCache.length;
  const online = membersCache.filter(m=>m.online).length;

  res.json({
    total,
    online,
    members:membersCache
  });

});

app.listen(3000, ()=>{
  console.log("API RUNNING");
});

client.login(process.env.TOKEN);
