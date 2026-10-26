const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db } = require("../lib/firebaseAdmin");

const data = new SlashCommandBuilder()
  .setName("my-account")
  .setDescription("Affiche le statut de ton compte Vikidia lié");

async function handleMyAccountCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const snap = await db.collection("discord_links").doc(interaction.user.id).get();

  if (!snap.exists) {
    await interaction.editReply(
      "❌ Aucun compte Vikidia lié à ton compte Discord.\nUtilise `/auth` pour lier ton compte."
    );
    return;
  }

  const d = snap.data();
  const wikis = Object.entries(d.autoconfirme || {}).map(
    ([wiki, ok]) => `${ok ? "✅" : "❌"} ${wiki}`
  );
  const estAutoconfirme = Object.values(d.autoconfirme || {}).some(Boolean);
  const date = d.linkedAt?.toDate ? d.linkedAt.toDate().toLocaleDateString("fr-FR") : "?";

  const embed = new EmbedBuilder()
    .setTitle("🔗 Ton compte")
    .setColor(estAutoconfirme ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "Compte Vikidia", value: d.vikidiaUsername, inline: true },
      { name: "Lié le", value: date, inline: true },
      { name: "Autoconfirmé", value: wikis.join("\n") || "aucun wiki", inline: false },
      {
        name: "Accès /launch",
        value: estAutoconfirme ? "✅ Autorisé" : "🔒 Refusé (pas autoconfirmé)",
        inline: false,
      }
    );

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data, handleMyAccountCommand };
