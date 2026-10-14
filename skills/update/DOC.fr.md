# /brain:update

Met le plugin Hypervibe Brain à jour avec la dernière version publiée. Claude regarde s'il en existe une plus récente, vous dit laquelle, et l'installe avec votre accord. **Votre brain n'est jamais touché** : seuls les fichiers du plugin changent.

## Quand l'utiliser

- Vous voulez savoir si une nouvelle version du plugin est sortie
- Vous avez installé le plugin en téléversant un zip dans l'app Claude, et personne ne vous prévient des nouvelles versions
- On vous a annoncé une correction ou une nouveauté et vous voulez l'avoir

## Comment ça se passe

1. **La vérification** : Claude compare votre version à la dernière publiée sur le dépôt public du plugin, et vous dit ce qu'il en est.
2. **Selon votre installation** : si vous avez téléversé un zip, Claude télécharge la nouvelle version et la vérifie. Si vous l'avez installé depuis le dépôt public, Claude lance les commandes de mise à jour de Claude Code.
3. **La vérification du téléchargement** : le fichier reçu est comparé à l'empreinte que GitHub a calculée au moment de la publication. S'ils diffèrent, rien n'est installé.
4. **Le remplacement** : la nouvelle version est déballée et contrôlée à part, puis elle prend la place de l'ancienne, qui est gardée de côté. Au moindre problème, l'ancienne revient.
5. **La sauvegarde du soir** : Claude la réarme à la même heure, pour qu'elle tourne avec la nouvelle version.

## Ce que ça crée pour vous

- Le plugin à jour, avec ses nouvelles skills et ses corrections
- Une copie de l'ancienne version, gardée de côté jusqu'à ce que vous demandiez de la supprimer
- Une sauvegarde du soir qui tourne avec la nouvelle version

## Prérequis

- Une connexion internet
- Le plugin installé sur cet ordinateur (c'est lui qui se met à jour)

## Astuces

{{callout:info|Fermer et rouvrir Claude}}
Une fois la mise à jour faite, fermez et rouvrez Claude : c'est à ce moment qu'il charge la nouvelle version.
{{/callout}}

{{callout:tip|Ce qui a changé}}
Chaque version publiée a sa page sur le dépôt public, avec la liste de ses changements. Claude vous en donne le lien quand une mise à jour est disponible.
{{/callout}}

{{callout:warning|Si le téléchargement ne correspond pas}}
Claude s'arrête et n'installe rien. Réessayez plus tard ; si l'écart persiste, ne forcez pas l'installation.
{{/callout}}
