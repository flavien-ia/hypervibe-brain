# /add-cloud

Rend votre brain **lisible depuis le cloud, en lecture seule**, par les agents en ligne que vous choisissez. Une copie est placée sur votre propre compte Cloudflare, en Europe, derrière un petit serveur qui ne répond qu'aux agents à qui vous avez donné une clé.

## Quand l'utiliser

- Un agent qui tourne en ligne doit pouvoir consulter votre brain
- Vous voulez interroger votre brain depuis un appareil qui ne l'a pas
- Vous voulez donner à chaque agent un accès séparé, que vous pouvez fermer à tout moment
- Vous voulez voir la liste des clés distribuées, ou en retirer une

## Comment ça se passe

1. **L'explication** : Claude vous dit ce que fait ce module et ce qu'il implique, puis vous demande si vous le voulez. Il se met en place sur l'ordinateur qui fait tourner le brain.
2. **Le compte Cloudflare** : Claude vérifie que votre ordinateur est relié à Cloudflare. Sinon, il ouvre votre navigateur : vous vous connectez, ou vous créez un compte gratuit.
3. **Les fiches privées** : une seule question. Faut-il copier aussi le texte des fiches privées ? Par défaut non : une fiche privée n'existe alors en ligne que par son titre.
4. **La copie, en Europe** : Claude crée sur votre compte une base de données et un espace de stockage en juridiction européenne, puis y envoie le brain. Le premier envoi contient tout, les suivants seulement ce qui a changé.
5. **Le serveur** : Claude le met en ligne et vous donne son adresse. À ce stade la porte est fermée : aucune clé n'existe.
6. **Le contrôle** : Claude vérifie de l'extérieur que la porte refuse sans clé, qu'une clé jetable obtient les mêmes réponses que sur l'ordinateur, que fiches privées et adresses restent fermées, puis que la clé jetable, une fois retirée, est bien refusée.
7. **Une clé par agent** : pour chaque agent, vous donnez son nom et les droits dont il a besoin (aucun par défaut). Claude crée la clé et la place dans votre presse-papiers. Vous la collez aussitôt dans les réglages de l'agent, avec l'adresse du serveur.

## Ce que ça crée pour vous

- Une **copie Cloudflare** de votre brain, sur votre compte, en Europe, mise à jour chaque soir par la sauvegarde du soir
- Un **petit serveur en lecture seule**, avec son adresse, qui répond aux mêmes questions que le brain sur votre ordinateur
- **Une clé par agent**, avec deux droits fermés par défaut : lire le contenu des fiches privées, et voir les adresses email
- Un **registre des accès** dans le brain : à qui, pour quoi, depuis quand (l'empreinte de chaque clé, jamais la clé elle-même)

## Prérequis

- Un brain déjà créé, et être sur l'ordinateur qui le fait tourner
- Un compte Cloudflare gratuit (Claude vous guide pour le créer)
- La sauvegarde du soir (`/add-routines`) pour que la copie reste à jour
- Pour la recherche par le sens en ligne : qu'elle soit déjà active sur le brain (`/add-meaning`), le serveur reprend la même clé

## Astuces

{{callout:info|Ce qui est copié en ligne}}
Le texte de vos fiches, leurs liens, votre annuaire et les données de la recherche par le sens. Le texte des fiches privées seulement si vous l'avez choisi, et l'agent doit en plus avoir reçu ce droit. Un brain personnel reste dans l'offre gratuite de Cloudflare.
{{/callout}}

{{callout:warning|La clé ne s'affiche jamais}}
Elle va dans le presse-papiers (ou, à défaut, dans un fichier que Claude vous indique). Collez-la tout de suite dans les réglages de l'agent, puis copiez autre chose ou supprimez le fichier. Ne créez jamais la base ni l'espace de stockage vous-même dans Cloudflare : la juridiction européenne ne se choisit qu'à la création.
{{/callout}}

{{callout:tip|Fermer une porte, ou tout arrêter}}
Demandez à Claude de retirer la clé d'un agent : l'effet est immédiat. Pour tout arrêter, Claude retire toutes les clés, puis vous supprimez ensemble le serveur, la base et l'espace de stockage dans votre tableau de bord Cloudflare.
{{/callout}}
