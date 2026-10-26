# BotCelian-Discord

Bot Discord en Node.js (discord.js) connecté à [Vikidia](https://fr.vikidia.org), avec des commandes slash, des boutons interactifs et une fonction d'automatisation qui détecte et signale les articles à améliorer.
> [!WARNING]
> Pour utiliser ce bot, il faut avoir un compte bot déclaré et autorisé sur Vikidia.

> [!IMPORTANT]
> Ce projet est sous licence **GPL-3.0**. Toute réutilisation, modification ou redistribution du code doit respecter les termes de cette licence, notamment la publication du code source sous la même licence. Voir [LICENSE](LICENSE) pour le détail.
## Fonctionnalités

- `/ping` — répond "Pong 🏓"
- `/say` — fait répéter un message au bot
- `/userinfo` — affiche les infos d'un utilisateur Vikidia (contributions, inscription, groupes)
- `/help-vikidia` — menu de boutons avec des modèles Vikidia utiles
- `/suggestion` — envoie une suggestion via un formulaire à un salon admin
- `/maintenance` — analyse un article Vikidia (catégorie, portail, image, sources, liens internes) et y ajoute automatiquement un bandeau de maintenance si besoin
- Réagit quand il est mentionné dans un message (réponses aléatoires)

## Prérequis

- [Node.js](https://nodejs.org/) 18 ou plus récent
- Un bot Discord créé sur le [Discord Developer Portal](https://discord.com/developers/applications)
- Un compte Discord bot avec les intents **Message Content** activé
- Un compte utilisateur Vikidia dédié au bot (pour la commande `/maintenance`)

## Installation

```bash
git clone https://github.com/CelianVD/BotCelian-Discord.git
cd BotCelian-Discord
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet :

```env
TOKEN=VOTRE_TOKEN_BOT_DISCORD
CLIENT_ID=VOTRE_CLIENT_ID_DISCORD
WIKI_PASS=MOT_DE_PASSE_DU_COMPTE_BOT_VIKIDIA
```

- `TOKEN` et `CLIENT_ID` : récupérés sur le [Discord Developer Portal](https://discord.com/developers/applications) (onglet Bot / General Information)
- `WIKI_PASS` : mot de passe du compte Vikidia utilisé par la commande `/maintenance`

Ensuite, ouvrez `index.js` et remplacez les valeurs suivantes :

| À remplacer | Où | Description |
|---|---|---|
| `NOM DU BOT` | `WIKI_BOT_USERNAME` | Nom d'utilisateur du compte bot sur Vikidia |
| `ID DE L'ADMIN` | dans `messageCreate`/modal suggestion | ID du salon Discord où envoyer les suggestions |

> ⚠️ `package.json` contient aussi `"name": "NOM DU BOT Discord"` — vous pouvez le personnaliser librement, ça n'affecte pas le fonctionnement.

## Déployer les commandes slash

Avant de lancer le bot, enregistrez les commandes auprès de Discord (à refaire à chaque ajout/modification de commande) :

```bash
node deploy-commands.js
```

## Lancer le bot

```bash
npm start
```

## Script bonus : `connect.py`

`connect.py` est un script Python indépendant permettant de tester la connexion à Vikidia via [pywikibot](https://www.mediawiki.org/wiki/Manual:Pywikibot). Il nécessite une configuration `pywikibot` (`user-config.py`) et le paquet `pywikibot` installé (`pip install pywikibot`). Utile pour déboguer les identifiants du compte bot indépendamment du bot Discord.

## Licence

GPL-3.0 — voir [LICENSE](LICENSE)
