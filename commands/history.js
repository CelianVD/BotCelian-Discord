const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db } = require("../lib/firebaseAdmin");

const LIMITE = 10;

const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("Affiche l'historique des derniers scripts lancés via /launch");

const STATUT_EMOJI = {
  en_cours: "⏳",
  succes: "✅",
  erreur: "⚠️",
};

async function handleHistoryCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const snap = await db
    .collection("launch_history")
    .orderBy("startedAt", "desc")
    .limit(LIMITE)
    .get();

  if (snap.empty) {
    await interaction.editReply("Aucun script n'a encore été lancé.");
    return;
  }

  const lignes = snap.docs.map((doc) => {
    const d = doc.data();
    const emoji = STATUT_EMOJI[d.statut] || "❔";
    const date = d.startedAt?.toDate
      ? d.startedAt.toDate().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
      : "?";
    const duree = d.durationSec != null ? `${d.durationSec}s` : "en cours";
    return `${emoji} **${d.scriptName}** — ${d.requestedByTag} — ${date} (${duree})`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🕘 Historique /launch (${lignes.length} dernier${lignes.length > 1 ? "s" : ""})`)
    .setDescription(lignes.join("\n"))
    .setColor(0x3498db);

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, handleHistoryCommand };
