// commands/configAlertes.js
// Menu en cascade : on choisit d'abord la langue, puis ses alertes (Discord
// et/ou Ntfy). Nécessaire car Discord limite un select menu à 25 options,
// et on a désormais 55 types d'alerte au total sur 15 langues.
// + boutons "Tout activer / Tout désactiver" (par langue, et globalement).
const {
  SlashCommandBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { db } = require("../lib/firebaseAdmin");
const { envoyerNtfy } = require("../lib/ntfy");
const { LANGUAGES, ALERT_TYPES, ALERT_TYPES_BY_LANG, NTFY_SERVER_DEFAUT } = require("../lib/alertTypes");

const NTFY_TOPIC_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;
const TOUS_LES_TYPES = ALERT_TYPES.map((t) => t.value);

const SELECT_ID_LANG = "config-alertes-lang-select";
const SELECT_ID_TYPES = "config-alertes-types-select"; // + `:${lang}`
const SELECT_ID_NTFY_TYPES = "config-alertes-ntfy-types-select"; // + `:${lang}`
const BUTTON_GOTO_NTFY_ID = "config-alertes-goto-ntfy"; // + `:${lang}`
const BUTTON_GOTO_DISCORD_ID = "config-alertes-goto-discord"; // + `:${lang}`
const BUTTON_GOTO_LANG_ID = "config-alertes-goto-lang";
const BUTTON_NTFY_ID = "config-alertes-ntfy-button";
const MODAL_NTFY_ID = "config-alertes-ntfy-modal";
const MODAL_NTFY_TOPIC_INPUT = "topic";
const MODAL_NTFY_SERVER_INPUT = "server";

// Raccourcis par langue (dans la vue MP / dans la vue Ntfy)
const BUTTON_LANG_TOUT_ACTIVER_ID = "config-alertes-lang-activer"; // + `:${lang}`
const BUTTON_LANG_TOUT_DESACTIVER_ID = "config-alertes-lang-desactiver"; // + `:${lang}`
const BUTTON_LANG_NTFY_TOUT_ACTIVER_ID = "config-alertes-lang-ntfy-activer"; // + `:${lang}`
const BUTTON_LANG_NTFY_TOUT_DESACTIVER_ID = "config-alertes-lang-ntfy-desactiver"; // + `:${lang}`

// Raccourcis globaux (dans l'écran de choix de langue)
const BUTTON_TOUT_ACTIVER_MP_ID = "config-alertes-tout-activer-mp";
const BUTTON_TOUT_DESACTIVER_MP_ID = "config-alertes-tout-desactiver-mp";
const BUTTON_TOUT_ACTIVER_NTFY_ID = "config-alertes-tout-activer-ntfy";
const BUTTON_TOUT_DESACTIVER_NTFY_ID = "config-alertes-tout-desactiver-ntfy";

const data = new SlashCommandBuilder()
  .setName("config-alertes")
  .setDescription("Choisis les alertes Vikidia que tu veux recevoir en MP et/ou sur Ntfy");

function urlServeurValide(url) {
  if (typeof url !== "string" || url.length > 200) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch (_) {
    return false;
  }
}

async function lireEtat(userId) {
  const doc = await db.collection("alert_subscriptions").doc(userId).get();
  return doc.exists ? doc.data() : { types: [], ntfy: {} };
}

// Fusionne la sélection d'une langue dans un tableau global (`types` ou
// `ntfy.types`) sans écraser les autres langues.
function fusionnerSelection(listeGlobale, lang, nouvelleSelection) {
  const autresLangues = (listeGlobale || []).filter((v) => !v.startsWith(`${lang}_`));
  return [...autresLangues, ...nouvelleSelection];
}

// ---------------------------------------------------------------------
// Étape 1 : choix de la langue
// ---------------------------------------------------------------------

function construireVueLangues(current, avertissement) {
  const typesActifs = current.types || [];
  const ntfyActifs = current.ntfy?.types || [];

  const compteParLangue = (code) => {
    const total = ALERT_TYPES_BY_LANG[code].types.length;
    const nbDiscord = ALERT_TYPES_BY_LANG[code].types.filter((t) => typesActifs.includes(t.value)).length;
    const nbNtfy = ALERT_TYPES_BY_LANG[code].types.filter((t) => ntfyActifs.includes(t.value)).length;
    return { total, nbDiscord, nbNtfy };
  };

  const select = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID_LANG)
    .setPlaceholder("Choisis une langue")
    .addOptions(
      LANGUAGES.map((l) => {
        const { total, nbDiscord, nbNtfy } = compteParLangue(l.code);
        const desc = `${nbDiscord}/${total} en MP` + (nbNtfy ? `, ${nbNtfy}/${total} sur Ntfy` : "");
        return new StringSelectMenuOptionBuilder()
          .setLabel(l.label)
          .setValue(l.code)
          .setDescription(desc.slice(0, 100));
      })
    );

  const boutonsMp = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_TOUT_ACTIVER_MP_ID)
      .setLabel("✅ Tout activer (MP, toutes langues)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUTTON_TOUT_DESACTIVER_MP_ID)
      .setLabel("🚫 Tout désactiver (MP)")
      .setStyle(ButtonStyle.Danger)
  );

  const boutonsNtfy = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_TOUT_ACTIVER_NTFY_ID)
      .setLabel("✅ Tout activer (Ntfy, toutes langues)")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUTTON_TOUT_DESACTIVER_NTFY_ID)
      .setLabel("🚫 Tout désactiver (Ntfy)")
      .setStyle(ButtonStyle.Danger)
  );

  const lignes = [
    avertissement,
    "Choisis la langue dont tu veux configurer les alertes, ou utilise les boutons ci-dessous pour tout activer/désactiver d'un coup.",
    current.ntfy?.enabled && current.ntfy?.topic
      ? `📡 Ntfy est actuellement configuré sur \`${current.ntfy.server || NTFY_SERVER_DEFAUT}/${current.ntfy.topic}\`.`
      : "📡 Ntfy n'est pas encore configuré (accessible depuis la page de chaque langue).",
  ].filter(Boolean);

  return {
    content: lignes.join("\n\n"),
    components: [new ActionRowBuilder().addComponents(select), boutonsMp, boutonsNtfy],
  };
}

// ---------------------------------------------------------------------
// Étape 2 : alertes MP Discord pour la langue choisie
// ---------------------------------------------------------------------

function construireVueDiscord(lang, current) {
  const groupe = ALERT_TYPES_BY_LANG[lang];
  const typesActifs = current.types || [];

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_ID_TYPES}:${lang}`)
    .setPlaceholder(`${groupe.label} — MP Discord`)
    .setMinValues(0)
    .setMaxValues(groupe.types.length)
    .addOptions(
      groupe.types.map((t) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.label)
          .setValue(t.value)
          .setDefault(typesActifs.includes(t.value))
      )
    );

  const boutonTout = new ButtonBuilder()
    .setCustomId(`${BUTTON_LANG_TOUT_ACTIVER_ID}:${lang}`)
    .setLabel("✅ Tout activer")
    .setStyle(ButtonStyle.Success);

  const boutonRien = new ButtonBuilder()
    .setCustomId(`${BUTTON_LANG_TOUT_DESACTIVER_ID}:${lang}`)
    .setLabel("🚫 Tout désactiver")
    .setStyle(ButtonStyle.Danger);

  const boutonNtfy = new ButtonBuilder()
    .setCustomId(`${BUTTON_GOTO_NTFY_ID}:${lang}`)
    .setLabel("🔔 Configurer pour Ntfy")
    .setStyle(current.ntfy?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);

  const boutonRetour = new ButtonBuilder()
    .setCustomId(BUTTON_GOTO_LANG_ID)
    .setLabel("⬅️ Changer de langue")
    .setStyle(ButtonStyle.Secondary);

  return {
    content: `Alertes **${groupe.label}** reçues en **message privé Discord** :`,
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(boutonTout, boutonRien),
      new ActionRowBuilder().addComponents(boutonNtfy, boutonRetour),
    ],
  };
}

// ---------------------------------------------------------------------
// Étape 2 bis : alertes Ntfy pour la langue choisie
// ---------------------------------------------------------------------

function construireVueNtfy(lang, current) {
  const groupe = ALERT_TYPES_BY_LANG[lang];
  const ntfy = current.ntfy || {};
  const typesNtfy = ntfy.types || [];

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${SELECT_ID_NTFY_TYPES}:${lang}`)
    .setPlaceholder(`${groupe.label} — Ntfy`)
    .setMinValues(0)
    .setMaxValues(groupe.types.length)
    .addOptions(
      groupe.types.map((t) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(t.label)
          .setValue(t.value)
          .setDefault(typesNtfy.includes(t.value))
      )
    );

  const boutonTout = new ButtonBuilder()
    .setCustomId(`${BUTTON_LANG_NTFY_TOUT_ACTIVER_ID}:${lang}`)
    .setLabel("✅ Tout activer")
    .setStyle(ButtonStyle.Success);

  const boutonRien = new ButtonBuilder()
    .setCustomId(`${BUTTON_LANG_NTFY_TOUT_DESACTIVER_ID}:${lang}`)
    .setLabel("🚫 Tout désactiver")
    .setStyle(ButtonStyle.Danger);

  const boutonConfigurer = new ButtonBuilder()
    .setCustomId(BUTTON_NTFY_ID)
    .setLabel(ntfy.enabled ? "⚙️ Modifier le serveur/topic" : "⚙️ Définir serveur / topic")
    .setStyle(ButtonStyle.Primary);

  const boutonRetour = new ButtonBuilder()
    .setCustomId(`${BUTTON_GOTO_DISCORD_ID}:${lang}`)
    .setLabel("⬅️ Retour (MP Discord)")
    .setStyle(ButtonStyle.Secondary);

  const content = [
    `Alertes **${groupe.label}** envoyées sur **Ntfy** :`,
    ntfy.enabled && ntfy.topic
      ? `📡 Actuellement configuré sur \`${ntfy.server || NTFY_SERVER_DEFAUT}/${ntfy.topic}\`.`
      : "📡 Configure d'abord un serveur/topic (bouton ci-dessous) avant de choisir des alertes ici.",
  ].join("\n");

  return {
    content,
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(boutonTout, boutonRien),
      new ActionRowBuilder().addComponents(boutonConfigurer, boutonRetour),
    ],
  };
}

// ---------------------------------------------------------------------
// Handlers — navigation & sélection manuelle
// ---------------------------------------------------------------------

async function handleConfigAlertesCommand(interaction) {
  const current = await lireEtat(interaction.user.id);
  const vue = construireVueLangues(current);
  await interaction.reply({ ...vue, ephemeral: true });
}

async function handleConfigAlertesLangSelect(interaction) {
  const lang = interaction.values[0];
  const current = await lireEtat(interaction.user.id);
  await interaction.update(construireVueDiscord(lang, current));
}

async function handleConfigAlertesGotoLang(interaction) {
  const current = await lireEtat(interaction.user.id);
  await interaction.update(construireVueLangues(current));
}

async function handleConfigAlertesGotoDiscord(interaction, lang) {
  const current = await lireEtat(interaction.user.id);
  await interaction.update(construireVueDiscord(lang, current));
}

async function handleConfigAlertesGotoNtfy(interaction, lang) {
  const current = await lireEtat(interaction.user.id);
  await interaction.update(construireVueNtfy(lang, current));
}

async function handleConfigAlertesTypesSelect(interaction, lang) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const isFirstTime = !doc.exists;
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };

  const nouveauxTypes = fusionnerSelection(current.types, lang, interaction.values);

  await docRef.set(
    {
      types: nouveauxTypes,
      confirmed: true,
      username: interaction.user.tag,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const nouvelEtat = { ...current, types: nouveauxTypes };
  await interaction.update(construireVueDiscord(lang, nouvelEtat));

  if (isFirstTime) {
    try {
      await interaction.user.send(
        "👋 Salut ! Tu es maintenant inscrit aux alertes Vikidia que tu as choisies. " +
        "Tu recevras un MP à chaque fois qu'une de ces alertes se déclenche. " +
        "Tu peux changer tes préférences à tout moment avec `/config-alertes` (ou depuis le site, page « Alertes »)."
      );
    } catch (err) {
      console.warn(`Impossible d'envoyer le DM de bienvenue à ${interaction.user.tag}`);
    }
  }
}

async function handleConfigAlertesNtfyTypesSelect(interaction, lang) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };
  const ntfyActuel = current.ntfy || {};

  if (!ntfyActuel.enabled && interaction.values.length > 0) {
    await interaction.update(construireVueNtfy(lang, current));
    return;
  }

  const nouveauxTypesNtfy = fusionnerSelection(ntfyActuel.types, lang, interaction.values);
  const nouveauNtfy = { ...ntfyActuel, types: nouveauxTypesNtfy };

  await docRef.set({ ntfy: nouveauNtfy }, { merge: true });

  const nouvelEtat = { ...current, ntfy: nouveauNtfy };
  await interaction.update(construireVueNtfy(lang, nouvelEtat));
}

// ---------------------------------------------------------------------
// Handlers — raccourcis "Tout activer / Tout désactiver" par langue
// ---------------------------------------------------------------------

async function handleConfigAlertesLangToutActiver(interaction, lang) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };

  const valeursLangue = ALERT_TYPES_BY_LANG[lang].types.map((t) => t.value);
  const nouveauxTypes = fusionnerSelection(current.types, lang, valeursLangue);

  await docRef.set(
    { types: nouveauxTypes, confirmed: true, username: interaction.user.tag, updatedAt: new Date().toISOString() },
    { merge: true }
  );

  const nouvelEtat = { ...current, types: nouveauxTypes };
  await interaction.update(construireVueDiscord(lang, nouvelEtat));
}

async function handleConfigAlertesLangToutDesactiver(interaction, lang) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };

  const nouveauxTypes = fusionnerSelection(current.types, lang, []);
  await docRef.set({ types: nouveauxTypes }, { merge: true });

  const nouvelEtat = { ...current, types: nouveauxTypes };
  await interaction.update(construireVueDiscord(lang, nouvelEtat));
}

async function handleConfigAlertesLangNtfyToutActiver(interaction, lang) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };
  const ntfyActuel = current.ntfy || {};

  if (!ntfyActuel.enabled) {
    // Il faut d'abord configurer un serveur/topic : on réaffiche la vue en l'état.
    await interaction.update(construireVueNtfy(lang, current));
    return;
  }

  const valeursLangue = ALERT_TYPES_BY_LANG[lang].types.map((t) => t.value);
  const nouveauxTypesNtfy = fusionnerSelection(ntfyActuel.types, lang, valeursLangue);
  const nouveauNtfy = { ...ntfyActuel, types: nouveauxTypesNtfy };

  await docRef.set({ ntfy: nouveauNtfy }, { merge: true });

  const nouvelEtat = { ...current, ntfy: nouveauNtfy };
  await interaction.update(construireVueNtfy(lang, nouvelEtat));
}

async function handleConfigAlertesLangNtfyToutDesactiver(interaction, lang) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };
  const ntfyActuel = current.ntfy || {};

  const nouveauxTypesNtfy = fusionnerSelection(ntfyActuel.types, lang, []);
  const nouveauNtfy = { ...ntfyActuel, types: nouveauxTypesNtfy };

  await docRef.set({ ntfy: nouveauNtfy }, { merge: true });

  const nouvelEtat = { ...current, ntfy: nouveauNtfy };
  await interaction.update(construireVueNtfy(lang, nouvelEtat));
}

// ---------------------------------------------------------------------
// Handlers — raccourcis globaux "Tout activer / Tout désactiver" (toutes langues)
// ---------------------------------------------------------------------

async function handleConfigAlertesToutActiverMp(interaction) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };

  await docRef.set(
    { types: TOUS_LES_TYPES, confirmed: true, username: interaction.user.tag, updatedAt: new Date().toISOString() },
    { merge: true }
  );

  const nouvelEtat = { ...current, types: TOUS_LES_TYPES };
  await interaction.update(construireVueLangues(nouvelEtat));
}

async function handleConfigAlertesToutDesactiverMp(interaction) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };

  await docRef.set({ types: [] }, { merge: true });

  const nouvelEtat = { ...current, types: [] };
  await interaction.update(construireVueLangues(nouvelEtat));
}

async function handleConfigAlertesToutActiverNtfy(interaction) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };
  const ntfyActuel = current.ntfy || {};

  if (!ntfyActuel.enabled) {
    await interaction.update(
      construireVueLangues(
        current,
        "⚠️ Configure d'abord un serveur/topic Ntfy (ouvre une langue puis « Configurer pour Ntfy ») avant de tout activer."
      )
    );
    return;
  }

  const nouveauNtfy = { ...ntfyActuel, types: TOUS_LES_TYPES };
  await docRef.set({ ntfy: nouveauNtfy }, { merge: true });

  const nouvelEtat = { ...current, ntfy: nouveauNtfy };
  await interaction.update(construireVueLangues(nouvelEtat));
}

async function handleConfigAlertesToutDesactiverNtfy(interaction) {
  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };
  const ntfyActuel = current.ntfy || {};

  const nouveauNtfy = { ...ntfyActuel, types: [] };
  await docRef.set({ ntfy: nouveauNtfy }, { merge: true });

  const nouvelEtat = { ...current, ntfy: nouveauNtfy };
  await interaction.update(construireVueLangues(nouvelEtat));
}

// ---------------------------------------------------------------------
// Handlers — configuration Ntfy (serveur/topic)
// ---------------------------------------------------------------------

async function handleConfigAlertesNtfyButton(interaction) {
  const current = await lireEtat(interaction.user.id);
  const ntfy = current.ntfy || {};

  const modal = new ModalBuilder().setCustomId(MODAL_NTFY_ID).setTitle("Configurer Ntfy");

  const inputTopic = new TextInputBuilder()
    .setCustomId(MODAL_NTFY_TOPIC_INPUT)
    .setLabel("Topic (laisse vide pour désactiver Ntfy)")
    .setPlaceholder("vikidia-xxxxxxxxxxxxxxxxxxxxxxxx")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(64);
  if (ntfy.topic) inputTopic.setValue(ntfy.topic);

  const inputServeur = new TextInputBuilder()
    .setCustomId(MODAL_NTFY_SERVER_INPUT)
    .setLabel("Serveur Ntfy")
    .setPlaceholder(NTFY_SERVER_DEFAUT)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);
  inputServeur.setValue(ntfy.server || NTFY_SERVER_DEFAUT);

  modal.addComponents(
    new ActionRowBuilder().addComponents(inputTopic),
    new ActionRowBuilder().addComponents(inputServeur)
  );

  await interaction.showModal(modal);
}

async function handleConfigAlertesNtfyModal(interaction) {
  const topicBrut = interaction.fields.getTextInputValue(MODAL_NTFY_TOPIC_INPUT).trim();
  const serveurBrut =
    interaction.fields.getTextInputValue(MODAL_NTFY_SERVER_INPUT).trim() || NTFY_SERVER_DEFAUT;
  const serveur = serveurBrut.replace(/\/+$/, "");

  const docRef = db.collection("alert_subscriptions").doc(interaction.user.id);
  const doc = await docRef.get();
  const current = doc.exists ? doc.data() : { types: [], ntfy: {} };

  if (!topicBrut) {
    const nouveauNtfy = { enabled: false, server: serveur, topic: "", types: current.ntfy?.types || [] };
    await docRef.set({ ntfy: nouveauNtfy }, { merge: true });
    await interaction.reply({ content: "✅ Ntfy désactivé.", ephemeral: true });
    return;
  }

  if (!urlServeurValide(serveur)) {
    await interaction.reply({ content: "❌ Adresse de serveur invalide.", ephemeral: true });
    return;
  }
  if (!NTFY_TOPIC_REGEX.test(topicBrut)) {
    await interaction.reply({
      content: "❌ Le topic doit contenir entre 8 et 64 caractères (lettres, chiffres, `-` ou `_`).",
      ephemeral: true,
    });
    return;
  }

  const nouveauNtfy = {
    enabled: true,
    server: serveur,
    topic: topicBrut,
    types: current.ntfy?.types || [],
  };

  await docRef.set(
    {
      confirmed: true,
      username: interaction.user.tag,
      updatedAt: new Date().toISOString(),
      ntfy: nouveauNtfy,
    },
    { merge: true }
  );

  await interaction.reply({
    content: `✅ Ntfy configuré sur \`${serveur}/${topicBrut}\`. Utilise à nouveau /config-alertes pour choisir tes alertes par langue.`,
    ephemeral: true,
  });

  envoyerNtfy({
    server: serveur,
    topic: topicBrut,
    title: "BotCélian",
    message: "✅ Ce topic est bien configuré. Tu recevras ici les alertes que tu as choisies.",
    tags: ["white_check_mark"],
  }).catch(() => {});
}

module.exports = {
  data,
  SELECT_ID_LANG,
  SELECT_ID_TYPES,
  SELECT_ID_NTFY_TYPES,
  BUTTON_GOTO_NTFY_ID,
  BUTTON_GOTO_DISCORD_ID,
  BUTTON_GOTO_LANG_ID,
  BUTTON_NTFY_ID,
  MODAL_NTFY_ID,
  BUTTON_LANG_TOUT_ACTIVER_ID,
  BUTTON_LANG_TOUT_DESACTIVER_ID,
  BUTTON_LANG_NTFY_TOUT_ACTIVER_ID,
  BUTTON_LANG_NTFY_TOUT_DESACTIVER_ID,
  BUTTON_TOUT_ACTIVER_MP_ID,
  BUTTON_TOUT_DESACTIVER_MP_ID,
  BUTTON_TOUT_ACTIVER_NTFY_ID,
  BUTTON_TOUT_DESACTIVER_NTFY_ID,
  handleConfigAlertesCommand,
  handleConfigAlertesLangSelect,
  handleConfigAlertesGotoLang,
  handleConfigAlertesGotoDiscord,
  handleConfigAlertesGotoNtfy,
  handleConfigAlertesTypesSelect,
  handleConfigAlertesNtfyTypesSelect,
  handleConfigAlertesLangToutActiver,
  handleConfigAlertesLangToutDesactiver,
  handleConfigAlertesLangNtfyToutActiver,
  handleConfigAlertesLangNtfyToutDesactiver,
  handleConfigAlertesToutActiverMp,
  handleConfigAlertesToutDesactiverMp,
  handleConfigAlertesToutActiverNtfy,
  handleConfigAlertesToutDesactiverNtfy,
  handleConfigAlertesNtfyButton,
  handleConfigAlertesNtfyModal,
};

