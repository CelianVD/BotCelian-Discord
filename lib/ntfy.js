// lib/ntfy.js
// Envoi de notifications push via Ntfy (https://ntfy.sh ou une instance
// auto-hébergée). Ne lève jamais d'exception : un push raté ne doit jamais
// casser le flux d'alertes principal (MP Discord).

/**
 * @param {object} p
 * @param {string} p.server  Ex: "https://ntfy.sh" (sans slash final)
 * @param {string} p.topic   Le topic de l'utilisateur
 * @param {string} [p.title] Titre de la notif
 * @param {string} p.message Corps de la notif
 * @param {"min"|"low"|"default"|"high"|"urgent"} [p.priority]
 * @param {string[]} [p.tags] Emojis/tags Ntfy (ex: ["rotating_light"])
 * @param {string} [p.click] URL ouverte au clic sur la notif
 * @returns {Promise<boolean>} true si le serveur Ntfy a accepté le message
 */
async function envoyerNtfy({ server, topic, title, message, priority = "default", tags = [], click }) {
  if (!server || !topic || !message) return false;

  const url = `${String(server).replace(/\/+$/, "")}/${topic}`;
  const headers = { "Content-Type": "text/plain; charset=utf-8" };
  if (title) headers["Title"] = title;
  if (priority) headers["Priority"] = priority;
  if (tags?.length) headers["Tags"] = tags.join(",");
  if (click) headers["Click"] = click;

  try {
    const res = await fetch(url, { method: "POST", headers, body: message });
    if (!res.ok) {
      console.warn(`[ntfy] refus du serveur (${res.status}) pour le topic ${topic}`);
    }
    return res.ok;
  } catch (err) {
    console.warn(`[ntfy] envoi échoué vers ${url} :`, err.message);
    return false;
  }
}

/**
 * À appeler depuis le code qui déclenche déjà les MP Discord pour un type
 * d'alerte donné (ex: "fr_alerte"). Regarde dans Firestore tous les abonnés
 * qui ont activé Ntfy pour CE type précis et leur envoie la notif.
 *
 * Exemple d'intégration dans le code existant qui boucle déjà sur
 * `alert_subscriptions` pour envoyer les MP :
 *
 *   const { notifierNtfyPourType } = require("../lib/ntfy");
 *   await notifierNtfyPourType(db, "fr_alerte", {
 *     title: "🚨 Demande de blocage",
 *     message: "Nouvelle demande de blocage à traiter : ...",
 *     click: "https://fr.vikidia.org/...",
 *   });
 *
 * @param {import("firebase-admin").firestore.Firestore} db
 * @param {string} typeAlerte Une des "value" de ALERT_TYPES (ex: "fr_alerte")
 * @param {{title?: string, message: string, priority?: string, tags?: string[], click?: string}} contenu
 */
async function notifierNtfyPourType(db, typeAlerte, contenu) {
  const snap = await db
    .collection("alert_subscriptions")
    .where("ntfy.enabled", "==", true)
    .where("ntfy.types", "array-contains", typeAlerte)
    .get();

  await Promise.all(
    snap.docs.map((doc) => {
      const { ntfy } = doc.data();
      return envoyerNtfy({
        server: ntfy?.server,
        topic: ntfy?.topic,
        ...contenu,
      });
    })
  );
}

module.exports = { envoyerNtfy, notifierNtfyPourType };