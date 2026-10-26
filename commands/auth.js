const { SlashCommandBuilder } = require("discord.js");
const { randomUUID } = require("crypto");
const { db, FieldValue } = require("../lib/firebaseAdmin");
const { watchAuthRequest } = require("../utils/authListener");

const TTL_MS = 15 * 60 * 1000; // aligné sur la durée de vie d'un token d'interaction Discord

// --- Déclaration du slash command (à envoyer lors du déploiement des commandes) ---
const data = new SlashCommandBuilder()
  .setName("auth")
  .setDescription("Associe ton compte Vikidia à ton compte Discord");

// --- /auth -> crée une demande de vérification et renvoie le lien ---
async function handleAuthCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const token = randomUUID();

  await db.collection("auth_requests").doc(token).set({
    discordId: interaction.user.id,
    discordTag: interaction.user.tag,
    statut: "en_attente",
    createdAt: FieldValue.serverTimestamp(),
  });

  const url = `https://bot.celian.fr.eu.org/auth?token=${token}`;

  await interaction.editReply(
    `🔐 Connecte-toi avec ton compte **Vikidia** ici pour prouver ton identité ` +
    `(lien valable 15 min, usage unique) :\n${url}\n\nReviens ici ensuite, je confirme automatiquement.`
  );

  watchAuthRequest(token, interaction, TTL_MS);
}

module.exports = {
  data,
  handleAuthCommand,
};