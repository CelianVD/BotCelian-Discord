// utils/notificationListener.js
// Envoie par MP les messages que le site met dans `discord_notifications`
// (confirmation de liaison, etc.). Le site n'a pas besoin du jeton du bot.
const { db, FieldValue } = require("../lib/firebaseAdmin");

const COLLECTION = "discord_notifications";

// "Réserve" le document (en_attente -> envoi) de façon atomique, pour qu'un
// même MP ne parte jamais deux fois.
async function reclamer(ref) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().statut !== "en_attente") return null;
    tx.update(ref, { statut: "envoi", envoiCommenceLe: FieldValue.serverTimestamp() });
    return snap.data();
  });
}

async function envoyer(client, ref) {
  const data = await reclamer(ref).catch(() => null);
  if (!data) return;

  try {
    if (!data.discordId || typeof data.contenu !== "string" || !data.contenu.trim()) {
      throw new Error("Notification invalide (discordId ou contenu manquant)");
    }
    const user = await client.users.fetch(data.discordId);
    await user.send({ content: data.contenu.slice(0, 2000) });
    await ref.delete();
  } catch (err) {
    // 50007 = l'utilisateur n'accepte pas les MP (confidentialité) ou ne partage aucun serveur avec le bot.
    const mpFermes = err?.code === 50007;
    console.error(`[notifications] MP à ${data.discordId} impossible :`, err?.message || err);
    await ref
      .update({
        statut: "echec",
        erreur: mpFermes ? "MP fermés ou aucun serveur en commun" : String(err?.message || err),
        echecLe: FieldValue.serverTimestamp(),
      })
      .catch(() => {});
  }
}

/** À appeler une fois, quand le client Discord est prêt. */
function startNotificationListener(client) {
  // Reprise après un crash survenu pendant un envoi.
  db.collection(COLLECTION)
    .where("statut", "==", "envoi")
    .get()
    .then((snap) => snap.forEach((d) => d.ref.update({ statut: "en_attente" }).catch(() => {})))
    .catch(() => {});

  // Au démarrage, l'écoute reçoit aussi les MP restés en attente pendant que le bot était éteint.
  return db
    .collection(COLLECTION)
    .where("statut", "==", "en_attente")
    .onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== "removed") envoyer(client, change.doc.ref);
        });
      },
      (err) => console.error("[notifications] écoute interrompue :", err)
    );
}

module.exports = { startNotificationListener };