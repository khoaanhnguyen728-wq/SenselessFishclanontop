const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const TOKEN = "MTQ3NjIwODY1MTgzNTQwODUwNg.GdXBQq.SyRNyggpE_Fcq2KX9dT49YIxQO3MmvJXXcyZl8";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

client.once("ready", async () => {
    console.log(`✅ Bot online: ${client.user.tag}`);

    setInterval(async () => {
        let total = 0;
        let online = 0;

        client.guilds.cache.forEach(guild => {
            total += guild.memberCount;
            guild.members.cache.forEach(member => {
                if (member.presence?.status === "online") online++;
            });
        });

        io.emit("update", {
            totalMembers: total,
            onlineMembers: online
        });
    }, 5000);
});

server.listen(3000, () => {
    console.log("🌐 Web chạy tại https://khoaanhnguyen728-wq.github.io/SenselessFishclanontop/");
});


client.login(TOKEN);