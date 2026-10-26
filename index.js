const {
  Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType
} = require("discord.js");
const fetch = require("node-fetch");
const axios = require("axios");
require("dotenv").config();

const JobQueue = require("./utils/queue");
const { runJob } = require("./utils/scriptRunner");
const launchCommand = require("./commands/launch");
const authCommand = require("./commands/auth");
const authListCommand = require("./commands/authlist");
const myAccountCommand = require("./commands/myaccount");
const historyCommand = require("./commands/history");
const statusCommand = require("./commands/status");
//const presenceCommand = require("./commands/presence");
const tasksCommand = require("./commands/tasks");
const { startNotificationListener } = require("./utils/notificationListener");
const configAlertesCommand = require("./commands/configAlertes");

// On active bien les 3 intentions nécessaires pour lire et répondre aux messages
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- FILE D'ATTENTE POUR /launch ---
// Un seul script Docker s'exécute à la fois ; les suivants patientent automatiquement.
const scriptQueue = new JobQueue(async (job) => {
  definirPresenceExecution(client, job.scriptConfig.name);
  await runJob(client, job);
  if (!scriptQueue.isBusy() || scriptQueue.size() === 0) {
    definirPresenceIdle(client);
  }
});

// --- CONFIGURATION VIKIDIA ---
const WIKI_API_URL = "https://fr.vikidia.org/w/api.php";
const WIKI_BOT_USERNAME = "BotCélian";
const WIKI_BOT_PASSWORD = process.env.WIKI_PASS || "Discord@sv8favr5881qgod2fbcsf9iq46ut7ibn";


function setStatutBot(statut) {
    // Fonction vide ou de log pour éviter le crash
    console.log("Statut du bot mis à jour :", statut);
}



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

// --- FONCTIONS DE PRÉSENCE ---
function definirPresenceExecution(clientInstance, nomScript) {
  try {
    clientInstance.user.setPresence({
      activities: [{ name: `Exécution : ${nomScript}`, type: ActivityType.Playing }],
      status: "dnd", // Ne pas déranger pendant l'exécution d'un job
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour de la présence (exécution) :", err);
  }
}

function definirPresenceIdle(clientInstance) {
  try {
    clientInstance.user.setPresence({
      activities: [{ name: "Vikidia & BotCelian", type: ActivityType.Watching }],
      status: "online",
    });
  } catch (err) {
    console.error("Erreur lors de la mise à jour de la présence (idle) :", err);
  }
}


// Event Ready
client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  setStatutBot("en ligne"); // si tu as ajouté ce hook Firestore précédemment
  //demarrerPresence(client, scriptQueue);
  startNotificationListener(client);
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
          headers: { 'Cookie': sessionCookies, 'User-Agent': 'BotCelianDiscord/1.0' }
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

    // ----- NOUVELLE COMMANDE : /launch -----
    if (interaction.commandName === "launch") {
      await launchCommand.handleLaunchCommand(interaction);
      return;
    }

    // ----- NOUVELLE COMMANDE : /auth -----
    if (interaction.commandName === "auth") {
      await authCommand.handleAuthCommand(interaction);
      return;
    }
    if (interaction.commandName === "config-alertes") {
        await configAlertesCommand.handleConfigAlertesCommand(interaction);
        return;
    }
    if (interaction.commandName === "my-account") {
      await myAccountCommand.handleMyAccountCommand(interaction);
      return;
    }
    if (interaction.commandName === "history") {
      await historyCommand.handleHistoryCommand(interaction);
      return;
    }
    if (interaction.commandName === "a-faire") {
      await tasksCommand.handleTachesCommand(interaction);
      return;
    }
    if (interaction.commandName === "status") {
      await statusCommand.handleStatusCommand(interaction, scriptQueue);
      return;
    }
    //if (interaction.commandName === "presence") {
  //    await presenceCommand.handlePresenceCommand(interaction, client);
  //    return;
  //  }

    if (interaction.commandName === "auth-liste") {
      await authListCommand.handleAuthListeCommand(interaction);
      return;
    }
  }

  // ----- 2. BOUTONS -----
  if (interaction.isButton()) {
    // Les boutons /config-alertes encodent la langue après ":" (ex: "config-alertes-goto-ntfy:fr")
    const [configAlertesBtnId, configAlertesBtnLang] = interaction.customId.split(":");

    if (configAlertesBtnId === configAlertesCommand.BUTTON_NTFY_ID) {
      await configAlertesCommand.handleConfigAlertesNtfyButton(interaction);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_GOTO_NTFY_ID) {
      await configAlertesCommand.handleConfigAlertesGotoNtfy(interaction, configAlertesBtnLang);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_GOTO_DISCORD_ID) {
      await configAlertesCommand.handleConfigAlertesGotoDiscord(interaction, configAlertesBtnLang);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_GOTO_LANG_ID) {
      await configAlertesCommand.handleConfigAlertesGotoLang(interaction);
      return;
    }

    // Raccourcis "Tout activer / Tout désactiver" par langue
    if (configAlertesBtnId === configAlertesCommand.BUTTON_LANG_TOUT_ACTIVER_ID) {
      await configAlertesCommand.handleConfigAlertesLangToutActiver(interaction, configAlertesBtnLang);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_LANG_TOUT_DESACTIVER_ID) {
      await configAlertesCommand.handleConfigAlertesLangToutDesactiver(interaction, configAlertesBtnLang);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_LANG_NTFY_TOUT_ACTIVER_ID) {
      await configAlertesCommand.handleConfigAlertesLangNtfyToutActiver(interaction, configAlertesBtnLang);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_LANG_NTFY_TOUT_DESACTIVER_ID) {
      await configAlertesCommand.handleConfigAlertesLangNtfyToutDesactiver(interaction, configAlertesBtnLang);
      return;
    }

    // Raccourcis "Tout activer / Tout désactiver" globaux (toutes langues)
    if (configAlertesBtnId === configAlertesCommand.BUTTON_TOUT_ACTIVER_MP_ID) {
      await configAlertesCommand.handleConfigAlertesToutActiverMp(interaction);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_TOUT_DESACTIVER_MP_ID) {
      await configAlertesCommand.handleConfigAlertesToutDesactiverMp(interaction);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_TOUT_ACTIVER_NTFY_ID) {
      await configAlertesCommand.handleConfigAlertesToutActiverNtfy(interaction);
      return;
    }
    if (configAlertesBtnId === configAlertesCommand.BUTTON_TOUT_DESACTIVER_NTFY_ID) {
      await configAlertesCommand.handleConfigAlertesToutDesactiverNtfy(interaction);
      return;
    }
  }

  // ----- 3. MODALS -----
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "suggestionModal") {
      const suggestion = interaction.fields.getTextInputValue("suggestionInput");
      try {
        const channel = await client.channels.fetch("1417904449510183000");
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
      return;
    }

    if (interaction.customId === configAlertesCommand.MODAL_NTFY_ID) {
      await configAlertesCommand.handleConfigAlertesNtfyModal(interaction);
      return;
    }

    if (interaction.customId.startsWith("presence_modal_")) {
      await presenceCommand.handlePresenceModalSubmit(interaction);
      return;
    }
    return;
  }

  // ----- 4. SELECT MENUS (dont /launch) -----
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === launchCommand.SELECT_MENU_ID) {
      await launchCommand.handleLaunchSelect(interaction, scriptQueue);
      return;
    }

    // Les select menus /config-alertes encodent la langue après ":" (ex: "config-alertes-types-select:fr")
    const [configAlertesSelectId, configAlertesSelectLang] = interaction.customId.split(":");

    if (configAlertesSelectId === configAlertesCommand.SELECT_ID_LANG) {
       await configAlertesCommand.handleConfigAlertesLangSelect(interaction);
       return;
    }
    if (configAlertesSelectId === configAlertesCommand.SELECT_ID_TYPES) {
       await configAlertesCommand.handleConfigAlertesTypesSelect(interaction, configAlertesSelectLang);
       return;
    }
    if (configAlertesSelectId === configAlertesCommand.SELECT_ID_NTFY_TYPES) {
       await configAlertesCommand.handleConfigAlertesNtfyTypesSelect(interaction, configAlertesSelectLang);
       return;
    }

    // ---- Presence ----
    if (interaction.customId === "presence_action") {
      await presenceCommand.handlePresenceAction(interaction);
      return;
    }
    if (interaction.customId === "presence_supprimer_select") {
      await presenceCommand.handlePresenceSupprimerSelect(interaction);
      return;
    }
    if (interaction.customId.startsWith("presence_type_")) {
      await presenceCommand.handlePresenceTypeSelect(interaction);
      return;
    }
    if (interaction.customId.startsWith("presence_statut_")) {
      await presenceCommand.handlePresenceStatutSelect(interaction);
      return;
    }
  }
});

// Déclenché à chaque fois qu'un message est envoyé
// Remplacez cette valeur par votre propre ID Discord
const MON_ID_DISCORD = "1368627541665124484";

// Configuration des réponses par utilisateur
const reponsesParUtilisateur = {
  // Vos phrases (Allégeance / Créateur)
  [MON_ID_DISCORD]: [
    "À vos ordres, mon seigneur. Que puis-je faire pour vous ?",
    "Gloire à mon créateur ! Je suis entièrement à votre disposition.",
    "Vous m'avez invoqué, maître ? Votre volonté est ma priorité absolue.",
    "Oui maître ?",
    "Désolé Célian, je suis parti en vacances avec <@1458350313663758346>",
    "Mais, mais, j'ai dit que je faisais grève"
  ],

  // Identifiant du deuxième utilisateur
  "1397843398953664523": [
    "Bonjour Janus ! Ça va ?",
    "On a pris des vacances avec <@1458350313663758346>, c'est pour ça qu'il est plus là.",
    "👀 tiens, j'ai failli te confondre avec ton frère ^^.",
    "En grève avec <@1458350313663758346>."
  ],

  // Identifiant du deuxième utilisateur
  "962754428690124810": [
    "Bonjour Bulest !",
    "Je peux pas répondre, je joue à OpenTTD",
    " Ça avance la carte du future réseau de LGV français ?",
    "Une photo de coucher de soleil 🥺?"
  ],

  // Identifiant d'un troisième utilisateur (ex: un ami à troller)
  "1449856230238589159": [
    "Oh non, pas encore toi...",
    "Alerte générale, l'indésirable vient de me pinger.",
    "Je suis actuellement indisponible pour toi."
  ],
  // Identifiant d'un troisième utilisateur (ex: )
  "290248460496797696": [
    "Salut Linedwell !",
    "Je crois que LinedBot ne m'aime pas 😢.",
    "(⁠≧⁠▽⁠≦⁠)"
  ],
  // Identifiant d'un troisième utilisateur (ex: )
  "1424064908244422668": [
    "🍪",
    "👀besoin de moi pour débrancher BotJanus ?",
    "(⁠◠⁠‿⁠◕⁠)"
  ],
  "267255230108925952": [
    "Tiens, Rififile le fric !",
    "😸"
  ]
};

// Réponses par défaut pour tous les autres utilisateurs
const reponsesSoloParDefaut = [
  "Oui, bonjour. Je suis un robot ultra-perfectionné et tu m'as pingé pour... rien ?",
  "Ah, encore un ping. Ma journée vient d'atteindre son apogée. Merci pour ce moment.",
  "Félicitations, tu as trouvé la touche @ sur ton clavier. Tu veux une médaille ?",
  "Erreur 404 : Flemme",
  "Je sais que je suis le plus beau, pas besoin de me ping"
];

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.mentions.has(client.user)) {
    const autresMentions = message.mentions.users.filter(user => user.id !== client.user.id);

    // CAS 1 : Plusieurs mentions
    if (autresMentions.size > 0) {
      const cible = autresMentions.first();
      const reponsesDuo = [
        `Pourquoi tu impliques ${cible} là-dedans ? Laisse ce pauvre membre tranquille !`,
        `Je vois... Un complot entre ${message.author} et ${cible}. Je garde un œil sur vous. 👁️`,
      ];
      const reponseChoisie = reponsesDuo[Math.floor(Math.random() * reponsesDuo.length)];
      return message.reply(reponseChoisie);
    }

    // CAS 2 : Ping solo d'un utilisateur spécifique enregistré
    const reponsesPerso = reponsesParUtilisateur[message.author.id];
    if (reponsesPerso) {
      const reponseChoisie = reponsesPerso[Math.floor(Math.random() * reponsesPerso.length)];
      return message.reply(reponseChoisie);
    }

    // CAS 3 : Ping solo par défaut
    const reponseAleatoire = reponsesSoloParDefaut[Math.floor(Math.random() * reponsesSoloParDefaut.length)];
    await message.reply(reponseAleatoire);
  }
});


client.login(process.env.TOKEN);

