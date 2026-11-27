# Ce qui tourne tout seul est approuvé sur chaque ordinateur

Un brain est un dossier qui voyage : un second ordinateur, une copie restaurée, une synchronisation. Une partie de ce qu'il contient n'est pas du savoir, elle décide de ce qui s'exécute. Depuis le 27 novembre 2026 (audit de sécurité), rien de cela ne tourne sur un ordinateur avant que la personne l'y ait approuvé, et tout changement redemande son accord.

## Ce qui est approuvé

| Quoi | Ce que couvre son empreinte | Tant que ce n'est pas approuvé |
|---|---|---|
| Un garde-fou de l'étage exécutif | Son fichier, les fichiers qu'il nomme à côté de lui (`with`), les fichiers du brain qu'il importe, et son branchement (moment, outils visés) | Il n'est pas branché. S'il l'était et qu'il a changé, il n'est plus lancé et ce qu'il garde est refusé |
| Une skill de l'étage exécutif | Tous les fichiers de son dossier | Elle n'est pas reliée au dossier de la plateforme |
| Un programme du brain (source de genre `script` ou `step`) | Son `run.mjs`, les fichiers du brain qu'il importe ou lance, et ce qui dans son `source.json` décide de ce qui tourne | Il n'est pas lancé |
| Un juge (source de genre `claude`, `live`) | Ses instructions, ses outils (`allowedTools`), les programmes du brain que ses règles lui permettent de lancer | Il ne lit rien, sa pile continue de se remplir |
| Une entrée du registre des données (`brain.json`, `data`) | Les services nommés (schéma, hôte, port), les noms des clés envoyées, les fichiers ouverts | Elle n'est ni interrogée chaque soir ni lue par `brain_fetch`, qui dit pourquoi |
| Un dossier suivi (`sources.watch`) | Son chemin | Il n'est pas parcouru, et aucun juge ne reçoit le droit de l'ouvrir |

Les approbations vivent dans les réglages de l'ordinateur (`~/.hypervibe-brain/config.json`, clé `trusted`), jamais dans le brain : ce qui arrive par une synchronisation ne peut pas s'approuver lui-même.

Ce qui ne redemande rien : une pause, un rythme, un plafond, un modèle, la taille d'un lot, une route ajoutée vers un service déjà approuvé. Ce sont des réglages que le plugin écrit lui-même, et ils ne changent ni ce qui s'exécute ni où partent les clés.

## Qui approuve

La personne, dans un terminal à elle. `node scripts/trust.mjs window` ouvre une fenêtre qui montre chaque chose en attente (ce qu'elle dit faire, ses fichiers, ses outils, les services et les clés pour une source de données) et demande un oui pour chacune. Les commandes qui approuvent (`trust.mjs approve`, `trust.mjs guide`, `sources.mjs trust`, `executive.mjs trust`) refusent de tourner sans clavier devant elles, et le verrou du plugin les refuse à l'IA.

Trois gestes approuvent d'eux-mêmes, parce que la personne vient de les demander sur cet ordinateur : faire entrer dans le brain une skill ou un garde-fou de l'ordinateur (`executive.mjs adopt-*`), installer une source standard (`sources.mjs install`, le code du plugin lui-même), suivre un dossier (`components.mjs watch add`).

`node scripts/trust.mjs state` liste ce qui attend. `/brain:status` le dit en premier.

## Un garde-fou n'est plus lancé directement

Les réglages de la plateforme ne lancent plus le fichier du brain. Ils lancent un petit programme posé à côté des réglages du plugin (`~/.hypervibe-brain/guard.mjs`, copie de `scripts/hook-guard.mjs`), qui vérifie l'empreinte du garde-fou à chaque lancement. Si elle correspond, il le lance (dans le même programme pour un module, sans démarrage de plus). Sinon il ne le lance pas, et il refuse l'action gardée, avec un message qui dit à l'IA quoi transmettre à la personne. Un garde-fou réécrit ne décide donc jamais, et une action qu'il aurait arrêtée ne passe pas pendant l'attente.

Le programme vit à côté des réglages et non dans le plugin : une mise à jour peut déplacer le dossier du plugin, et un hook qui pointe vers un dossier disparu ne tourne pas du tout.

## Ce qui était déjà en place

Sur un ordinateur qui faisait déjà tourner le brain, ce qui tournait est approuvé une fois, tel quel, à la première exécution, et c'est écrit dans le journal du brain (`approved`, `how: migration`) :

- un garde-fou que les réglages lançaient directement depuis le brain, et une skill déjà reliée ;
- un programme approuvé selon l'ancienne règle (son `run.mjs` seul), s'il est encore tel qu'approuvé ;
- un juge qui a déjà tourné sur cet ordinateur (son prompt système y est gardé) ;
- le registre des données et les dossiers suivis, tels qu'ils sont.

Ensuite la date est écrite (`trustSince`) et plus rien ne s'approuve tout seul. Un brain créé (`init.mjs`) ou reçu (`adopt.mjs`, donc `computers.mjs clone`) est sous la règle dès son premier jour : rien n'y est approuvé d'office.

## Les règles d'un juge

Un juge ne reçoit que des règles d'une forme connue ; tout le reste est refusé et nommé, avec la raison (`judge.mjs state`, `refusedTools`) :

- un outil du serveur du brain (`mcp__plugin_brain_brain__brain_search`...) ;
- une commande du plugin parmi quatre : les deux lecteurs, `fact.mjs`, `capture.mjs`, écrite `Bash(node {plugin}/scripts/<script>:*)` ;
- `Bash(printf:*)`, par lequel les instructions passent le texte d'une fiche à la capture ;
- un programme du brain, `Bash(node {brain}/<chemin>.mjs [mots]:*)`, qui fait alors partie de ce qui est approuvé ;
- `Read(...)` sous un dossier suivi (`{watch}`) ou une racine de l'ordinateur (`{root:<nom>}`), sans `..`, et jamais un dossier qui contient le brain ou les réglages du plugin.

## Ce qu'un juge ne peut plus faire avec ses commandes

- La capture d'un juge ne lit aucun fichier (`--body-file`, une entrée redirigée depuis un fichier) : son texte lui est donné (`--body`) ou passé par un tube.
- Elle n'écrit jamais une clé que son environnement contient.
- La source d'une fiche est une des références que le juge a reçues pour ce passage, pas ce qu'il dit.
- Une leçon ou une décision est proposée : la fiche entre comme une graine ordinaire, marquée, et la lettre de la semaine la montre à la personne.
- Le lecteur de documents refuse, pour un juge, le brain lui-même, les réglages du plugin, les noms à point, `danger-zone`, les dossiers de clés et les fichiers dont le nom dit un secret.
- Un juge démarre avec le chemin, les dossiers du système et les variables du plugin, et rien des clés de la session qui l'a lancé.

## Ce que l'IA lit d'une graine

Une suggestion glissée devant l'IA dit ce qu'est chaque fiche : « validée », ou « graine, non validée, d'après <source> ». Une graine n'est rangée sous « Leçons » que si elle vient des conversations de la personne (une capture qu'elle a demandée, la mémoire de son IA) : une leçon qu'un lecteur de fond a tirée de ce qu'il a lu attend sa validation, et reste montrée parmi les autres fiches, comme une graine. `brain_search` donne le statut de chaque résultat ; demandé par nature (les leçons, les décisions), il ajoute pour une graine d'où elle vient (`care`). La copie en ligne n'a pas encore la recherche par nature.

## Les limites, dites franchement

- **L'analyse des fichiers lus par un programme est une lecture de son texte.** Un chemin fabriqué à l'exécution, à partir de quelque chose qui n'est pas écrit dans le fichier, lui échappe.
- **Une skill déjà reliée suit son dossier.** La plateforme lit le dossier de la skill directement : un changement arrivé par une synchronisation est lu à la session suivante. L'approbation est demandée avant de relier une skill, pas à chaque modification, parce qu'une skill est faite pour être améliorée par l'IA.
- **Ce que la plateforme laisse passer sous une règle `Bash(node ...:*)` n'a pas pu être vérifié sur le vrai programme** le 27 novembre 2026 (sa connexion avait expiré sur l'ordinateur de l'essai). `tests/essai-regles-claude.mjs` fait cet essai à la main, sur une commande sans effet. Les refus ci-dessus ne dépendent pas de sa réponse, sauf un : une substitution de commande dans un argument (`--body "$(...)"`), qu'aucun programme ne peut distinguer d'un texte.
- **Les réglages de la plateforme** (`~/.claude/settings.json`) ne sont pas verrouillés : d'autres outils doivent pouvoir les changer. Une IA pourrait y débrancher un garde-fou. `executive.mjs state` le montre alors comme non branché.

## Fichiers et vérifications

- `scripts/trust.mjs` : les empreintes, les approbations, la fenêtre de la personne.
- `scripts/hook-guard.mjs` : le lanceur des garde-fous.
- `scripts/executive.mjs`, `scripts/sources.mjs`, `scripts/judge.mjs`, `scripts/fetch.mjs`, `scripts/health.mjs`, `scripts/watch.mjs` : chacun demande l'approbation de ce qu'il lance.
- `tests/zones/securite.mjs` : une vérification au moins par point de l'audit.
