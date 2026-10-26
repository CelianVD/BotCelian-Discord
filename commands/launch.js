const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const scripts = require("../config/scripts");
const { db } = require("../lib/firebaseAdmin");

const SELECT_MENU_ID = "launch-select-script";

// --- Déclaration du slash command (à envoyer lors du déploiement des commandes) ---
const data = new SlashCommandBuilder()
  .setName("launch")
  .setDescription("Lancer un script Python dans le conteneur Docker");

// Vérifie que le Discord ID a bien été lié à un compte Vikidia autoconfirmé
// (fr, es ou en) via /auth. Renvoie { ok: boolean, raison?: string }.
async function verifierAutoconfirme(discordId) {
  const snap = await db.collection("discord_links").doc(discordId).get();

  if (!snap.exists) {
    return { ok: false, raison: "Tu dois d'abord lier ton compte Vikidia avec `/auth`." };
  }

  const { autoconfirme, vikidiaUsername } = snap.data();
  const estAutoconfirme = Object.values(autoconfirme || {}).some(Boolean);

  if (!estAutoconfirme) {
    return {
      ok: false,
      raison: `Ton compte Vikidia (**${vikidiaUsername}**) n'est autoconfirmé sur aucun wiki (fr, es, en).`,
    };
  }

  return { ok: true };
}

// --- Étape 1 : /launch -> vérifie les droits puis affiche le menu déroulant ---
async function handleLaunchCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const verif = await verifierAutoconfirme(interaction.user.id);
  if (!verif.ok) {
    await interaction.editReply({
      content: `🔒 Accès refusé : ${verif.raison}`,
    });
    return;
  }

  if (scripts.length === 0) {
    await interaction.editReply({
      content: "❌ Aucun script n'est configuré pour le moment.",
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_MENU_ID)
    .setPlaceholder("Choisis un script à exécuter...")
    .addOptions(
      scripts.map((s) => ({
        label: s.name,
        description: s.description?.slice(0, 100) || undefined,
        value: s.id,
        emoji: s.emoji || undefined,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);

  await interaction.editReply({
    content: "📜 Sélectionne le script que tu veux lancer :",
    components: [row],
  });
}

// --- Étape 2 : sélection dans le menu -> ajout à la queue ---
async function handleLaunchSelect(interaction, queue) {
  const scriptId = interaction.values[0];
  const scriptConfig = scripts.find((s) => s.id === scriptId);

  if (!scriptConfig) {
    await interaction.update({
      content: "❌ Ce script n'existe plus dans la configuration.",
      components: [],
    });
    return;
  }

  await interaction.update({
    content: `⏳ **\`${scriptConfig.name}\`** ajouté à la file d'attente...`,
    components: [],
  });

  const position = queue.add({
    scriptConfig,
    requestedByTag: interaction.user.tag,
    requestedById: interaction.user.id,
    onThreadCreated: async (thread) => {
      // Une fois le thread créé, on met à jour le message éphémère avec le lien direct
      try {
        await interaction.editReply({
          content: `🚀 **\`${scriptConfig.name}\`** a démarré ! Suis les logs ici : ${thread}`,
          components: [],
        });
      } catch (err) {
        // Le token de l'interaction a pu expirer si la queue était longue : pas bloquant
        console.error("⚠️ Impossible d'éditer la réponse éphémère (token expiré ?) :", err.message);
      }
    },
  });

  if (position > 1) {
    try {
      await interaction.editReply({
        content: `⏳ **\`${scriptConfig.name}\`** ajouté à la file d'attente (position ${position}). Il démarrera automatiquement.`,
        components: [],
      });
    } catch (err) {
      console.error("⚠️ Impossible d'éditer la réponse éphémère :", err.message);
    }
  }
}

module.exports = {
  data,
  SELECT_MENU_ID,
  handleLaunchCommand,
  handleLaunchSelect,
};
