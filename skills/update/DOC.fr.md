# /brain:update

Met le plugin Hypervibe Brain à jour avec la dernière version publiée. Claude regarde s'il en existe une plus récente, vous dit laquelle, et l'installe avec votre accord. **La mise à jour ne touche jamais à votre brain** : seuls les fichiers du plugin changent. Ensuite, Claude peut vous proposer d'accorder un réglage de votre lecture en arrière-plan à la nouvelle version, et ne le fait que sur votre oui.

## Quand l'utiliser

- Vous voulez savoir si une nouvelle version du plugin est sortie
- Vous avez installé le plugin en téléversant un zip dans l'app Claude, et personne ne vous prévient des nouvelles versions
- On vous a annoncé une correction ou une nouveauté et vous voulez l'avoir

## Comment ça se passe

1. **La vérification** : Claude compare votre version à la dernière publiée sur le dépôt public du plugin, et vous dit ce qu'il en est.
2. **Selon votre installation** : si vous avez téléversé un zip, Claude télécharge la nouvelle version et la vérifie. Si vous l'avez installé depuis le dépôt public, Claude lance les commandes de mise à jour de Claude Code.
3. **La double vérification du téléchargement** : le fichier reçu est comparé à son empreinte publiée (il est arrivé entier), puis à la signature de l'auteur. Le plugin porte la clé publique de l'auteur, et seule une version signée par lui est installée : ni le site ni GitHub ne peuvent signer à sa place. Si l'une des deux vérifications échoue, rien n'est installé.
4. **Le remplacement** : la nouvelle version est déballée et contrôlée à part, puis elle prend la place de l'ancienne, qui est gardée de côté. Au moindre problème, l'ancienne revient. Sous Claude Desktop, cette copie ne sert que pendant le remplacement lui-même : Desktop l'efface de lui-même quelques minutes plus tard, Claude ne vous la promet donc pas.
5. **La sauvegarde du soir** : Claude la réarme à la même heure, pour qu'elle tourne avec la nouvelle version.
6. **La vue en direct et la copie en ligne** : si la vue en direct est allumée, elle passe d'elle-même à la nouvelle version et sa fenêtre se recharge ; Claude vérifie que c'est fait. Si votre brain a une copie en ligne (`/brain:add-cloud`), Claude remet son serveur en ligne pour qu'il tourne lui aussi avec la nouvelle version : aucune clé ni aucune donnée ne change.
7. **La lecture en arrière-plan**, si vous l'avez : une mise à jour ne réécrit jamais ce qui a été installé dans votre brain, alors Claude regarde si ses deux lecteurs ont ce sur quoi la nouvelle version compte (la preuve que chaque élément a été lu jusqu'au bout, la lecture des PDF) et vous propose d'ajouter ce qui manque. Si leur accès à Claude n'est gardé que dans votre coffre Hypervibe, Claude vous propose de le recopier dans un fichier de votre ordinateur, sans jamais l'afficher : un coffre se referme au bout de quelques heures, et la lecture s'arrêterait avec lui.

## Ce que ça crée pour vous

- Le plugin à jour, avec ses nouvelles skills et ses corrections
- Une copie de l'ancienne version, gardée de côté jusqu'à ce que vous demandiez de la supprimer (sauf sous Claude Desktop, qui l'efface de lui-même)
- Une sauvegarde du soir qui tourne avec la nouvelle version

## Prérequis

- Une connexion internet
- Le plugin installé sur cet ordinateur (c'est lui qui se met à jour)

## Astuces

{{callout:info|Fermer et rouvrir Claude}}
Une fois la mise à jour faite, fermez et rouvrez Claude : c'est à ce moment qu'il charge la nouvelle version. Sous Claude Desktop, l'écran Plugins continue d'afficher le numéro de la version que vous aviez téléversée : c'est normal, et Claude vous dit quelle version tourne.
{{/callout}}

{{callout:tip|Ce qui a changé}}
Chaque version publiée a sa page sur le dépôt public, avec la liste de ses changements. Claude vous en donne le lien quand une mise à jour est disponible.
{{/callout}}

{{callout:warning|Si la mise à jour est refusée}}
Claude s'arrête et n'installe rien : votre version actuelle continue de fonctionner. Si Claude vous dit que la signature de l'auteur manque ou est refusée, n'installez pas cette version par un autre moyen (pas de téléchargement à la main), et signalez-le à l'auteur sur le dépôt public du plugin. Si seule l'empreinte diffère, réessayez plus tard ; si l'écart persiste, ne forcez pas l'installation. Une mise à jour ne revient jamais d'elle-même à une version plus ancienne.
{{/callout}}
