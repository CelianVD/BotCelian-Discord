const { db } = require("../lib/firebaseAdmin");

// Le lien Discord <-> Vikidia (users/{uid} + discord_links/{discordId}) est
// désormais écrit côté site par /api/auth/verify, AVANT que la demande passe
// à "valide". Ce listener sert donc uniquement à répondre à l'utilisateur.
// Si le bot redémarre pendant l'attente, le lien est quand même créé : seul
// le message de confirmation est perdu.
function watchAuthRequest(token, interaction, ttlMs) {
  const ref = db.collection("auth_requests").doc(token);

  const timeoutHandle = setTimeout(async () => {
    unsubscribe();
    const snap = await ref.get();
    if (snap.exists && snap.data().statut === "en_attente") {
      await ref.delete().catch(() => {});
      await interaction.followUp({ content: "⌛ Lien expiré, relance `/auth`.", ephemeral: true }).catch(() => {});
    }
  }, ttlMs);

  const unsubscribe = ref.onSnapshot(async (snap) => {
    if (!snap.exists) return;
    const data = snap.data();
    if (data.statut === "en_attente") return;

    unsubscribe();
    clearTimeout(timeoutHandle);

    if (data.statut === "valide") {
      const wikis = Object.entries(data.autoconfirme || {})
        .filter(([, ok]) => ok).map(([wiki]) => wiki).join(", ") || "aucun";

      await interaction.followUp({
        content: `✅ Compte lié : **${data.vikidiaUsername}** (autoconfirmé sur : ${wikis}).`,
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.followUp({
        content: `⚠️ Vérification échouée : ${data.raison || "compte non autoconfirmé sur fr, es ou en."}`,
        ephemeral: true,
      }).catch(() => {});
    }

    await ref.delete().catch(() => {});
  });
}

module.exports = { watchAuthRequest };