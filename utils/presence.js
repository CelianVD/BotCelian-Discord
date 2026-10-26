


const { ActivityType } = require("discord.js");
const { db } = require("../lib/firebaseAdmin");

const TYPE_MAP = {
  joue: ActivityType.Playing,
  ecoute: ActivityType.Listening,
  regarde: ActivityType.Watching,
  competition: ActivityType.Competing,
  statut: ActivityType.Custom, // pas de verbe affiché, juste le texte brut (comme DraftBot)
};

const INTERVALLE_MS = 10 * 60 * 1000; // rotation du statut "au repos" toutes les 10 min

const MESSAGES_PAR_DEFAUT = [
  { texte: "Partie en vacances avec BotJanus 🏖️", type: "statut" },
  { texte: "En grève", type: "statut" },
  { texte: "Ping moi", type: "statut" },
  { texte: "Fait grève avec son ami", type: "statut" },
  { texte: "👀", type: "statut" },
];

let cacheMessages = MESSAGES_PAR_DEFAUT;
let intervalHandle = null;

// Recharge la liste des statuts "au repos" depuis Firestore (config/presence.messages).
// Retourne aussi le tableau, pour que les commandes de gestion puissent le muter directement.
async function chargerMessages() {
  try {
    const snap = await db.collection("config").doc("presence").get();
    const messages = snap.exists ? snap.data().messages : null;
    cacheMessages = Array.isArray(messages) && messages.length > 0 ? messages : MESSAGES_PAR_DEFAUT;
  } catch (err) {
    console.error("⚠️ Impossible de charger config/presence, utilisation des valeurs par défaut :", err);
    cacheMessages = MESSAGES_PAR_DEFAUT;
  }
  return cacheMessages;
}

// Construit l'objet "activity" attendu par setPresence selon le type choisi.
// Pour "statut" (ActivityType.Custom), le texte doit passer par `state`, pas `name`,
// sinon Discord affiche "Custom Status" au lieu du texte voulu.
function construireActivity(item) {
  const type = TYPE_MAP[item.type] ?? ActivityType.Watching;
  if (type === ActivityType.Custom) {
    return { name: "Statut", state: item.texte, type };
  }
  return { name: item.texte, type };
}

// Choisit un statut au hasard dans la liste et l'affiche, badge "en ligne".
function definirPresenceIdle(client) {
  if (cacheMessages.length === 0) return;
  const choix = cacheMessages[Math.floor(Math.random() * cacheMessages.length)];
  client.user.setPresence({
    activities: [construireActivity(choix)],
    status: "online",
  });
}

// Affiché pendant l'exécution d'un script /launch, badge "ne pas déranger".
function definirPresenceExecution(client, scriptName) {
  client.user.setPresence({
    activities: [{ name: `Exécute ${scriptName}`, type: "statut" }],
    status: "dnd",
  });
}

// À appeler une fois au démarrage du bot (dans le "ready"). Charge les messages,
// affiche un premier statut, puis fait tourner la sélection toutes les 10 minutes
// tant que la queue est libre.
async function demarrerPresence(client, queue) {
  await chargerMessages();
  definirPresenceIdle(client);

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => {
    if (!queue.isBusy()) definirPresenceIdle(client);
  }, INTERVALLE_MS);
}

module.exports = {
  TYPE_MAP,
  chargerMessages,
  definirPresenceIdle,
  definirPresenceExecution,
  demarrerPresence,
  construireActivity,
};