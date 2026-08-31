const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Répond avec Pong 🏓"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Le bot répète ton message")
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Le message à répéter")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Affiche les infos d'un utilisateur Vikidia")
    .addStringOption(option =>
      option
        .setName("nom")
        .setDescription("Le nom d'utilisateur Vikidia")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("help-vikidia")
    .setDescription("Affiche un menu pour choisir des modèles Vikidia"),
  
  new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Envoyer une suggestion à l'admin"),

  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("Analyse un article Vikidia et y ajoute automatiquement le bandeau de maintenance")
    .addStringOption(option =>
      option
        .setName("titre")
        .setDescription("Le titre exact de l'article sur Vikidia")
        .setRequired(true)
    ),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("⏳ Enregistrement des commandes slash");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Toutes les commandes slash ont été enregistrées avec succès !");
  } catch (error) {
    console.error("❌ Erreur lors du déploiement :", error);
  }
})();
