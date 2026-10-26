const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs/promises");
const path = require("path");
const watchlist = require("../config/watchlist");

// Même dossier projet que utils/scriptRunner.js (celui où vivent les scripts
// Python et leur dossier logs/).
const PROJECT_DIR = process.env.PROJECT_DIR || "/home/celian/BotCelian";
const LOGS_DIR = path.join(PROJECT_DIR, "logs");

const DRAPEAUX = { fr: "🇫🇷", en: "🇬🇧", es: "🇪🇸" };
const APERCU_MAX = 5; // nombre de titres affichés avant "... et N autres"

const data = new SlashCommandBuilder()
  .setName("a-faire")
  .setDescription("Affiche les tâches en attente détectées par les watchers (SI, votes, tickets...)");

// Lit un state file JSON et retourne la liste des titres qu'il contient.
// null = erreur de lecture réelle (à distinguer d'un fichier absent = liste vide).
async function lireStateFile(nomFichier) {
  try {
    const contenu = await fs.readFile(path.join(LOGS_DIR, nomFichier), "utf-8");
    const data = JSON.parse(contenu);
    return Object.keys(data);
  } catch (err) {
    if (err.code === "ENOENT") return []; // watcher jamais lancé ou rien en attente pour l'instant
    console.error(`⚠️ Impossible de lire ${nomFichier} :`, err);
    return null;
  }
}

async function handleTachesCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const resultats = await Promise.all(
    watchlist.map(async (item) => ({
      ...item,
      titres: await lireStateFile(item.stateFile),
    }))
  );

  const total = resultats.reduce((acc, r) => acc + (r.titres ? r.titres.length : 0), 0);
  const aUneErreur = resultats.some((r) => r.titres === null);

  if (total === 0 && !aUneErreur) {
    await interaction.editReply("✅ Rien en attente pour le moment !");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Tâches en attente (${total})`)
    .setColor(total > 0 ? 0xe67e22 : 0x2ecc71);

  for (const r of resultats) {
    const drapeau = DRAPEAUX[r.wiki] || r.wiki.toUpperCase();

    if (r.titres === null) {
      embed.addFields({ name: `${drapeau} ${r.label}`, value: "⚠️ Erreur de lecture du fichier d'état", inline: false });
      continue;
    }

    if (r.titres.length === 0) {
      embed.addFields({ name: `${drapeau} ${r.label}`, value: "Rien en attente", inline: false });
      continue;
    }

    const apercu = r.titres.slice(0, APERCU_MAX).map((t) => `• ${t}`).join("\n");
    const reste = r.titres.length > APERCU_MAX ? `\n… et ${r.titres.length - APERCU_MAX} autre(s)` : "";
    embed.addFields({
      name: `${drapeau} ${r.label} (${r.titres.length})`,
      value: apercu + reste,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, handleTachesCommand };
