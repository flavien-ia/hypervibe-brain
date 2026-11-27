# Hypervibe Brain

**Un second brain pour Claude Code.** Vos idées, vos projets, les gens qui comptent, ce que vous avez écrit et décidé, en fiches markdown liées entre elles. Claude les consulte depuis n'importe quelle conversation, sans qu'on le lui demande, et sait y écrire proprement.

*[English version](README.md)*

## Ce que vous obtenez

- **Vos fiches sont à vous** : de simples fichiers markdown, dans le dossier de votre choix, dans votre propre dépôt git (sauvegarde GitHub privée recommandée). Aucun service en ligne imposé.
- **Claude lit votre brain partout** : le serveur MCP du plugin dit à chaque session que votre brain existe et quand le consulter.
- **Recherche par les mots et par le sens** : chaque mot, n'importe où, accents ignorés ; et, avec une clé OpenAI (quelques centimes pour des milliers de fiches), par le sens.
- **Un modèle de confiance** : ce que la machine écrit entre en graine (`seed`), et passe fiable (`trusted`) quand vous le validez (un bouton dans la vue en direct, ou un mot à Claude) ou quand il a pris racine. Sur une fiche que vous avez validée, la machine ne réécrit jamais votre texte : elle peut seulement y ajouter un fait qui dit d'où il vient, et tenir à jour ses zones machine ; sur votre pensée (un concept, une idée, une décision ou une leçon que vous avez validés), elle n'ajoute rien et propose le changement dans la lettre de la semaine.
- **Tout ce qu'il contient est lu par votre IA** : ce qu'elle ne doit pas lire reste hors du brain. Une fiche privée se lit comme les autres ; son texte est seulement tenu à l'écart de ce que vous partagez (la copie en ligne, sauf si vous l'avez choisi, et la carte partagée).
- **Il vit tout seul** : une sauvegarde chaque soir (sans IA, sans coût), une revue chaque semaine par Claude, et, si vous le voulez, une lecture en journée : toutes les demi-heures, un Claude en arrière-plan lit vos conversations terminées et les documents que vous avez modifiés, et écrit ce qu'ils apprennent.
- **Rien ne tourne sans votre oui** : ce que votre brain contient et qui tourne tout seul (ses programmes, ses lecteurs de fond, vos garde-fous et vos skills, les services auxquels vos clés sont envoyées) ne tourne sur un ordinateur qu'une fois que vous l'y avez approuvé, et le redemande quand il a changé.
- **Vous choisissez ce qu'il fait** : recherche par le sens, sauvegarde en ligne, sauvegarde du soir, revue de la semaine, journal de travail, mails et agenda, dossiers suivis, lecture en journée, copie froide. Chacune est expliquée, avec ce qu'elle implique, avant que vous choisissiez.
- **Vous le voyez** : une carte de vos fiches, en page sur votre ordinateur, ou en application web privée si vous utilisez Hypervibe.
- **Dans votre langue** : Claude parle la vôtre, et tout ce que le plugin écrit pour vous (les documents de votre brain, le rapport de la semaine, l'historique, jusqu'au format des fiches) est en français ou en anglais, selon les réglages de votre ordinateur.
- **Vos propres types de fiches** : conférences, livres, clients, œuvres... proposés d'après ce que montre votre ordinateur, et validés avec vous.
- **Windows, macOS et Linux**.

## Installer

Il faut Claude Code (l'app de bureau ou la ligne de commande). Node 22.16+ et git sont vérifiés, et installés si besoin, par la première skill.

```
/plugin marketplace add flavien-ia/hypervibe-brain
/plugin install brain@hypervibe-brain
```

**Depuis un zip, dans l'app Claude (le plus simple)** : prenez le fichier `hypervibe-brain-<version>.zip` de la dernière version publiée, sur [hypervibe.fr/brain](https://hypervibe.fr/brain) (le même fichier est joint à chaque [version du dépôt](https://github.com/flavien-ia/hypervibe-brain/releases/latest)). Sans le décompresser, ouvrez **Personnalisation > Plugins**, choisissez **Téléverser un plugin** et donnez-lui le fichier zip. Aucune commande à taper.

**Pour mettre à jour**, quelle que soit l'installation : **`/brain:update`**.

Puis, dans une nouvelle session : **`/brain:start`**. Elle guide tout le démarrage et reprend là où vous vous étiez arrêté ; les skills ci-dessous se lancent ensuite chacune séparément.

## Les skills

**Le cœur**, ce que tout brain a :

| Skill | Ce qu'elle fait |
|---|---|
| `/brain:start` | Tout le démarrage, partie après partie, repris là où vous vous étiez arrêté : la recherche d'un brain que vous avez déjà (ici ou sur votre GitHub), l'ordinateur mis en état, le brain lui-même avec sa vue en direct, les outils qui le nourrissent, puis le savoir qui existe déjà, chaque bloc compté et son coût annoncé avant de commencer, vos skills et vos garde-fous, et les routines qui le font vivre. |
| `/brain:create` | La construction guidée, comme le `/bootstrap` d'Hypervibe : les décisions, la création et les premières fiches, les sources, puis les modules que vous voulez. Reprend là où on s'était arrêté. |
| `/brain:sources` | Ce qui nourrit le brain : vos mails et votre agenda, les dossiers où vous travaillez, votre travail avec Claude, vos écrits existants, et des sources bien à vous, définies avec vous. |
| `/brain:contacts` | Un annuaire des personnes avec qui vous échangez par email, interrogeable dans chaque conversation ; seules celles qui comptent deviennent des fiches. |
| `/brain:ingest` | Faire entrer un de vos écrits (notes, articles, documents), trois fiches d'essai d'abord. |
| `/brain:capture` | Capturer une pensée, classée tout de suite (cherche d'abord, ne duplique jamais). |
| `/brain:review` | La revue de la semaine : les nouveautés, ce que les sources ont apporté, les promotions, les orphelines, des liens proposés. |
| `/brain:status` | Où en est le brain, ce qui a besoin de vous en premier (une alerte, une lecture en arrière-plan en panne), et la prochaine étape utile. |
| `/brain:update` | Met le plugin à jour avec la dernière version publiée, et la sauvegarde du soir avec lui. |
| `/brain:executive` | Ce que votre IA sait faire : vos propres skills et les garde-fous (hooks) qui les encadrent, rangés dans le brain à côté de ce qu'il sait, pour qu'un autre ordinateur ou une autre IA les retrouve. Claude Code appelle toujours chaque skill par sa `/commande` ; un garde-fou est verrouillé contre les écritures de l'IA. |

**Les modules**, proposés à la fin de `/brain:create`, ou ajoutés quand vous voulez :

| Famille | Skill | Ce qu'elle fait |
|---|---|---|
| Protéger | `/brain:add-backup` | Une copie privée sur GitHub, une copie froide chaque semaine là où vous voulez, ou les deux. |
| Faire vivre | `/brain:add-routines` | Une sauvegarde chaque soir (sans IA, sans coût), une revue chaque semaine par Claude, et une lettre par email qui la résume. |
| Utiliser | `/brain:add-embeddings` | La recherche par le sens. |
| | `/brain:viz` | Voir le brain comme une carte : une page sur votre ordinateur, ou une application web privée si Hypervibe est installé. |
| | `/brain:live` | Voir le brain en direct, dans une fenêtre à lui : les fiches s'allument quand Claude les lit et les écrit, avec ce qui nourrit le brain et ce que cela consomme. |
| Étendre | `/brain:add-second-computer` | Le même brain sur un second ordinateur, synchronisé par sa copie GitHub privée. |
| | `/brain:add-cloud` | Le brain lisible depuis le cloud, en lecture seule, par les agents en ligne à qui vous donnez une clé (votre propre compte Cloudflare, en Europe). |

## La vue en direct

`/brain:live` ouvre une fenêtre sur votre brain tel qu'il vit : la carte de vos fiches, qui s'allument au moment où Claude les lit ou les écrit ; autour d'elle, les sources qui nourrissent le brain et ce que chacune est en train de faire ; ce que coûte la lecture en arrière-plan de vos conversations et de vos documents ; les réglages de chaque source (son rythme, une pause, un plafond par jour, ce qui ne doit jamais être lu) ; un historique où tout ce que la machine a écrit s'annule en un clic ; et de quoi valider ce qu'elle a écrit : un filtre « Graines », un bouton « Valider » sur chaque fiche écrite par la machine, et « Graine suivante ». Une source qui attend que votre coffre soit ouvert y porte une petite clé : c'est une attente, pas une panne.

C'est une page que seul votre ordinateur peut ouvrir (`127.0.0.1`), et seulement avec le jeton de la vue, gardé sur votre ordinateur (`~/.hypervibe-brain/live-token.json`) : un autre compte de l'ordinateur, ou une page web, ne peut pas lire votre brain par elle. Sans dépendance ni étape de construction. Elle est livrée avec le plugin (`live/`), démarre avec votre session une fois allumée (`scripts/live.mjs on`, `off`, `open`, `state`), et suit d'elle-même une mise à jour du plugin. Sur un brain tout neuf, elle dit ce qui manque encore (pas de fiche, pas de source, la lecture en journée pas démarrée), chaque fois avec la phrase à dire à Claude.

## Deux étages

Le brain a deux étages. **Le savoir** (les fiches), c'est ce que vous savez, pensez et avez décidé. **L'étage exécutif**, c'est ce que votre IA sait faire : vos propres skills et les hooks qui les encadrent, dans le dossier `executive/` de votre brain. Une skill vit dans le brain, et Claude Code la retrouve là où il la cherche toujours, par un lien : améliorer la skill, c'est améliorer votre brain. Un garde-fou y vit aussi, et l'IA ne peut ni le modifier ni le déplacer (vous seul le faites). Les plugins que vous installez sont montrés à côté, pas déplacés : chacun est un produit, avec son propre dépôt. Sur un nouvel ordinateur, `/brain:executive` remet tout en place. **Une autre IA branchée sur votre brain** (Codex, Cursor, Claude Desktop...) reçoit vos skills par le serveur du brain : en prompts qu'elle peut vous montrer, et par un outil, `brain_skill`, avec lequel elle en lit une d'elle-même ; ce qui n'y parle qu'à Claude Code est traduit pour elle. Vos garde-fous ne peuvent pas arrêter les gestes d'une autre IA (ce sont des hooks de Claude Code) : elle les reçoit comme des règles à tenir, et vous demande avant. Voir `docs/executive.md`.

Dans la vue en direct, le calque **Harnais** montre l'étage exécutif en couronne autour de l'anneau des outils : un arc par harnais (vos skills, puis chaque plugin), chacun tourné vers les outils dont ses skills se servent. Une skill s'allume au moment où votre IA s'en sert.

## Comment il est construit

- **Le code vit dans le plugin, le brain n'est que des données** : une mise à jour du plugin répare tous les brains d'un coup. Le brain est retrouvé par `~/.hypervibe-brain/config.json`.
- **Aucune dépendance** : la base est le SQLite fourni avec Node, le serveur MCP parle son protocole à la main. Rien à installer, rien qui casse à l'installation.
- **L'index se construit tout seul** à partir des fiches, dès qu'une fiche a bougé, et seulement pour ce qui a changé : les fiches différentes sont réécrites, les autres restent. Les vecteurs de la recherche par le sens sont versionnés dans git, un petit fichier par fiche : un clone retrouve sa recherche par le sens sans un seul appel payant.
- `tests/banc.mjs` joue le parcours complet dans un dossier jetable, avec un faux dossier utilisateur et une fausse API d'embeddings ; `tests/banc-sync.mjs` joue deux ordinateurs autour d'un GitHub local ; `tests/banc-cloud.mjs` joue la copie Cloudflare avec un faux wrangler et le vrai Worker ; `tests/banc-update.mjs` joue une mise à jour du plugin sans le réseau ; `tests/zones/*.mjs` vérifient chaque partie du plugin (les écritures, le programme de fond et les juges, l'index et la recherche, la vue en direct, les skills et la documentation). À relancer après toute modification.

## Voir aussi

**Hypervibe Brain entreprise** est un outil distinct : cartographier les données d'une entreprise et construire son ontologie métier.

## Licence

Apache-2.0.
