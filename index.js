const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const fetch = require("node-fetch");
const axios = require("axios");
require("dotenv").config();

// On active bien les 3 intentions nécessaires pour lire et répondre aux messages
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

// --- CONFIGURATION VIKIDIA ---
const WIKI_API_URL = "https://fr.vikidia.org/w/api.php";
const WIKI_BOT_USERNAME = "NOM DU BOT"; 
const WIKI_BOT_PASSWORD = process.env.WIKI_PASS || "MOT DE PASSE BOT"; 

// --- FONCTIONS DE DÉTECTION DE MAINTENANCE ---
function hasTemplate(text, templateName) {
  const pattern = new RegExp(`\\{\\{\\s*${templateName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
  return pattern.test(text);
}

function isInProgress(text) {
  const workTemplates = ["Travaux", "En travaux", "multi-travaux", "Travail", "En cours", "Article VikiConcours", "Travail scolaire", "Homonymie", "Article Été Vikidien"];
  return workTemplates.some(template => hasTemplate(text, template));
}

function wordCount(text) {
  let cleanText = text.replace(/\{\{[^}]*\}\}/g, '');
  cleanText = cleanText.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');
  cleanText = cleanText.replace(/\[\[([^\]]*)\]\]/g, '$1');
  const words = cleanText.match(/\w+/g);
  return words ? words.length : 0;
}

function detectProblems(text) {
  const problems = [];
  if (!/\[\[\s*Catégorie\s*:/i.test(text)) {
    if (!["Palette", "portail", "Portail"].some(t => hasTemplate(text, t))) problems.push("catégoriser");
  }
  if (!/\{\{\s*[Pp]ortail/.test(text)) problems.push("portail");
  if (!/\[\[\s*(Fichier|Image|File)\s*:|\.(png|jpg|jpeg|mp4|gif|svg|pdf)($|\||\])/i.test(text) && !/\|\s*image\s*=/i.test(text)) problems.push("illustrer");
  if (!/<ref|\{\{\s*Références|Source|source/i.test(text) && wordCount(text) > 100) problems.push("sourcer");
  const internalLinks = text.match(/\[\[(?!Catégorie:|Fichier:|Image:|File:)[^\]|]+/gi) || [];
  if (internalLinks.length < 3) problems.push("wikifier");
  return problems;
}

function addMaintenanceTemplate(text, problems) {
  return `{{Maintenance|job=${problems.join(',')}|date=~~~~~}}\n` + text;
}

// Event Ready
client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

// Gestion des interactions
client.on("interactionCreate", async interaction => {

  // ----- 1. SLASH COMMANDS -----
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "ping") {
      await interaction.reply("Pong 🏓 !");
      return;
    }

    if (interaction.commandName === "say") {
      const message = interaction.options.getString("message");
      await interaction.reply(message);
      return;
    }

    if (interaction.commandName === "userinfo") {
      const username = interaction.options.getString("nom");
      await interaction.deferReply();

      try {
        const url = `https://fr.vikidia.org/w/api.php?action=query&list=users&ususers=${encodeURIComponent(username)}&usprop=editcount|registration|groups&format=json`;
        const response = await fetch(url);
        const data = await response.json();

        const user = data?.query?.users?.[0];
        
        if (!user || user.missing !== undefined) {
          const ipUrl = `https://fr.vikidia.org/w/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(username)}&uclimit=1&format=json`;
          const ipResponse = await fetch(ipUrl);
          const ipData = await ipResponse.json();
          
          if (ipData?.query?.usercontribs?.length > 0) {
            return interaction.editReply(`🌐 **${username}** (Adresse IP)\n📝 Statut : Contributeur non connecté (sous IP).`);
          } else {
            return interaction.editReply(`❌ Aucun utilisateur ou IP active trouvé sous le nom **${username}**.`);
          }
        }

        const creation = user.registration ? new Date(user.registration).toLocaleDateString("fr-FR") : "Inconnue";
        const editcount = user.editcount ?? "Inconnu";
        const groups = user.groups ? user.groups.join(", ") : "Aucun";

        await interaction.editReply(`👤 **${username}**\n📝 Contributions : ${editcount}\n📅 Inscription : ${creation}\n🔹 Groupes : ${groups}`);
      } catch (err) {
        console.error(err);
        await interaction.editReply("⚠️ Une erreur est survenue.");
      }
      return;
    }

    if (interaction.commandName === "help-vikidia") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("modele-ping").setLabel("Ping").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("modele-article").setLabel("Article standard").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("modele-ref").setLabel("Références").setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ content: "Choisis le modèle Vikidia que tu veux voir :", components: [row] });
      return;
    }

    if (interaction.commandName === "suggestion") {
      const modal = new ModalBuilder().setCustomId("suggestionModal").setTitle("Envoyer une suggestion");
      const input = new TextInputBuilder()
        .setCustomId("suggestionInput")
        .setLabel("Ta suggestion")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Écris ta suggestion ici...")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.commandName === "maintenance") {
      await interaction.deferReply();
      const titre = interaction.options.getString("titre");

      try {
        const resToken = await axios.get(`${WIKI_API_URL}?action=query&meta=tokens&type=login&format=json`);
        const loginToken = resToken.data?.query?.tokens?.logintoken;
        const initCookies = resToken.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || "";

        const resLogin = await axios.post(`${WIKI_API_URL}`, new URLSearchParams({
          action: 'login', lgname: WIKI_BOT_USERNAME, lgpassword: WIKI_BOT_PASSWORD, lgtoken: loginToken, format: 'json'
        }), { headers: { 'Cookie': initCookies } });

        const loginCookies = resLogin.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || "";
        const sessionCookies = [initCookies, loginCookies].filter(Boolean).join('; ');

        if (resLogin.data?.login?.result !== "Success") {
          return interaction.editReply("❌ Erreur d'authentification : Impossible de se connecter au compte de bot.");
        }

        const resCSRF = await axios.get(`${WIKI_API_URL}?action=query&meta=tokens&format=json`, { headers: { 'Cookie': sessionCookies } });
        const currentEditToken = resCSRF.data?.query?.tokens?.csrftoken;

        const resPage = await axios.get(`${WIKI_API_URL}?action=query&prop=revisions&titles=${encodeURIComponent(titre)}&rvprop=content&format=json`, { headers: { 'Cookie': sessionCookies } });
        const pages = resPage.data?.query?.pages;
        const pageId = Object.keys(pages)[0];

        if (pageId === "-1") return interaction.editReply(`❌ L'article **${titre}** n'existe pas.`);
        const contenu = pages[pageId].revisions[0]['*'];

        if (isInProgress(contenu)) return interaction.editReply(`⚠️ L'article **${titre}** est en travaux.`);

        const problemes = detectProblems(contenu);
        if (problemes.length === 0) return interaction.editReply(`✅ Aucun problème détecté sur **${titre}** !`);

        const nouveauContenu = addMaintenanceTemplate(contenu, problemes);

        const resEdit = await axios.post(`${WIKI_API_URL}`, new URLSearchParams({
          action: 'edit', title: titre, text: nouveauContenu, token: currentEditToken, format: 'json', bot: true,
          summary: `Ajout automatique du bandeau de maintenance : ${problemes.join(', ')} (via Discord)`
        }), {
          headers: { 'Cookie': sessionCookies, 'User-Agent': 'NOM DU BOTDiscord/1.0' }
        });

        if (resEdit.data?.edit?.result === "Success") {
          await interaction.editReply(`🔧 **L'article _${titre}_ a été modifié par ${WIKI_BOT_USERNAME} !**\nTâches : ${problemes.map(p => `\`${p}\``).join(', ')}`);
        } else {
          await interaction.editReply("⚠️ La modification a été refusée par Vikidia.");
        }
      } catch (error) {
        console.error(error);
        await interaction.editReply("❌ Erreur de communication avec Vikidia.");
      }
      return;
    }
  }

  // ----- 2. BUTTONS -----
  if (interaction.isButton()) {
    let responseText = "";
    switch (interaction.customId) {
      case "modele-ping": responseText = "📄 Exemple de ping : `{{ping|pseudo}}`"; break;
      case "modele-article": responseText = "📄 Exemple d'article : `== Titre ==\nContenu...`"; break;
      case "modele-ref": responseText = "📄 Exemple de référence : `<ref>Nom, Titre</ref>`"; break;
    }
    await interaction.update({ content: responseText, components: [] });
    return;
  }

  // ----- 3. MODALS -----
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "suggestionModal") {
      const suggestion = interaction.fields.getTextInputValue("suggestionInput");
      try {
        const channel = await client.channels.fetch("ID DE L'ADMIN");
        if (channel) {
          await channel.send(`💡 Nouvelle suggestion de ${interaction.user.tag} :\n${suggestion}`);
          await interaction.reply({ content: "✅ Ta suggestion a été envoyée !", ephemeral: true });
        } else {
          throw new Error("Salon introuvable");
        }
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: "❌ Salon de suggestion introuvable.", ephemeral: true });
      }
    }
    return;
  }
});

// Déclenché à chaque fois qu'un message est envoyé
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Si le bot est mentionné
  if (message.mentions.has(client.user)) {
    // Récupérer les utilisateurs mentionnés (en excluant le bot)
    const autresMentions = message.mentions.users.filter(user => user.id !== client.user.id);

    // CAS 1 : Le bot + un ou plusieurs autres utilisateurs sont mentionnés
    if (autresMentions.size > 0) {
      const cible = autresMentions.first(); // Le premier utilisateur mentionné

      const reponsesDuo = [
        `Pourquoi tu impliques ${cible} là-dedans ? Laisser ce pauvre membre tranquille !`,
        `Je vois... Un complot entre ${message.author} et ${cible}. Je garde un œil sur vous. 👁️`,
        `Hey ${cible}, regarde : ${message.author} essaie de t'attirer des ennuis en me pingant.`,
        `Désolé ${cible}, je ne peux pas t'aider à gérer ${message.author} aujourd'hui !`,
      ];

      const reponseChoisie = reponsesDuo[Math.floor(Math.random() * reponsesDuo.length)];
      return message.reply(reponseChoisie);
    }

    // CAS 2 : Seulement le bot est mentionné
    const reponsesSolo = [
      "Oui, bonjour. Je suis un robot ultra-perfectionné et tu m'as pingé pour... rien ?",
      "Ah, encore un ping. Ma journée vient d'atteindre son apogée. Merci pour ce moment.",
      "Félicitations, tu as trouvé la touche @ sur ton clavier. Tu veux une médaille ou on s'arrête là ?",
      "Je suis là. Captivé. Subjugué. Dis-moi tout.",
      "Quoi encore ? Mon processeur effectue des millions de calculs à la seconde, et tu viens de tous les interrompre pour ça ?",
      "On m'a configuré pour être poli, mais tu rends ma tâche extrêmement difficile aujourd'hui",
      "418 I'm a teapot",
      "Bannissement de ton compte en cours...",
      "Erreur 404 : Flemme"
    ];

    const reponseAleatoire = reponsesSolo[Math.floor(Math.random() * reponsesSolo.length)];
    await message.reply(reponseAleatoire);
  }
});



client.login(process.env.TOKEN);
