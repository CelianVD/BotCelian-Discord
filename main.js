const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder, ApplicationCommandOptionType } = require('discord.js');
const axios = require('axios'); // Pour interagir avec l'API de Vikidia

// --- PARAMÈTRES DE CONFIGURATION VIKIDIA ---
const WIKI_API_URL = "https://fr.vikidia.org/w/api.php";
const WIKI_BOT_USERNAME = "BotCélian";
// Utilise ton mot de passe d'application généré sur Vikidia
const WIKI_BOT_PASSWORD = "TON_MOT_DE_PASSE_D_APPLICATION"; 

let wikiCookies = "";
let editToken = "";

// --- FONCTIONS DE MAINTENANCE (TRADUITES DE PYTHON) ---

function hasTemplate(text, templateName) {
    const pattern = new RegExp(`\\{\\{\\s*${templateName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    return pattern.test(text);
}

function isInProgress(text) {
    const workTemplates = ["Travaux", "En travaux", "multi-travaux", "Travail", "En cours", "Article VikiConcours", "Travail scolaire", "Homonymie", "Article Été Vikidien"];
    return workTemplates.some(template => hasTemplate(text, template));
}

function wordCount(text) {
    let cleanText = text.replace(/\{\{[^}]*\}\}/g, '');
    cleanText = cleanText.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1');
    cleanText = cleanText.replace(/\[\[([^\]]*)\]\]/g, '$1');
    const words = cleanText.match(/\w+/g);
    return words ? words.length : 0;
}

function detectProblems(text) {
    const problems = [];
    
    // Catégorisation
    if (!/\[\[\s*Catégorie\s*:/i.test(text)) {
        if (!["Palette", "portail", "Portail"].some(t => hasTemplate(text, t))) {
            problems.append ? problems.push("catégoriser") : problems.push("catégoriser");
        }
    }
    // Portail
    if (!/\{\{\s*[Pp]ortail/.test(text)) {
        problems.push("portail");
    }
    // Illustration
    if (!/\[\[\s*(Fichier|Image|File)\s*:|\.(png|jpg|jpeg|mp4|gif|svg|pdf)($|\||\])/i.test(text) && !/\|\s*image\s*=/i.test(text)) {
        problems.push("illustrer");
    }
    // Sources
    if (!/<ref|\{\{\s*Références|Source|source/i.test(text) && wordCount(text) > 100) {
        problems.push("sourcer");
    }
    // Wikification
    const internalLinks = text.match(/\[\[(?!Catégorie:|Fichier:|Image:|File:)[^\]|]+/gi) || [];
    if (internalLinks.length < 3) {
        problems.push("wikifier");
    }
    
    return problems;
}

function addMaintenanceTemplate(text, problems) {
    const jobs = problems.join(',');
    const template = `{{Maintenance|job=${jobs}|date=~~~~~}}\n`;
    return template + text;
}

// --- CONNEXION À L'API VIKIDIA ---
async function loginToVikidia() {
    try {
        // Étape 1 : Récupérer le Login Token
        const resToken = await axios.get(`${WIKI_API_URL}?action=query&meta=tokens&type=login&format=json`);
        const loginToken = resToken.data.query.tokens.logintoken;
        
        // Étape 2 : S'authentifier
        const resLogin = await axios.post(`${WIKI_API_URL}`, new URLSearchParams({
            action: 'login',
            lgname: WIKI_BOT_USERNAME,
            lgpassword: WIKI_BOT_PASSWORD,
            lgtoken: loginToken,
            format: 'json'
        }));
        
        wikiCookies = resLogin.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
        
        // Étape 3 : Récupérer le jeton de modification (CSRF)
        const resCSRF = await axios.get(`${WIKI_API_URL}?action=query&meta=tokens&format=json`, {
            headers: { Cookie: wikiCookies }
        });
        editToken = resCSRF.data.query.tokens.csrftoken;
        console.log("Connecté avec succès à Vikidia !");
    } catch (err) {
        console.error("Erreur de connexion Vikidia :", err.message);
    }
}

// --- INITIALISATION DU BOT DISCORD ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    await loginToVikidia();

    // Enregistrement de la slash command
    const guildId = "TON_SERVEUR_ID"; // Optionnel : Mets l'ID de ton serveur pour un rafraîchissement instantané
    const commands = client.guilds.cache.get(guildId)?.commands || client.application?.commands;
    
    await commands.create({
        name: 'maintenance',
        description: "Analyse un article Vikidia et y ajoute automatiquement le bandeau de maintenance.",
        options: [
            {
                name: 'titre',
                description: "Le titre exact de l'article sur Vikidia",
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'maintenance') {
        await interaction.deferReply();
        const titre = interaction.options.getString('titre');

        try {
            // 1. Récupération du contenu de l'article sur Vikidia
            const resPage = await axios.get(`${WIKI_API_URL}?action=query&prop=revisions&titles=${encodeURIComponent(titre)}&rvprop=content&format=json`, {
                headers: { Cookie: wikiCookies }
            });
            
            const pages = resPage.data.query.pages;
            const pageId = Object.keys(pages)[0];
            
            if (pageId === "-1") {
                return interaction.editReply(`❌ L'article **${titre}** n'existe pas sur Vikidia.`);
            }
            
            const contenu = pages[pageId].revisions[0]['*'];

            // 2. Vérification des travaux en cours
            if (isInProgress(contenu)) {
                return interaction.editReply(`⚠️ L'article **${titre}** est marqué en travaux. Modification annulée.`);
            }

            // 3. Détection des problèmes
            const problemes = detectProblems(contenu);
            if (problemes.length === 0) {
                return interaction.editReply(`✅ Aucun problème détecté sur l'article **${titre}** !`);
            }

            // 4. Ajout du bandeau et sauvegarde sur Vikidia
            const nouveauContenu = addMaintenanceTemplate(contenu, problemes);
            
            await axios.post(`${WIKI_API_URL}`, new URLSearchParams({
                action: 'edit',
                title: titre,
                text: nouveauContenu,
                summary: `Ajout automatique du bandeau de maintenance : ${problemes.join(', ')} (via Discord)`,
                token: editToken,
                format: 'json'
            }), {
                headers: { Cookie: wikiCookies }
            });

            // 5. Réponse Discord avec un Embed
            const listeProblemes = problemes.map(p => `\`${p}\``).join(', ');
            const embed = new EmbedBuilder()
                .setTitle(`🔧 Maintenance automatique : ${titre}`)
                .setColor(0xFFA500)
                .addFields({ name: "Problèmes détectés et ajoutés", value: listeProblemes })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply("❌ Une erreur est survenue lors du traitement ou de la publication sur le Wiki.");
        }
    }
});

// Connexion au Token Discord nettoyé de la session précédente
client.login(process.env.DISCORD_TOKEN);
