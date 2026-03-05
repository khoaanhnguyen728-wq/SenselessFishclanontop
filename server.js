const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;

let members = [];

if (fs.existsSync("members.json")) {
  members = JSON.parse(fs.readFileSync("members.json"));
}

function save() {
  fs.writeFileSync("members.json", JSON.stringify(members, null, 2));
}

client.on("ready", () => {
  console.log(`Bot online ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "promote") {
    const user = interaction.options.getUser("user");
    const rank = interaction.options.getString("rank");

    let member = members.find(m => m.id === user.id);

    if (!member) {
      member = {
        id: user.id,
        name: user.username,
        avatar: user.displayAvatarURL(),
        rank: rank
      };
      members.push(member);
    } else {
      member.rank = rank;
    }

    save();

    await interaction.reply(`Promoted ${user.username} → ${rank}`);
  }

  if (interaction.commandName === "demote") {
    const user = interaction.options.getUser("user");
    const rank = interaction.options.getString("rank");

    let member = members.find(m => m.id === user.id);

    if (member) {
      member.rank = rank;
      save();
    }

    await interaction.reply(`Demoted ${user.username} → ${rank}`);
  }
});

app.get("/members", (req, res) => {
  res.json(members);
});

client.login(TOKEN);

app.listen(3000, () => {
  console.log("API RUNNING");
});
