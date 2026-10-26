const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db } = require("../lib/firebaseAdmin");

const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Affiche l'état du bot et de la file d'attente /launch");

function formatUptime(secondes) {
  const j = Math.floor(secondes / 86400);
  const h = Math.floor((secondes % 86400) / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const parts = [];
  if (j > 0) parts.push(`${j}j`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}min`);
  return parts.join(" ");
}

async function handleStatusCommand(interaction, queue) {
  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle("📡 Statut du bot")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Bot Discord", value: `✅ En ligne (${formatUptime(process.uptime())})`, inline: true },
      { name: "File /launch", value: `${queue.size()} job(s) en attente`, inline: true }
    );

  // Champ de statut signalé par le Pi (config/status.statut_bot), le seul champ
  // dont le nom est confirmé par tes règles Firestore — ajoute d'autres champs
  // ici si config/status en contient d'autres que tu veux afficher.
  try {
    const statusSnap = await db.collection("config").doc("status").get();
    if (statusSnap.exists) {
      const d = statusSnap.data();
      if (d.statut_bot) embed.addFields({ name: "Statut signalé par le Pi", value: String(d.statut_bot), inline: false });
    }
  } catch (err) {
    console.error("⚠️ Impossible de lire config/status :", err);
  }

  // Dernier job lancé, pour un coup d'œil rapide sans passer par /history
  try {
    const dernierSnap = await db
      .collection("launch_history")
      .orderBy("startedAt", "desc")
      .limit(1)
      .get();
    if (!dernierSnap.empty) {
      const d = dernierSnap.docs[0].data();
      const emoji = d.statut === "succes" ? "✅" : d.statut === "erreur" ? "⚠️" : "⏳";
      embed.addFields({
        name: "Dernier script lancé",
        value: `${emoji} ${d.scriptName} (${d.requestedByTag})`,
        inline: false,
      });
    }
  } catch (err) {
    console.error("⚠️ Impossible de lire launch_history :", err);
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, handleStatusCommand };
