# /brain:add-cloud

Rend votre brain **lisible depuis le cloud, en lecture seule**, par les agents en ligne que vous choisissez. Une copie est placée sur votre propre compte Cloudflare, en Europe, derrière un petit serveur qui ne répond qu'aux agents à qui vous avez donné une clé.

## Quand l'utiliser

- Un agent qui tourne en ligne doit pouvoir consulter votre brain
- Vous voulez interroger votre brain depuis un appareil qui ne l'a pas
- Vous voulez donner à chaque agent un accès séparé, que vous pouvez fermer à tout moment
- Vous voulez voir la liste des clés distribuées, ou en retirer une
- Vous voulez choisir à nouveau ce qui quitte votre ordinateur : vos fiches privées, vos skills

## Comment ça se passe

1. **L'explication** : Claude vous dit ce que fait ce module, ce qui part en ligne et ce qui ne part pas, puis vous demande si vous le voulez. Il se met en place sur l'ordinateur qui fait tourner le brain.
2. **Le compte Cloudflare** : Claude vérifie que votre ordinateur est relié à Cloudflare. Sinon, il ouvre votre navigateur : vous vous connectez, ou vous créez un compte gratuit.
3. **Les fiches privées** : une première question. Faut-il copier aussi le texte des fiches privées ? Par défaut non : une fiche privée n'existe alors en ligne que par son titre, avec son type et ses dates. Rien de ce qui est tiré de son texte ne part.
4. **Vos skills** : une seconde question, si votre brain contient des skills. Faut-il les copier aussi ? Par défaut non. Avant votre réponse, Claude vous montre lesquelles partiraient. Chaque skill est relue d'abord : celle qui semble contenir une clé, un mot de passe ou le compte d'un serveur n'est pas envoyée, et Claude vous dit laquelle et à quelle ligne.
5. **La copie en Europe** : Claude crée sur votre compte une base de données et un espace de stockage en juridiction européenne, puis y envoie le brain. Le premier envoi contient tout, les suivants seulement ce qui a changé. Rien de ce qui a été envoyé ne reste dans un fichier sur votre disque.
6. **Le serveur** : Claude le met en ligne et vous donne son adresse. À ce stade la porte est fermée : aucune clé n'existe.
7. **Le contrôle** : Claude vérifie de l'extérieur que la porte refuse sans clé, qu'une clé jetable obtient les mêmes réponses que sur l'ordinateur, que fiches privées, adresses et skills restent fermées, puis que la clé jetable, une fois retirée, est bien refusée.
8. **Une clé par agent** : pour chaque agent, vous donnez son nom et les droits dont il a besoin (aucun par défaut). Claude crée la clé et la place dans votre presse-papiers. Vous la collez aussitôt dans les réglages de l'agent, avec l'adresse du serveur.

## Ce que ça crée pour vous

- Une **copie Cloudflare** de votre brain, sur votre compte, en Europe, mise à jour chaque soir par la sauvegarde du soir
- Un **petit serveur en lecture seule**, avec son adresse, qui répond aux mêmes questions que le brain sur votre ordinateur
- **Une clé par agent**, avec trois droits fermés par défaut : lire le contenu des fiches privées, voir les adresses email, et lire vos skills
- Un **registre des accès** dans le brain : à qui, pour quoi, depuis quand (l'empreinte de chaque clé, jamais la clé elle-même)

## Prérequis

- Un brain déjà créé, et être sur l'ordinateur qui le fait tourner
- Un compte Cloudflare gratuit (Claude vous guide pour le créer)
- La sauvegarde du soir (`/brain:add-routines`) pour que la copie reste à jour
- Pour la recherche par le sens en ligne : qu'elle soit déjà active sur le brain (`/brain:add-embeddings`), le serveur reprend la même clé, et ne l'envoie jamais qu'au service auquel elle appartient

## Astuces

{{callout:info|Ce qui est copié en ligne}}
Le texte de vos fiches, leurs liens, votre annuaire et les données de la recherche par le sens. Deux choses seulement si vous l'avez choisi : le texte des fiches privées, et vos skills. Jamais les fichiers du dossier d'une skill, et jamais une skill où Claude a trouvé ce qui ressemble à un secret : ajoutez `cloud: false` en tête d'une skill pour la garder sur votre ordinateur quoi qu'il arrive. Un brain personnel reste dans l'offre gratuite de Cloudflare.
{{/callout}}

{{callout:info|Ce que voit une clé sans un droit}}
Sans le droit aux fiches privées : leur titre, leur type et leurs dates, jamais leur texte ni rien qui en soit tiré. Sans le droit aux adresses : le nom de chaque contact, le volume de vos échanges, les objets de vos mails et ce que l'on sait de la personne, toute adresse email masquée ; les noms et les objets sont donc visibles. Sans le droit aux skills : aucune, pas même leur nom.
{{/callout}}

{{callout:warning|La clé ne s'affiche jamais}}
Elle va dans le presse-papiers (ou, à défaut, dans un fichier que Claude vous indique, qui la contient en clair). Collez-la tout de suite dans les réglages de l'agent, puis copiez autre chose ou supprimez le fichier. Ne créez jamais la base ni l'espace de stockage vous-même dans Cloudflare : la juridiction européenne ne se choisit qu'à la création.
{{/callout}}

{{callout:tip|Fermer une porte ou tout arrêter}}
Demandez à Claude de retirer la clé d'un agent : l'effet est immédiat, et si le serveur n'a pas pu être joint Claude vous dit que la clé ouvre encore, au lieu de dire que c'est fait. Pour tout arrêter, Claude retire toutes les clés, puis vous supprimez ensemble le serveur, la base et l'espace de stockage dans votre tableau de bord Cloudflare. Vous pouvez aussi vider la copie en gardant sa porte, pour le jour où un agent en aura besoin.
{{/callout}}
