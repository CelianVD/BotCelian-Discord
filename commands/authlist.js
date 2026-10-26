const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db } = require("../lib/firebaseAdmin");

// Ton ID Discord (clic droit sur ton profil > Copier l'identifiant, avec le
// mode développeur activé) — à mettre dans le .env du bot.
const OWNER_ID = process.env.OWNER_DISCORD_ID;

const data = new SlashCommandBuilder()
  .setName("auth-liste")
  .setDescription("(Admin) Liste les comptes Discord liés à un compte Vikidia");

async function handleAuthListeCommand(interaction) {
  if (interaction.user.id !== OWNER_ID) {
    await interaction.reply({ content: "🔒 Commande réservée à l'administrateur.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const snap = await db.collection("discord_links").get();

  if (snap.empty) {
    await interaction.editReply("Aucun compte lié pour le moment.");
    return;
  }

  const lignes = [];
  snap.forEach((doc) => {
    const d = doc.data();
    const wikis =
      Object.entries(d.autoconfirme || {})
        .filter(([, ok]) => ok)
        .map(([w]) => w)
        .join(", ") || "aucun";
    const date = d.linkedAt?.toDate ? d.linkedAt.toDate().toLocaleDateString("fr-FR") : "?";
    lignes.push(`• <@${doc.id}> ↔ **${d.vikidiaUsername}** — autoconfirmé : ${wikis} (lié le ${date})`);
  });

  // Découpage en blocs pour respecter la limite de 4096 caractères par description d'embed
  const blocs = [];
  let courant = "";
  for (const ligne of lignes) {
    if ((courant + "\n" + ligne).length > 3900) {
      blocs.push(courant);
      courant = ligne;
    } else {
      courant += (courant ? "\n" : "") + ligne;
    }
  }
  if (courant) blocs.push(courant);

  const embeds = blocs.map((desc, i) =>
    new EmbedBuilder()
      .setTitle(`🔗 Comptes liés (${snap.size})${blocs.length > 1 ? ` — page ${i + 1}/${blocs.length}` : ""}`)
      .setDescription(desc)
      .setColor(0x2ecc71)
  );

  await interaction.editReply({ embeds: [embeds[0]] });
  for (let i = 1; i < embeds.length; i++) {
    await interaction.followUp({ embeds: [embeds[i]], ephemeral: true });
  }
}

module.exports = { data, handleAuthListeCommand };
