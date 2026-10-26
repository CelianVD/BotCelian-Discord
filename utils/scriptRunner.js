const { spawn } = require("child_process");
const { ChannelType } = require("discord.js");
const { db, FieldValue } = require("../lib/firebaseAdmin");

const PROJECT_DIR = process.env.PROJECT_DIR || "/home/celian/BotCelian";
const DOCKER_BIN = process.env.DOCKER_BIN || "/usr/bin/docker";
const DOCKER_SERVICE = process.env.DOCKER_SERVICE || "vikidia-bot";

const FLUSH_INTERVAL_MS = 1500;
const MAX_BLOCK_CHARS = 1900; // marge de sécurité sous la limite de 2000 caractères de Discord

function formatDateTimeFR() {
  const now = new Date();
  return now.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", "");
}

/**
 * Découpe un texte en blocs de taille <= MAX_BLOCK_CHARS, en coupant sur des sauts de ligne
 * quand c'est possible, pour éviter de couper un mot ou une ligne au milieu.
 */
function chunkText(text, maxLen) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen; // pas de saut de ligne trouvé, coupe brut
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }

  return chunks;
}

/**
 * Envoie un buffer de logs dans le thread, découpé en blocs de code markdown.
 * Neutralise les ``` présents dans les logs pour ne pas casser le formatage.
 */
async function sendLogBlocks(thread, rawText) {
  const safeText = rawText.replace(/```/g, "'''");
  const chunks = chunkText(safeText, MAX_BLOCK_CHARS);

  for (const chunk of chunks) {
    if (chunk.trim().length === 0) continue;
    try {
      await thread.send({ content: "```text\n" + chunk + "\n```" });
    } catch (err) {
      console.error("❌ Impossible d'envoyer un bloc de logs dans le thread :", err);
    }
  }
}

/**
 * Exécute un script Python dans le conteneur Docker et streame les logs dans un thread Discord.
 *
 * @param {import('discord.js').Client} client
 * @param {{ scriptConfig: object, requestedByTag: string, requestedById?: string, onThreadCreated?: (thread) => void }} job
 */
async function runJob(client, job) {
  const { scriptConfig, requestedByTag, requestedById } = job;

  const logsChannelId = process.env.LOGS_CHANNEL_ID;
  if (!logsChannelId) {
    console.error("❌ LOGS_CHANNEL_ID n'est pas défini dans le .env");
    return;
  }

  let channel;
  try {
    channel = await client.channels.fetch(logsChannelId);
  } catch (err) {
    console.error("❌ Impossible de récupérer le salon de logs :", err);
    return;
  }

  if (
    !channel ||
    ![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type)
  ) {
    console.error("❌ Le salon configuré dans LOGS_CHANNEL_ID ne supporte pas les threads.");
    return;
  }

  const threadName = `Logs - ${scriptConfig.name} - ${formatDateTimeFR()}`;

  let thread;
  try {
    thread = await channel.threads.create({
      name: threadName,
      autoArchiveDuration: 1440, // 24h
      reason: `Exécution de ${scriptConfig.file} demandée par ${requestedByTag}`,
    });
  } catch (err) {
    console.error("❌ Impossible de créer le thread :", err);
    return;
  }

  if (typeof job.onThreadCreated === "function") {
    try {
      await job.onThreadCreated(thread);
    } catch (err) {
      console.error("⚠️ onThreadCreated a échoué (probablement token d'interaction expiré) :", err);
    }
  }

  await thread.send(
    `🚀 **Démarrage de \`${scriptConfig.name}\`** (demandé par ${requestedByTag})\n` +
      `📄 Script : \`${scriptConfig.file}\``
  );

  // --- Entrée d'historique : créée au démarrage, complétée à la fin ---
  let historyRef = null;
  try {
    historyRef = await db.collection("launch_history").add({
      scriptId: scriptConfig.id,
      scriptName: scriptConfig.name,
      scriptFile: scriptConfig.file,
      requestedByTag,
      requestedById: requestedById || null,
      threadId: thread.id,
      statut: "en_cours",
      startedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("⚠️ Impossible de créer l'entrée d'historique Firestore :", err);
  }

  const command =
    `cd ${PROJECT_DIR} && ${DOCKER_BIN} compose run --rm ${DOCKER_SERVICE} python -u scripts/${scriptConfig.file}`;

  const startedAt = Date.now();

  await new Promise((resolve) => {
    let buffer = "";
    let flushTimer = null;
    let settled = false; // évite un double resolve() entre "error" et "close"

    const finish = async (statut, extra = {}) => {
      if (settled) return;
      settled = true;

      const durationSec = Math.round((Date.now() - startedAt) / 1000);

      if (historyRef) {
        try {
          await historyRef.update({
            statut,
            durationSec,
            finishedAt: FieldValue.serverTimestamp(),
            ...extra,
          });
        } catch (err) {
          console.error("⚠️ Impossible de mettre à jour l'entrée d'historique Firestore :", err);
        }
      }

      resolve();
    };

    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(async () => {
        flushTimer = null;
        if (buffer.length === 0) return;
        const toSend = buffer;
        buffer = "";
        await sendLogBlocks(thread, toSend);
      }, FLUSH_INTERVAL_MS);
    };

    const appendToBuffer = (text) => {
      buffer += text;
      if (buffer.length >= MAX_BLOCK_CHARS) {
        // Flush immédiat si le buffer déborde déjà, pas besoin d'attendre le timer
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        const toSend = buffer;
        buffer = "";
        sendLogBlocks(thread, toSend).catch((err) =>
          console.error("❌ Erreur d'envoi immédiat des logs :", err)
        );
      } else {
        scheduleFlush();
      }
    };

    let child;
    try {
      child = spawn("bash", ["-c", command], {
        env: process.env,
      });
    } catch (err) {
      thread
        .send(`❌ Impossible de démarrer le processus Docker : \`${err.message}\``)
        .catch(() => {});
      return finish("erreur", { erreur: err.message });
    }

    child.stdout.on("data", (data) => appendToBuffer(data.toString()));
    child.stderr.on("data", (data) => appendToBuffer(data.toString()));

    child.on("error", (err) => {
      thread
        .send(`❌ Erreur lors du lancement du processus : \`${err.message}\``)
        .catch(() => {});
      // Fix : sans ce resolve(), un spawn en échec (ex: docker introuvable) bloquait
      // la queue indéfiniment car "close" n'est jamais émis dans ce cas.
      finish("erreur", { erreur: err.message });
    });

    child.on("close", async (code) => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (buffer.length > 0) {
        await sendLogBlocks(thread, buffer);
        buffer = "";
      }

      if (code === 0) {
        await thread.send(
          `✅ **\`${scriptConfig.name}\` terminé avec succès** (code 0, durée ${Math.round((Date.now() - startedAt) / 1000)}s)`
        );
      } else {
        await thread.send(
          `⚠️ **\`${scriptConfig.name}\` terminé avec une erreur** (code ${code}, durée ${Math.round((Date.now() - startedAt) / 1000)}s)`
        );
      }

      finish(code === 0 ? "succes" : "erreur", { exitCode: code });
    });
  });
}

module.exports = { runJob };

