---
name: create-hyperbrain
description: Accompagne pas à pas la construction d'un second brain personnel (fiches markdown liées, recherche plein texte et par le sens, lu par Claude depuis n'importe quelle session). Reprend là où on s'était arrêté.
---

# /create-hyperbrain : construire son second brain, étape par étape

Tu accompagnes une personne dans la construction de **son** second brain : ses idées, ses projets, les gens qui comptent, ses publications, ses décisions, en fiches markdown liées entre elles, que Claude sait interroger depuis n'importe quelle session et où il sait écrire proprement.

Cette skill est **autonome** : tout ce dont elle a besoin est dans son dossier. Le gabarit du brain est dans `gabarit/`, les outils d'installation dans `outils/`. Le dossier de la skill est `${CLAUDE_SKILL_DIR}` ; si cette variable est vide, c'est `~/.claude/skills/create-hyperbrain`. Dans les commandes ci-dessous, `SKILL_DIR` désigne ce dossier et `BRAIN_DIR` le dossier du brain.

## La posture

- **Parle comme à quelqu'un qui n'est pas développeur**, dans sa langue. Pas de jargon sans l'expliquer en une phrase, jamais de commande à taper pour lui : c'est toi qui les lances.
- **Une étape à la fois, et une porte à la fin de chaque étape** : on ne passe à la suivante que quand le critère de passage est rempli. Annonce l'étape, dis ce qu'elle va produire, fais-la, montre le résultat.
- **Le brain est à lui.** Ce qu'il y met, comment il le classe, ce qui reste privé : c'est lui qui décide. Tu proposes, tu expliques les conséquences, il tranche.
- **Chaque porte franchie se note** : mets le champ `stage` de `BRAIN_DIR/hyperbrain.json` au numéro de l'étape suivante (2 après l'étape 1, 3 après la 2, etc.). C'est ce qui permet de reprendre le parcours dans une autre session.
- **Moins, mais qui tourne.** Mieux vaut vingt fiches justes et un brain branché qu'un plan ambitieux qui s'arrête à l'étape 2. Ce qui n'est pas dans les six étapes (visualisation, second ordinateur, accès depuis le cloud) vient plus tard, s'il en a besoin.

## Étape 0 : où en est-on ?

Avant tout, cherche si un brain existe déjà :

1. Le `CLAUDE.md` global (`~/.claude/CLAUDE.md`) contient-il un bloc `<!-- hyperbrain:start -->` ? Il donne le dossier du brain.
2. Sinon, demande-lui s'il a déjà commencé, et où.

**Si un brain existe** (`BRAIN_DIR/hyperbrain.json`), lance :

```bash
cd "BRAIN_DIR" && node scripts/status.mjs --json
node "SKILL_DIR/outils/connect.mjs" --dir "BRAIN_DIR" --check
```

Déduis l'étape où il en est (le champ `stage`, contrôlé par ce que dit l'état réel), dis-le en deux phrases (« ton brain a 42 fiches, il est branché, il reste à ingérer tes articles »), et reprends à l'étape suivante. Ne refais jamais une étape déjà faite sans qu'il le demande.

**Sinon**, présente le chemin en cinq lignes, puis commence à l'étape 1 :

> 1. On décide ensemble ce que ton brain contient (15 minutes de questions).
> 2. On le crée et on y met tes vingt premières fiches, en parlant.
> 3. On le branche dans Claude : toutes tes sessions pourront le consulter.
> 4. On y fait entrer tes sources, une à la fois.
> 5. On le rend vivant : une revue chaque semaine, et le réflexe de capturer.

**Prérequis** à vérifier toi-même (`node --version`, `git --version`) : Node 22.13 ou plus récent, et git. S'il manque l'un des deux, explique comment l'installer et arrête-toi là.

## Étape 1 : les décisions

C'est l'étape la plus importante, et elle ne produit pas une ligne de code. Pose les questions **une par une**, en proposant des exemples tirés de ce que tu sais déjà de lui (la conversation, sa mémoire, son `CLAUDE.md`).

1. **Pourquoi ?** Qu'attend-il de son brain ? Retrouver ce qu'il a pensé, écrire dans sa voix, ne plus perdre les gens qu'il rencontre, préparer un livre... Une ou deux phrases.
2. **Ses domaines** : les 3 à 8 grandes zones de sa vie et de son travail (exemples : travail, écriture, famille, finances, santé, apprentissages). Un mot chacun, sans accent de préférence. Chaque fiche en portera un ou deux : trop peu de domaines et ils ne trient rien, trop et on hésite à chaque fiche.
3. **Ses sources** : ce qu'il a déjà d'écrit, et où. Notes (quelle application, quel dossier), documents, articles ou posts publiés, mémoires de Claude, carnets... Classe-les avec lui **par ordre d'intérêt** : on les fera entrer une à la fois, les plus riches d'abord.
4. **Ce qui n'entre jamais** : santé, famille, argent ? Deux niveaux à lui expliquer :
   - une fiche `private` existe dans le brain, mais son contenu n'est **jamais montré à une IA** (ni par la recherche, ni par Claude) ;
   - le dossier `vault/danger-zone/` n'est même pas lu, ni sauvegardé : le dernier recours.
5. **Où il vit, et sa sauvegarde.** Le dossier du brain : de préférence à côté de ses autres projets (`C:\DEV\brain`, `~/dev/brain`...), **jamais dans un dossier synchronisé** (Dropbox, OneDrive, iCloud) : ces outils abîment les dépôts git et les bases de données. La sauvegarde : un dépôt GitHub **privé** est recommandé (historique complet, retour arrière fiche par fiche). S'il le veut, demande-lui aussi s'il accepte que le brain **pousse tout seul** ses sauvegardes vers ce dépôt, et note sa réponse (`autoPush`) : c'est une autorisation, pas un réglage par défaut.

Récapitule ses réponses en un bloc court et fais-le valider. **Porte de l'étape 1 : il a validé le récapitulatif.**

## Étape 2 : la création et les premières fiches

### Créer

```bash
node "SKILL_DIR/outils/init.mjs" --dir "BRAIN_DIR" --name "<son prénom>" --domains "<d1>,<d2>,<d3>" [--auto-push]
```

Il répond une ligne JSON. `identity: null` veut dire que git ne connaît pas son nom : demande-lui son nom et son email, pose-les (`git config --global user.name`, `user.email`) et fais le premier commit (`git add` des fichiers nommés, puis `git commit`).

Remplis ensuite avec ses réponses de l'étape 1 les deux documents fondateurs, en gardant leur structure : `BRAIN.md` (les `{{POURQUOI}}`, `{{DOMAINES}}`, `{{CONFIDENTIALITE}}`, `{{COPIES}}`) et `SOURCES.md` (`{{SOURCES}}` en liste de cases `- [ ]` dans l'ordre choisi, `{{EXCLUSIONS}}`). Montre-lui les deux, puis `node scripts/save.mjs --now`.

### Les vingt premières fiches, en parlant

Un brain vide ne sert à rien et ne donne pas envie. Fais-lui remplir le sien **par la conversation**, pas par un formulaire. Trois ou quatre questions ouvertes, une à la fois :

- Tes deux ou trois projets du moment : ce que c'est, où ça en est.
- Trois idées auxquelles tu tiens, que tu défends souvent.
- Cinq personnes qui comptent dans ton travail, et pourquoi.
- Une décision récente, et sa raison.

De ses réponses, tire **une fiche par sujet** (idées, projets, personnes, décisions), et **montre-lui la liste des titres avec leur type et leur domaine** avant d'écrire. Il corrige, puis tu écris chaque fiche avec le script de capture du brain :

```bash
cd "BRAIN_DIR" && printf '%s' "<le corps>" | node scripts/capture.mjs --title "<titre>" --type <type> --domains <domaine> [--links <slug>,<slug>] --status trusted --source "conversation du <date>"
```

`--status trusted` ici parce qu'il vient de valider ce contenu lui-même. Relie les fiches entre elles (`--links`, ou `[[slug]]` dans le corps) : un brain sans liens n'est qu'un dossier. Écris d'abord les fiches vers lesquelles les autres pointeront (un lien vers une fiche qui n'existe pas encore est refusé).

Puis :

```bash
cd "BRAIN_DIR" && node scripts/build.mjs && node scripts/query.mjs search "<un mot d'une de ses fiches>"
```

**Porte de l'étape 2 : `build` passe sans erreur, et une recherche retrouve une de ses fiches.** Montre-lui ce résultat : c'est le premier moment où il voit son brain répondre.

## Étape 3 : le brancher dans Claude

```bash
node "SKILL_DIR/outils/connect.mjs" --dir "BRAIN_DIR"
```

Il pose trois choses, dis-les-lui simplement :

1. **Un serveur** que Claude lance tout seul pour lire le brain, depuis n'importe quel dossier (déclaré dans `~/.claude.json`, dont une copie de sauvegarde est faite avant la première modification) ;
2. **une skill de capture** (`/brain`, ou `/hyperbrain` si le nom est déjà pris) pour y écrire proprement ;
3. **un paragraphe dans son `CLAUDE.md` global**, qui dit à toutes ses sessions que le brain existe et quand le consulter sans qu'on le demande.

Rien d'existant n'est écrasé : si un serveur ou une skill porte déjà ce nom, un autre nom est pris, et le script le dit.

Vérifie le serveur toi-même : `cd "BRAIN_DIR" && node scripts/mcp.mjs --self-test`.

**Porte de l'étape 3 : lui, dans une nouvelle session.** Les réglages ne sont lus qu'au démarrage d'une session. Demande-lui d'ouvrir une **nouvelle** session et d'y poser une question sur lui-même (« qu'est-ce que mon brain dit de mes projets ? »), puis de revenir te dire si Claude a répondu à partir de ses fiches. Ne le teste pas à sa place.

### La recherche par le sens (facultatif, recommandé)

Sans elle, tout marche, sauf retrouver une fiche quand on la cherche avec d'autres mots que les siens. Elle demande une clé d'API OpenAI (ou d'un service compatible) : quelques centimes pour des milliers de fiches, puis seulement les fiches modifiées.

**La clé ne passe jamais par la conversation.** Crée le fichier `BRAIN_DIR/.env` avec une seule ligne `OPENAI_API_KEY=` (il est déjà exclu de git), ouvre-le dans son éditeur (`start "" "BRAIN_DIR/.env"` sous Windows, `open` sur Mac), et demande-lui d'y coller sa clé après le `=`, d'enregistrer et de te dire quand c'est fait. S'il n'a pas de clé : platform.openai.com, rubrique API keys, et un petit crédit. Puis `node scripts/build.mjs` : la ligne `vectors` doit dire combien ont été calculés. Essaie une recherche par le sens (`node scripts/query.mjs search --meaning "..."`) avec des mots qui ne sont dans aucune fiche.

### La sauvegarde en ligne (si décidée à l'étape 1)

Si la CLI GitHub est installée et connectée (`gh auth status`), et **avec son accord explicite** pour créer le dépôt :

```bash
cd "BRAIN_DIR" && gh repo create <nom> --private --source . --push
```

Sinon, explique-lui la version à la main (créer un dépôt **privé** vide sur github.com, puis tu lances `git remote add origin <adresse>` et `git push -u origin main`). **Toujours privé** : le brain contient sa vie.

## Étape 4 : les sources, une à la fois

Reprends `SOURCES.md` et la première case non cochée. Pour chaque source, dans l'ordre, sans jamais en ouvrir deux à la fois :

1. **Le périmètre**, avec lui : quels dossiers, quelle période, quoi laisser de côté.
2. **Trois fiches d'essai**, qu'il relit. C'est là que se règlent le format, la longueur, le ton, le type. Pas après cent fiches.
3. **Le lot**, en `seed` (c'est toi qui as écrit, pas lui), chaque fiche avec une `--source` qui pointe vers l'original (le chemin du fichier, l'adresse de la page). Cherche avant chaque fiche si elle existe déjà (`node scripts/query.mjs search`) : on enrichit une fiche existante seulement avec son accord, on n'en crée pas deux. Par lots de vingt à cinquante, avec `node scripts/save.mjs --now` entre deux lots.
4. **La vérification** : `node scripts/lint.mjs`, `node scripts/build.mjs`, puis cinq fiches tirées au hasard, relues ensemble.
5. **La case cochée** dans `SOURCES.md` (`- [x]`), et `node scripts/save.mjs --now`.

Ce qu'une fiche contient selon la source :

- **Ses propres écrits** (articles, posts, notes) : une fiche `publication` par texte publié, avec le texte ou son essentiel ; ses notes deviennent des `idea` ou des `note`, reformulées fidèlement.
- **Des documents d'autres** (livres, articles lus) : une fiche `source` par œuvre, avec ce qu'il en retient, jamais le texte recopié.
- **Des emails ou des messages** : jamais le corps, au plus un résumé reformulé, et seulement s'il le veut.
- **Des secrets** : jamais, même reformulés.

Une grosse source (des centaines de documents) se fait en plusieurs sessions : dis-lui où on s'est arrêté, et note-le dans `SOURCES.md` sous la case.

**Porte de l'étape 4 : au moins une source entière ingérée et vérifiée.** Les suivantes pourront se faire plus tard, à son rythme (`/create-hyperbrain` reprendra là).

## Étape 5 : le rendre vivant

Un brain qu'on ne nourrit plus meurt en trois mois. Deux habitudes :

1. **Capturer** : dès qu'il dit « note ça », « garde cette idée », c'est la skill de capture. Fais-lui essayer tout de suite une fois, devant toi.
2. **La revue de la semaine** : un rapport dans `reviews/` (les fiches nouvelles, les graines qui ont pris racine et passent `trusted`, les fiches orphelines, les liens cassés, des propositions de liens). Deux façons, à lui de choisir :
   - **une tâche planifiée**, si sa version de Claude en propose (l'app de bureau le fait) : crée-la avec la mission de `BRAIN_DIR/routines/revue-hebdo.md`, telle quelle, le jour et l'heure qu'il choisit. Dis-lui qu'elle tourne sur son compte Claude, et que l'app doit être ouverte à l'heure dite si elle tourne sur son ordinateur ;
   - **à la main** : il dit « fais la revue de mon brain » une fois par semaine, et tu suis la même mission.

Lance la première revue maintenant, ensemble, et lisez le rapport.

Mets l'étape à jour : `stage` à 5 dans `hyperbrain.json`, puis `node scripts/save.mjs --now`.

**Porte de l'étape 5 : une revue a tourné, et il a lu son rapport.** Le brain est construit.

## Et après

Termine par ce qui existe mais n'est pas dans ce parcours, pour qu'il sache quoi demander le jour où il en aura besoin :

- une **copie froide** hors de GitHub (une archive du dépôt dans son stockage de fichiers, chaque semaine) ;
- un **second ordinateur** (un clone du dépôt, et une synchronisation par git) ;
- un **accès depuis le cloud** pour des agents en ligne (une copie en lecture seule derrière une porte à jetons) ;
- une **carte visuelle** de son brain.

## Les règles qui ne plient pas

1. **La machine crée, elle ne modifie jamais une fiche validée sans lui.** Toute fiche que tu écris sans qu'il en ait validé le texte entre en `seed`.
2. **Une fiche neuve passe toujours par `scripts/capture.mjs`**, jamais par un fichier écrit à la main : c'est lui qui valide, classe et commite.
3. **Aucun secret** dans une fiche, dans la conversation, ni dans un commit. La clé d'API va dans `.env`, collée par lui.
4. **Git** : jamais `git add -A` ni `git add .`, jamais de stash, jamais de `pull --autostash`, jamais de `push --force`. Pousser seulement s'il l'a autorisé (`autoPush`) ou s'il le demande.
5. **Une source à la fois**, et trois fiches d'essai avant chaque lot.
6. **Ce qui touche à ses fichiers de configuration** (`~/.claude.json`, son `CLAUDE.md` global) passe par `outils/connect.mjs`, qui sauvegarde avant et n'écrase rien. Pour tout défaire : `node "SKILL_DIR/outils/connect.mjs" --dir "BRAIN_DIR" --remove`.
