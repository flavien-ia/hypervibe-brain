# /brain:executive

Range dans votre brain **ce que votre IA sait faire** : vos propres skills, et les garde-fous qui les encadrent. C'est l'étage exécutif du brain, à côté de l'étage du savoir (vos fiches). Claude Code les retrouve là où il les cherche toujours, et une autre IA branchée sur votre brain les trouve aussi.

## Quand l'utiliser

- Vous avez écrit des skills à vous et voulez qu'elles vivent dans votre brain, sauvegardées et synchronisées avec lui
- Vous avez des garde-fous (des hooks qui demandent ou refusent avant un geste risqué) et voulez que l'IA ne puisse plus les modifier
- Vous installez votre brain sur un nouvel ordinateur et voulez y retrouver vos skills et vos garde-fous
- Vous voulez savoir où en est l'étage exécutif : ce qui est rangé, ce qui reste dans les dossiers de Claude Code, ce qui n'est plus en place

## Comment ça se passe

1. **Le point** : Claude vous dit combien de skills et de garde-fous vivent déjà dans votre brain, ce qui reste dans les dossiers de Claude Code, et ce qui n'est pas en place.
2. **Le choix** : Claude vous propose de ranger ce qui reste, et vous choisissez quoi (tout, une partie, rien).
3. **Le rangement** : chaque skill choisie part dans votre brain, une copie est gardée avant, et un lien reste à sa place : vous l'appelez par sa /commande comme avant.
4. **Les garde-fous** : Claude les interroge sur quelques cas sans risque avant et après le déplacement, pour vérifier qu'ils répondent pareil. Un garde-fou qui appelle un fichier à côté de lui (une fenêtre de confirmation) part avec ce fichier.
5. **Sur un nouvel ordinateur** : Claude repose les liens de vos skills et rebranche vos garde-fous. Vos skills sont là à la session suivante.

## Ce que ça crée pour vous

- Un dossier `executive/` dans votre brain : vos skills, vos garde-fous, et la façon dont chacun est branché
- Vos skills, appelées comme avant, mais dont chaque amélioration est une amélioration de votre brain
- Des garde-fous que l'IA ne peut ni modifier ni déplacer : vous seul les changez
- Dans la vue en direct, le calque **Harnais** : vos skills et vos plugins en couronne autour des outils, une skill qui s'allume quand l'IA s'en sert
- Une copie de tout ce qui a été déplacé, dans les sauvegardes de votre ordinateur

## Prérequis

- Un brain déjà créé (`/brain:create`)
- Claude Code, dont les skills et les hooks sont rangés dans ses dossiers habituels

## Astuces

- Les plugins que vous installez ne sont pas déplacés : chacun est un produit, avec son propre dépôt. La vue les montre à côté de vos skills.
- Pour changer un garde-fou, ouvrez son fichier vous-même : l'IA n'y a pas accès, c'est le principe.
- `/brain:status` vous dit si une skill ou un garde-fou n'est plus en place.
- Une autre IA branchée sur votre brain (Codex, Cursor, Claude Desktop...) reçoit vos skills du brain lui-même, traduites pour elle. Vos garde-fous ne peuvent pas arrêter ses gestes : elle les reçoit comme des règles, et vous demande avant.
