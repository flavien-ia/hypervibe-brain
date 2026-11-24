# La mémoire de l'IA entre dans le brain

Claude Code tient sa propre mémoire : des fichiers qu'il écrit de lui-même, un dossier par dossier de travail (`~/.claude/projects/<projet>/memory/`, avec un index `MEMORY.md`). Il y range ce qu'il a appris de la personne, de ses projets, de ses décisions et de ses propres erreurs. Rien de tout cela n'est dans le brain : une autre IA branchée demain sur le brain n'en saurait rien. Cette page dit comment cette mémoire entre dans le brain, et comment l'IA écrit ensuite au bon endroit.

## Pourquoi

La décision vient du premier brain du plugin, le 4 novembre 2026 : « si je change d'IA, je branche mon brain et rien n'est perdu ». Le 20 novembre 2026, la migration a été faite à la main sur ce brain : 157 fichiers dans 12 dossiers de travail, 309 fiches, environ 2,4 millions de jetons. Ce que ce passage a appris est devenu le programme et la skill.

## Les étapes

C'est un bloc du savoir, la quatrième partie du démarrage (`/brain:start`), entre les écrits et les conversations. La skill `_memory` le conduit, le programme `memory.mjs` fait chaque geste.

| Étape | Commande | Ce qui se passe |
|---|---|---|
| Compter | `memory.mjs find` | Les fichiers et leur taille, par dossier de travail, avec une estimation. Rien n'est lu. |
| Sauvegarder | `memory.mjs backup` | Une copie de chaque fichier dans `~/.hypervibe-brain/memory-backup/<moment>/`. Chaque copie est relue et comparée à son original. |
| Mettre de côté | `memory.mjs archive` | Chaque fichier part dans `memory-archive-<jour>/`, à côté de son dossier. Une page prend sa place et dit où vit la mémoire. Des registres listent chaque fichier. |
| Verrouiller | `memory.mjs lock on` | L'IA n'écrit plus dans sa propre mémoire (voir plus bas). C'est le choix de la personne. |
| Faire entrer | `ledger.mjs next`, `capture.mjs` | Chaque fichier devient une ou plusieurs fiches qui le citent en source. |
| Vérifier | `ledger.mjs state`, `lint.mjs` | Aucun fichier ne reste, les mises de côté sont montrées, les liens tiennent. |
| Revenir en arrière | `memory.mjs restore` | Tout retourne à sa place, le verrou est levé. |

## Rien ne se perd

- **La sauvegarde passe avant tout.** `archive` refuse de déplacer un fichier qu'aucune sauvegarde vérifiée ne tient dans son état du moment. Un fichier modifié après la sauvegarde la rend incomplète.
- **Un fichier est déplacé, jamais supprimé.** L'archive reste à côté du dossier de mémoire, et chaque fiche cite le fichier d'archive dont elle vient.
- **Un passage interrompu ne laisse aucun fichier hors des registres.** Avant de déplacer quoi que ce soit, `archive` écrit son plan (`~/.hypervibe-brain/memory-archive-plan.json`) : chaque fichier, d'où il part, où il va. Un déplacement refusé un instant (un antivirus, souvent juste après la sauvegarde) est réessayé ; si l'ordinateur s'éteint au milieu, le passage suivant finit d'abord le plan laissé : les fichiers déjà déplacés entrent dans un registre, aucun deux fois. Tant qu'un plan attend, `memory.mjs state` le dit (`pending`) et le bloc de la première grande session reste à faire.
- **Le retour arrière existe.** `restore` remet les fichiers depuis les archives, `restore --backup` depuis les sauvegardes quand les archives ont disparu : chaque fichier est pris dans la plus récente des sauvegardes qui le tient, et pas seulement dans la dernière (après un second passage sur trois fichiers nouveaux, la dernière ne tenait que ces trois-là). Un fichier déjà en place n'est jamais écrasé. Les fiches écrites entre-temps restent dans le brain.
- **Un retour arrière qui n'a pas pu rendre le réglage de Claude Code le dit.** Si `~/.claude/settings.json` ne se lit pas, il n'est pas touché, `restore` répond `ok: false` avec la raison, mais le garde-fou et la règle du plugin sont levés quand même. Le réglage dû est retenu, et le prochain `lock off`, une fois le fichier réparé, le rend.
- **La page du plugin n'est la page que tant qu'elle dit seulement ce que le plugin a écrit.** Une ligne que l'IA ajoute sous la page (verrou levé) en fait de nouveau un fichier de la mémoire : il est compté, sauvegardé et entre dans le brain, au lieu d'être écrasé au passage suivant.

## Un programme dit que c'est entré

Comme pour un écrit, un fichier ne sort du registre que par un fait : une fiche du brain le cite en source, une fiche existante qui disait déjà tout est nommée, ou il est mis de côté avec une raison que la personne lit. La seule raison admise est un index dont chaque ligne renvoie à un autre fichier de la mémoire. « Trop long » ou « dépassé » n'en sont pas : un ancien état de projet est de l'histoire, écrite avec sa date.

Les registres portent un nom en `memory-<jour>-<n>`. Un lot compte vingt-cinq fichiers au plus, et un fichier de plus de 100 Ko a son lot à lui : plusieurs lecteurs travaillent ainsi côte à côte, chacun avec le texte de `skills/_memory/brief.md` et le nom de son lot.

Un fichier donne deux fiches en moyenne, un long beaucoup plus (35 pour un journal de chantier de 353 Ko).

## Ce que la relecture doit attraper

Le passage du 20 novembre 2026 a montré ce que des lecteurs laissent derrière eux. La skill le fait relire avant de conclure :

- **Une phrase ajoutée de leur plume** : une raison technique, une cause entre deux faits, que le fichier ne donne pas. Elle est retirée.
- **Un lien vers une fiche au nom deviné**, écrit avant que la fiche visée existe. Le contrôle du brain le nomme, la réécriture le répare.
- **Une contradiction avec une fiche existante.** La nouvelle fiche suit le fichier, l'ancienne n'est pas touchée : la personne tranche, paire par paire.
- **Un secret rencontré dans un fichier.** Il n'entre jamais dans une fiche ; le fichier est nommé à la personne.

## Le verrou

Trois choses, posées et levées ensemble par `memory.mjs lock on|off` :

| Quoi | Où | Pourquoi |
|---|---|---|
| Le réglage de Claude Code | `autoMemoryEnabled: false` dans `~/.claude/settings.json` | Claude Code cesse d'écrire sa mémoire. L'ancienne valeur est gardée et rendue à la levée, et le fichier d'avant est copié une fois à côté. |
| Le garde-fou du plugin | `scripts/hook-memory.mjs`, lancé avec celui de l'étage exécutif par un seul programme, `scripts/hook-locks.mjs`, déclaré dans `hooks/hooks.json` (depuis le 24 novembre 2026 : deux programmes au lieu d'un dépassaient parfois le délai de Claude Code sur un ordinateur chargé, et un verrou qui ne répond pas à temps laisse passer l'action) | Il refuse une écriture dans un dossier de mémoire et dit d'écrire dans le brain. Inerte tant que le verrou est levé. |
| La règle | Le bloc du plugin dans le `CLAUDE.md` global | Elle dit où écrire à la place, et de chercher dans le brain avant une tâche. |

Une règle seule ne suffisait pas. Sur le premier brain, elle nommait un seul dossier alors que Claude Code en tient un par dossier de travail : en deux semaines, une session ouverte ailleurs a encore écrit vingt fichiers. Une règle est un contexte qu'un modèle peut ne pas suivre, un garde-fou tient.

Sans verrou, l'IA garde deux mémoires. Le bloc de la première grande session repasse alors à faire dès qu'un nouveau fichier apparaît, avec les seuls fichiers nouveaux.

## Ce que le programme ne fait pas

- Il ne regarde que les dossiers de Claude Code. Si le réglage `autoMemoryDirectory` range la mémoire ailleurs, `find` le signale et ce dossier entre comme un écrit.
- Il ne lit pas la mémoire d'une autre IA. Le bloc n'existe que pour Claude Code.

## Les fichiers

- `scripts/memory.mjs` : compter, sauvegarder, mettre de côté, verrouiller, revenir en arrière.
- `scripts/hook-memory.mjs` : le garde-fou ; `scripts/hook-locks.mjs` le lance avec celui de l'étage exécutif.
- `scripts/rules-block.mjs` : la règle du `CLAUDE.md` global.
- `scripts/ledger.mjs` : les registres (les lots de la mémoire s'ouvrent avec leurs fichiers).
- `scripts/start.mjs` : le bloc `memory` de la première grande session.
- `skills/_memory/SKILL.md` et `skills/_memory/brief.md` : la conduite, et la consigne d'un lecteur.

Le banc couvre le tout dans la scène `memory` (24 vérifications) : `node tests/banc.mjs --only memory`.
