const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const BOT_API_URL = process.env.BOT_API_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;

if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required");
if (!DISCORD_CLIENT_ID) throw new Error("DISCORD_CLIENT_ID is required");
if (!BOT_API_URL) throw new Error("BOT_API_URL is required");
if (!BOT_API_KEY) throw new Error("BOT_API_KEY is required");

const commands = [
  new SlashCommandBuilder()
    .setName("guide")
    .setDescription("Get a guide for any game")
    .addStringOption((option) =>
      option.setName("game").setDescription('Game name, like "elden ring"').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("topic").setDescription('Specific topic, like "malenia"').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search all guides")
    .addStringOption((option) =>
      option.setName("query").setDescription("What to search for").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("tip")
    .setDescription("Get a quick tip for a game")
    .addStringOption((option) =>
      option.setName("game").setDescription("Game name").setRequired(true),
    ),
].map((command) => command.toJSON());

const BRAND_PURPLE = 0x8b5cf6;
const BRAND_PINK = 0xec4899;
const BRAND_AMBER = 0xfb923c;

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  console.log("Registering slash commands...");
  await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
  console.log("Slash commands registered.");
}

async function callBotApi(action, params = {}, method = "GET", body) {
  const url = new URL(BOT_API_URL);
  url.searchParams.set("action", action);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      "x-api-key": BOT_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`bot-api ${action} failed [${response.status}]: ${JSON.stringify(data)}`);
  }

  return data;
}

async function logUsage(interaction, command, payload) {
  try {
    await callBotApi(
      "log",
      {},
      "POST",
      {
        server_id: interaction.guildId,
        server_name: interaction.guild?.name ?? null,
        channel_id: interaction.channelId,
        user_id: interaction.user?.id ?? null,
        command,
        ...payload,
      },
    );
  } catch (error) {
    console.error("Usage log failed:", error.message);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} servers`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "guide") {
      await interaction.deferReply();
      const game = interaction.options.getString("game", true);
      const topic = interaction.options.getString("topic") ?? "";
      const data = await callBotApi("guide", { game, topic });

      if (!data.found) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_PURPLE)
              .setDescription(`No guide found for **${game}**. Try a different name or use \`/search\`.`)
              .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" }),
          ],
        });
        await logUsage(interaction, "guide", { query: `${game} ${topic}`.trim(), response_found: false });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND_PURPLE)
        .setAuthor({ name: data.game, url: `https://www.antmag.net/guide/${data.game_slug}` })
        .setTitle(data.section)
        .setDescription((data.excerpt || "").slice(0, 400))
        .setURL(data.url)
        .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" })
        .setTimestamp();

      if (data.cover_image) embed.setThumbnail(data.cover_image);
      if (Array.isArray(data.related_sections) && data.related_sections.length > 0) {
        embed.addFields({
          name: "Related sections",
          value: data.related_sections.map((section) => `• ${section.title}`).join("\n"),
        });
      }
      embed.addFields({ name: "\u200B", value: `[Read full guide →](${data.url})` });

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "guide", {
        query: `${game} ${topic}`.trim(),
        game_query: game,
        topic_query: topic,
        game_matched: data.game,
        section_matched: data.section,
        response_found: true,
      });
      return;
    }

    if (interaction.commandName === "search") {
      await interaction.deferReply();
      const query = interaction.options.getString("query", true);
      const data = await callBotApi("search", { q: query });

      if (!Array.isArray(data.results) || data.results.length === 0) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_PURPLE)
              .setDescription(`No results for **${query}**. Try different keywords.`)
              .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" }),
          ],
        });
        await logUsage(interaction, "search", { query, response_found: false });
        return;
      }

      const lines = data.results.slice(0, 6).map((result, index) => {
        if (result.type === "game") {
          return `**${index + 1}.** 🎮 [${result.title}](${result.url}) — ${result.sections} sections`;
        }
        return `**${index + 1}.** 📖 [${result.title}](${result.url})${result.game ? ` — ${result.game}` : ""}`;
      });

      const embed = new EmbedBuilder()
        .setColor(BRAND_PINK)
        .setTitle(`Found ${data.total} matching sections`)
        .setDescription(lines.join("\n"))
        .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "search", { query, response_found: true });
      return;
    }

    if (interaction.commandName === "tip") {
      await interaction.deferReply();
      const game = interaction.options.getString("game", true);
      const data = await callBotApi("tip", { game });

      if (!data.found) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_PURPLE)
              .setDescription(`No tips found for **${game}**.`)
              .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" }),
          ],
        });
        await logUsage(interaction, "tip", { query: game, response_found: false });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND_AMBER)
        .setAuthor({ name: `${data.game} tip` })
        .setTitle(data.section)
        .setDescription(data.tip)
        .setURL(data.url)
        .addFields({ name: "\u200B", value: `[Read full guide →](${data.url})` })
        .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "tip", {
        query: game,
        game_query: game,
        game_matched: data.game,
        section_matched: data.section,
        response_found: true,
      });
    }
  } catch (error) {
    console.error("Discord bot error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Something went wrong. Please try again.");
    } else {
      await interaction.reply({ content: "Something went wrong. Please try again.", ephemeral: true });
    }

    await logUsage(interaction, interaction.commandName, {
      query: "error",
      response_found: false,
      section_matched: message.slice(0, 120),
    });
  }
});

registerCommands()
  .then(() => client.login(DISCORD_TOKEN))
  .catch((error) => {
    console.error("Startup failed:", error);
    process.exit(1);
  });
