const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const BOT_API_URL = process.env.BOT_API_URL;
const BOT_API_KEY = process.env.BOT_API_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required");
if (!DISCORD_CLIENT_ID) throw new Error("DISCORD_CLIENT_ID is required");
if (!BOT_API_URL) throw new Error("BOT_API_URL is required");
if (!BOT_API_KEY) throw new Error("BOT_API_KEY is required");

const commands = [
  new SlashCommandBuilder()
    .setName("guide")
    .setDescription("Ask a question about any game — AI reads the guide and answers")
    .addStringOption((o) =>
      o.setName("game").setDescription('Game name (e.g. "elden ring", "zelda totk")').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("topic").setDescription('Your question (e.g. "how to beat malenia", "best build")').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search across all 1,494 game guides")
    .addStringOption((o) =>
      o.setName("query").setDescription('Your search (e.g. "fire resistance", "secret ending")').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("tip")
    .setDescription("Get a random pro gaming tip")
    .addStringOption((o) => o.setName("game").setDescription("Game name").setRequired(true)),
  new SlashCommandBuilder()
    .setName("boss")
    .setDescription("Quick boss fight strategy — weakness, tips, recommended level")
    .addStringOption((o) => o.setName("game").setDescription('Game name (e.g. "elden ring")').setRequired(true))
    .addStringOption((o) =>
      o.setName("boss").setDescription('Boss name (e.g. "malenia", "ganondorf")').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("game")
    .setDescription("Get info about any game — rating, platforms, genres, guide sections")
    .addStringOption((o) => o.setName("name").setDescription('Game name (e.g. "elden ring")').setRequired(true)),
  new SlashCommandBuilder()
    .setName("compare")
    .setDescription("Compare two games side by side — rating, genres, AI verdict")
    .addStringOption((o) => o.setName("game1").setDescription("First game").setRequired(true))
    .addStringOption((o) => o.setName("game2").setDescription("Second game").setRequired(true)),
  new SlashCommandBuilder()
    .setName("trending")
    .setDescription("See which games are trending — based on real search traffic"),
  new SlashCommandBuilder().setName("quiz").setDescription("Random gaming trivia — test your knowledge!"),
  new SlashCommandBuilder().setName("invite").setDescription("Add this bot to your own Discord server"),
  new SlashCommandBuilder().setName("konami").setDescription("👀"),
].map((command) => command.toJSON());

const BRAND_PURPLE = 0x8b5cf6;
const BRAND_PINK = 0xec4899;
const BRAND_AMBER = 0xfb923c;
const BRAND_RED = 0xff4444;
const BRAND_GOLD = 0xfbbf24;
const BRAND_GREEN = 0x4ade80;

// Helper to render an easter egg embed + follow up with real answer
async function renderEasterEgg(interaction, egg, data, isSearch = false) {
  const eggEmbed = new EmbedBuilder()
    .setColor(egg.color || BRAND_PURPLE)
    .setTitle(egg.title)
    .setDescription(egg.ascii ? `\`\`\`\n${egg.ascii}\n\`\`\`\n${egg.message}` : egg.message)
    .setFooter({ text: egg.footer || "antmag.net — you found a secret! 🥚" });

  if (egg.guideLink && egg.guideName) {
    eggEmbed.addFields({
      name: egg.guideName,
      value: `[→ antmag.net${egg.guideLink}](https://www.antmag.net${egg.guideLink})`,
    });
  }

  await interaction.editReply({ embeds: [eggEmbed] });

  // Follow up with real answer
  const answer = data.answer;
  const sections = isSearch ? data.results : data.sections;

  if (answer || (sections && sections.length > 0)) {
    const followEmbed = new EmbedBuilder()
      .setColor(BRAND_PURPLE)
      .setTitle(isSearch ? `🔍 Search results` : `📖 ${data.game || data.game_title || "Results"}`)
      .setFooter({ text: "antmag.net — AI-verified gaming guides" });

    if (answer) followEmbed.setDescription(answer.slice(0, 2000));

    const items = (sections || []).slice(0, 3);
    if (items.length > 0) {
      followEmbed.addFields(
        items.map((s) => ({
          name: s.title || s.game_title || "Section",
          value: `[Read more →](${s.url?.startsWith("http") ? s.url : `https://www.antmag.net${s.url}`})`,
          inline: true,
        })),
      );
    }

    await interaction.followUp({ embeds: [followEmbed] });
  }
}

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

  const headers = {
    "x-api-key": BOT_API_KEY,
    "Content-Type": "application/json",
  };
  if (SUPABASE_ANON_KEY) {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
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
    await callBotApi("log", {}, "POST", {
      server_id: interaction.guildId,
      server_name: interaction.guild?.name ?? null,
      channel_id: interaction.channelId,
      user_id: interaction.user?.id ?? null,
      command,
      ...payload,
    });
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
  // Handle quiz reveal button
  if (interaction.isButton() && interaction.customId === "quiz_reveal") {
    try {
      const existingEmbed = interaction.message.embeds[0];

      const answerRaw = existingEmbed?.fields?.find((f) => f.name === "🔒 Answer")?.value;
      const answer = answerRaw?.replace(/\|\|/g, "") || "Check the guide for the answer!";

      const answerEmbed = new EmbedBuilder()
        .setColor(BRAND_GREEN)
        .setTitle(`✅ Answer revealed!`)
        .setDescription(answer)
        .setFooter({ text: "antmag.net — AI-verified gaming guides" });

      if (existingEmbed?.url) {
        answerEmbed.addFields({
          name: "Full guide",
          value: `[Read more →](${existingEmbed.url})`,
        });
      }

      await interaction.update({ embeds: [answerEmbed], components: [] });
    } catch (e) {
      console.error("Quiz reveal error:", e.message);
      await interaction.reply({ content: "Couldn't reveal the answer.", ephemeral: true });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    // -------------------------------------------------------------------
    // /guide — AI-powered guide answers
    // -------------------------------------------------------------------
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

      // Easter egg check
      if (data.easterEgg) {
        await renderEasterEgg(interaction, data.easterEgg, data);
        await logUsage(interaction, "guide", {
          query: `${game} ${topic}`.trim(),
          game_query: game,
          topic_query: topic,
          game_matched: data.game,
          section_matched: "easter_egg",
          response_found: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND_PURPLE)
        .setAuthor({ name: data.game, url: `https://www.antmag.net/guide/${data.game_slug}` })
        .setFooter({ text: `antmag.net — AI-verified guides for ${data.game}` })
        .setTimestamp();

      if (data.cover_image) embed.setThumbnail(data.cover_image);

      if (data.answer) {
        embed.setTitle(`📖 ${data.section}`);
        embed.setDescription(data.answer.slice(0, 4000));
        embed.setURL(data.url);

        const sourceSections = (data.sections || []).slice(0, 3);
        if (sourceSections.length > 0) {
          embed.addFields(
            sourceSections.map((s) => ({
              name: s.title,
              value: `[Read full section →](https://www.antmag.net${s.url})`,
              inline: true,
            })),
          );
        }
      } else {
        embed.setTitle(data.section);
        embed.setDescription((data.excerpt || "").slice(0, 400));
        embed.setURL(data.url);

        if (Array.isArray(data.related_sections) && data.related_sections.length > 0) {
          embed.addFields({
            name: "Related sections",
            value: data.related_sections.map((section) => `• ${section.title}`).join("\n"),
          });
        }
        embed.addFields({ name: "\u200B", value: `[Read full guide →](${data.url})` });
      }

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

    // -------------------------------------------------------------------
    // /search — AI-powered search
    // -------------------------------------------------------------------
    if (interaction.commandName === "search") {
      await interaction.deferReply();
      const query = interaction.options.getString("query", true);
      const data = await callBotApi("search", { q: query });

      // Easter egg check
      if (data.easterEgg) {
        await renderEasterEgg(interaction, data.easterEgg, data, true);
        await logUsage(interaction, "search", { query, section_matched: "easter_egg", response_found: true });
        return;
      }

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

      const embed = new EmbedBuilder()
        .setColor(BRAND_PINK)
        .setTitle(`Found ${data.total} matching sections`)
        .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" })
        .setTimestamp();

      if (data.answer) {
        embed.setDescription(data.answer.slice(0, 2000));
      }

      const resultLines = data.results.slice(0, 6).map((result, index) => {
        if (result.type === "game") {
          return `**${index + 1}.** 🎮 [${result.title}](${result.url}) — ${result.sections} sections`;
        }
        return `**${index + 1}.** 📖 [${result.title}](${result.url})${result.game ? ` — ${result.game}` : ""}`;
      });

      embed.addFields({
        name: "Results",
        value: resultLines.join("\n"),
      });

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "search", { query, response_found: true });
      return;
    }

    // -------------------------------------------------------------------
    // /tip
    // -------------------------------------------------------------------
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
      return;
    }

    // -------------------------------------------------------------------
    // /boss — Boss strategy
    // -------------------------------------------------------------------
    if (interaction.commandName === "boss") {
      await interaction.deferReply();
      const game = interaction.options.getString("game", true);
      const boss = interaction.options.getString("boss", true);
      const data = await callBotApi("boss", { game, boss });

      if (!data.found) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_RED)
              .setDescription(
                `No boss guide found for **${boss}** in **${game}**. Try \`/guide ${game} ${boss}\` instead.`,
              )
              .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" }),
          ],
        });
        await logUsage(interaction, "boss", { query: `${game} ${boss}`, response_found: false });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND_RED)
        .setTitle(`🏆 ${data.boss_name} — ${data.game_title}`)
        .setDescription(data.answer || "Boss strategy not found in our guides yet.")
        .setFooter({ text: `antmag.net — boss guides for ${data.game_title}` })
        .setURL(`https://www.antmag.net/guide/${data.game_slug}`);

      const sections = (data.sections || []).slice(0, 2);
      if (sections.length > 0) {
        embed.addFields(
          sections.map((s) => ({
            name: s.title,
            value: `[Full strategy →](https://www.antmag.net${s.url})`,
            inline: true,
          })),
        );
      }

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "boss", {
        query: `${game} ${boss}`,
        game_query: game,
        topic_query: boss,
        game_matched: data.game_title,
        response_found: true,
      });
      return;
    }

    // -------------------------------------------------------------------
    // /game — Game info card
    // -------------------------------------------------------------------
    if (interaction.commandName === "game") {
      await interaction.deferReply();
      const name = interaction.options.getString("name", true);
      const data = await callBotApi("game", { name });

      if (data.error) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_PURPLE)
              .setDescription(`Game not found: **${name}**. Try a different name.`)
              .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" }),
          ],
        });
        await logUsage(interaction, "game", { query: name, response_found: false });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(BRAND_PURPLE)
        .setTitle(`🎮 ${data.title}`)
        .setURL(`https://www.antmag.net${data.url}`)
        .setFooter({ text: "antmag.net — AI-verified gaming guides" });

      if (data.image) embed.setThumbnail(data.image);

      const fields = [];
      if (data.metacritic) fields.push({ name: "Metacritic", value: `${data.metacritic}`, inline: true });
      if (data.rating) fields.push({ name: "Rating", value: `⭐ ${data.rating}`, inline: true });
      fields.push({ name: "Guide sections", value: `${data.sections}`, inline: true });
      if (data.tags && data.tags.length > 0)
        fields.push({ name: "Tags", value: data.tags.slice(0, 4).join(", "), inline: false });
      if (data.platforms && data.platforms.length > 0)
        fields.push({ name: "Platforms", value: data.platforms.slice(0, 5).join(", "), inline: false });
      if (data.release_date) fields.push({ name: "Release", value: data.release_date, inline: true });

      embed.addFields(fields);

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "game", { query: name, game_matched: data.title, response_found: true });
      return;
    }

    // -------------------------------------------------------------------
    // /compare — Compare two games
    // -------------------------------------------------------------------
    if (interaction.commandName === "compare") {
      await interaction.deferReply();
      const game1 = interaction.options.getString("game1", true);
      const game2 = interaction.options.getString("game2", true);
      const data = await callBotApi("compare", { game1, game2 });

      if (data.error) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_PURPLE)
              .setDescription(`${data.error}. Make sure both game names are correct.`)
              .setFooter({ text: "ANTMAG.NET — AI-Verified Gaming Guides" }),
          ],
        });
        await logUsage(interaction, "compare", { query: `${game1} vs ${game2}`, response_found: false });
        return;
      }

      const g1 = data.game1;
      const g2 = data.game2;

      const embed = new EmbedBuilder()
        .setColor(BRAND_PURPLE)
        .setTitle(`📊 ${g1.title} vs ${g2.title}`)
        .setDescription(data.comparison || "Couldn't generate a comparison.")
        .addFields(
          {
            name: g1.title,
            value: `${g1.metacritic ? `Metacritic: ${g1.metacritic}` : ""}\n${(g1.tags || []).slice(0, 2).join(", ")}\n${g1.sections} guide sections\n[Guide →](https://www.antmag.net/guide/${g1.slug})`,
            inline: true,
          },
          {
            name: g2.title,
            value: `${g2.metacritic ? `Metacritic: ${g2.metacritic}` : ""}\n${(g2.tags || []).slice(0, 2).join(", ")}\n${g2.sections} guide sections\n[Guide →](https://www.antmag.net/guide/${g2.slug})`,
            inline: true,
          },
        )
        .setFooter({ text: "antmag.net — AI-verified gaming guides" });

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "compare", { query: `${game1} vs ${game2}`, response_found: true });
      return;
    }

    // -------------------------------------------------------------------
    // /trending — Trending games
    // -------------------------------------------------------------------
    if (interaction.commandName === "trending") {
      await interaction.deferReply();
      const data = await callBotApi("trending");

      const lines = (data.trending || [])
        .map((g, i) => `**${i + 1}.** ${g.title} — ${g.clicks_this_week} clicks (+${g.growth}%)`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(BRAND_PURPLE)
        .setTitle("🔥 Trending games this week")
        .setDescription(lines || "Not enough data yet — check back in a few days!")
        .setFooter({ text: "Based on real Google search traffic — antmag.net" });

      await interaction.editReply({ embeds: [embed] });
      await logUsage(interaction, "trending", { query: "trending", response_found: (data.trending || []).length > 0 });
      return;
    }

    // -------------------------------------------------------------------
    // /quiz — Gaming trivia
    // -------------------------------------------------------------------
    if (interaction.commandName === "quiz") {
      await interaction.deferReply();

      try {
        const data = await callBotApi("quiz");

        const embed = new EmbedBuilder()
          .setColor(BRAND_GOLD)
          .setTitle(`🧠 Gaming trivia — ${data.game_title}`)
          .setDescription(data.question)
          .addFields(
            { name: "💡 Hint", value: `||${data.hint}||`, inline: true },
            { name: "🎮 Game", value: data.game_title, inline: true },
            { name: "🔒 Answer", value: `||${data.answer}||`, inline: false },
          )
          .setURL(`https://www.antmag.net/guide/${data.game_slug}`)
          .setFooter({ text: "Click 'Show Answer' or check the spoiler above!" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("quiz_reveal").setLabel("Show Answer").setStyle(ButtonStyle.Primary),
        );

        await interaction.editReply({ embeds: [embed], components: [row] });

        // Auto-reveal after 30 seconds
        setTimeout(async () => {
          try {
            const msg = await interaction.fetchReply();
            if (msg.components.length > 0) {
              const revealEmbed = new EmbedBuilder()
                .setColor(BRAND_GREEN)
                .setTitle(`✅ Answer — ${data.game_title}`)
                .setDescription(data.answer)
                .addFields({
                  name: "Full guide",
                  value: `[Read more about ${data.game_title} →](https://www.antmag.net/guide/${data.game_slug})`,
                })
                .setFooter({ text: "antmag.net — AI-verified gaming guides" });
              await interaction.editReply({ embeds: [revealEmbed], components: [] });
            }
          } catch {
            // Message might have been deleted
          }
        }, 30_000);

        await logUsage(interaction, "quiz", { query: "quiz", game_matched: data.game_title, response_found: true });
      } catch (error) {
        console.error("/quiz error:", error.message);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(BRAND_PURPLE)
              .setTitle("🧠 Quiz unavailable right now")
              .setDescription("Try `/tip` for a gaming tip instead!")
              .setFooter({ text: "antmag.net" }),
          ],
        });
      }
      return;
    }

    // -------------------------------------------------------------------
    // /invite — Bot invite link
    // -------------------------------------------------------------------
    if (interaction.commandName === "invite") {
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=2147485696&scope=bot%20applications.commands`;

      const embed = new EmbedBuilder()
        .setColor(BRAND_PURPLE)
        .setTitle("🤖 Add AntMag to your server")
        .setDescription(
          `Want AI-powered game guides in your Discord? Add the bot with one click!\n\n**[Invite AntMag →](${inviteUrl})**\n\nSupports 1,494 games with /guide, /search, /boss, /tip, and more.`,
        )
        .addFields({
          name: "What you get",
          value:
            "• AI answers from real game guides\n• Boss fight strategies on demand\n• Trending games based on real search data\n• Random pro tips & trivia\n• All free, no ads",
        })
        .setFooter({ text: "antmag.net — AI-verified gaming guides" })
        .setURL(inviteUrl);

      await interaction.reply({ embeds: [embed] });
      await logUsage(interaction, "invite", { query: "invite", response_found: true });
      return;
    }

    // -------------------------------------------------------------------
    // /konami — Easter egg
    // -------------------------------------------------------------------
    if (interaction.commandName === "konami") {
      const eggs = [
        {
          title: "⬆️⬆️⬇️⬇️⬅️➡️⬅️➡️🅱️🅰️",
          description:
            "**30 lives unlocked!** ...just kidding. But you DID unlock the knowledge of 1,494 game guides. Use `/guide` wisely, young grasshopper.",
          color: BRAND_GOLD,
        },
        {
          title: "🎮 It's dangerous to go alone!",
          description:
            "Take this: **an entire database of game guides.** Over 92,000 sections of walkthroughs, boss strategies, and secrets. All verified by AI. Use `/guide` to start your quest.",
          color: BRAND_GREEN,
        },
        {
          title: "🕹️ Do a barrel roll!",
          description:
            "I would, but I'm a text-based bot. What I CAN do is tell you exactly how to beat any boss in 1,494 games. Try `/boss elden ring malenia` if you dare.",
          color: BRAND_PINK,
        },
        {
          title: "🍄 Thank you Mario!",
          description:
            "But your princess is in another castle... along with 92,375 guide sections. Try `/search princess` to find her.",
          color: 0xf87171,
        },
        {
          title: "⭐ Achievement unlocked!",
          description:
            "**Secret Bot Whisperer** — You found the hidden command. +100 gamer points. Now try `/quiz` to prove you actually know stuff.",
          color: BRAND_PURPLE,
        },
      ];

      const pick = eggs[Math.floor(Math.random() * eggs.length)];

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(pick.color)
            .setTitle(pick.title)
            .setDescription(pick.description)
            .setFooter({ text: "antmag.net — AI-verified gaming guides • you found the easter egg! 🥚" }),
        ],
      });
      await logUsage(interaction, "konami", { query: "konami", response_found: true });
      return;
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
