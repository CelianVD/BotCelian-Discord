// commands/presence.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { db } = require("../lib/firebaseAdmin");
const { chargerMessages, TYPE_MAP, construireActivity } = require("../utils/presence");

const OWNER_ID = process.env.OWNER_DISCORD_ID;

const CHOIX_TYPE = [
  { label: "Joue à", value: "joue" },
  { label: "Écoute", value: "ecoute" },
  { label: "Regarde", value: "regarde" },
  { label: "En compétition sur", value: "competition" },
  { label: "Statut", value: "statut" },
];

const CHOIX_STATUT = [
  { label: "En ligne", value: "online" },
  { label: "Inactif", value: "idle" },
  { label: "Ne pas déranger", value: "dnd" },
  { label: "Invisible", value: "invisible" },
];

const data = new SlashCommandBuilder()
  .setName("presence")
  .setDescription("(Admin) Gère les statuts affichés par le bot au repos");

function checkOwner(interaction) {
  return interaction.user.id === OWNER_ID;
}

// ---- Point d'entrée : /presence ----
async function handlePresenceCommand(interaction) {
  if (!checkOwner(interaction)) {
    await interaction.reply({ content: "🔒 Commande réservée à l'administrateur.", ephemeral: true });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("presence_action")
    .setPlaceholder("Choisis une action")
    .addOptions(
      { label: "📋 Liste", value: "liste" },
      { label: "➕ Ajouter", value: "ajouter" },
      { label: "🗑️ Supprimer", value: "supprimer" },
      { label: "⚡ Forcer un statut", value: "forcer" }
    );

  await interaction.reply({
    content: "Que veux-tu faire ?",
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true,
  });
}

// ---- Étape 1 : choix de l'action ----
async function handlePresenceAction(interaction) {
  if (!checkOwner(interaction)) return;
  const choix = interaction.values[0];

  if (choix === "liste") {
    const messages = await chargerMessages();
    const lignes = messages.map((m, i) => `**${i + 1}.** [${m.type}] ${m.texte}`);
    await interaction.update({ content: lignes.join("\n") || "Aucun statut configuré.", components: [] });
    return;
  }

  if (choix === "ajouter" || choix === "forcer") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`presence_type_${choix}`)
      .setPlaceholder("Choisis le type d'activité")
      .addOptions(CHOIX_TYPE);
    await interaction.update({
      content: "Type d'activité ?",
      components: [new ActionRowBuilder().addComponents(menu)],
    });
    return;
  }

  if (choix === "supprimer") {
    const messages = await chargerMessages();
    if (!messages.length) {
      await interaction.update({ content: "Aucun statut configuré.", components: [] });
      return;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId("presence_supprimer_select")
      .setPlaceholder("Choisis le statut à supprimer")
      .addOptions(
        messages.slice(0, 25).map((m, i) => ({
          label: `[${m.type}] ${m.texte}`.slice(0, 100),
          value: String(i),
        }))
      );
    await interaction.update({
      content: "Lequel supprimer ?",
      components: [new ActionRowBuilder().addComponents(menu)],
    });
    return;
  }
}

// ---- Suppression : sélection directe ----
async function handlePresenceSupprimerSelect(interaction) {
  if (!checkOwner(interaction)) return;
  const numero = parseInt(interaction.values[0], 10);
  const messages = await chargerMessages();
  const [retire] = messages.splice(numero, 1);
  await db.collection("config").doc("presence").set({ messages }, { merge: true });
  await interaction.update({ content: `🗑️ Statut retiré : [${retire.type}] ${retire.texte}`, components: [] });
}

// ---- Ajouter/Forcer : type choisi -> pour "forcer" on demande ensuite le statut ----
async function handlePresenceTypeSelect(interaction) {
  if (!checkOwner(interaction)) return;
  const [, , mode] = interaction.customId.split("_"); // presence_type_ajouter|forcer
  const type = interaction.values[0];

  if (mode === "ajouter") {
    const modal = new ModalBuilder()
      .setCustomId(`presence_modal_ajouter_${type}`)
      .setTitle("Ajouter un statut")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("texte")
            .setLabel("Texte affiché")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
    return;
  }

  // mode === "forcer" -> demander le statut avant le modal
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`presence_statut_${type}`)
    .setPlaceholder("Choisis le badge de statut")
    .addOptions(CHOIX_STATUT);
  await interaction.update({
    content: "Badge de statut ?",
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

// ---- Forcer : statut choisi -> ouvre le modal pour le texte ----
async function handlePresenceStatutSelect(interaction) {
  if (!checkOwner(interaction)) return;
  const [, , type] = interaction.customId.split("_"); // presence_statut_<type>
  const statut = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`presence_modal_forcer_${type}_${statut}`)
    .setTitle("Forcer un statut")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("texte")
          .setLabel("Texte affiché")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
  await interaction.showModal(modal);
}

// ---- Soumission des modals ----
async function handlePresenceModalSubmit(interaction) {
  if (!checkOwner(interaction)) return;
  const texte = interaction.fields.getTextInputValue("texte");

  if (interaction.customId.startsWith("presence_modal_ajouter_")) {
    const type = interaction.customId.replace("presence_modal_ajouter_", "");
    const ref = db.collection("config").doc("presence");
    const messages = await chargerMessages();
    messages.push({ texte, type });
    await ref.set({ messages }, { merge: true });
    await interaction.reply({ content: `✅ Statut ajouté : [${type}] ${texte}`, ephemeral: true });
    return;
  }

  if (interaction.customId.startsWith("presence_modal_forcer_")) {
    const [, , , type, statut] = interaction.customId.split("_");
    interaction.client.user.setPresence({
      activities: [construireActivity({ texte, type })],
      status: statut,
    });
    await interaction.reply({ content: `✅ Statut forcé : [${type}] ${texte} (${statut})`, ephemeral: true });
    return;
  }
}

module.exports = {
  data,
  handlePresenceCommand,
  handlePresenceAction,
  handlePresenceSupprimerSelect,
  handlePresenceTypeSelect,
  handlePresenceStatutSelect,
  handlePresenceModalSubmit,
};