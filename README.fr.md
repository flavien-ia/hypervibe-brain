# Hyperbrain

**Un second brain pour Claude Code.** Vos idées, vos projets, les gens qui comptent, ce que vous avez écrit et décidé, en fiches markdown liées entre elles. Claude les consulte depuis n'importe quelle conversation, sans qu'on le lui demande, et sait y écrire proprement.

*[English version](README.md)*

## Ce que vous obtenez

- **Vos fiches sont à vous** : de simples fichiers markdown, dans le dossier de votre choix, dans votre propre dépôt git (sauvegarde GitHub privée recommandée). Aucun service en ligne imposé.
- **Claude lit votre brain partout** : le serveur MCP du plugin dit à chaque session que votre brain existe et quand le consulter.
- **Recherche par les mots et par le sens** : chaque mot, n'importe où, accents ignorés ; et, avec une clé OpenAI (quelques centimes pour des milliers de fiches), par le sens.
- **Un modèle de confiance** : ce que la machine écrit entre en `seed`, n'écrase jamais ce que vous avez validé, et passe `trusted` quand il a pris racine. Une fiche privée n'est jamais montrée à une IA.
- **Il vit tout seul** : une sauvegarde chaque soir (sans IA, sans coût) et une revue chaque semaine par Claude.
- **Vous choisissez ce qu'il fait** : recherche par le sens, sauvegarde en ligne, sauvegarde du soir, revue de la semaine, journal de travail, mails et agenda, dossiers suivis, copie froide. Chacune est expliquée, avec ce qu'elle implique, avant que vous choisissiez.
- **Vous le voyez** : une carte de vos fiches, en page sur votre ordinateur, ou en application web privée si vous utilisez Hypervibe.
- **Dans votre langue** : Claude parle la vôtre, et tout ce que le plugin écrit pour vous (les documents de votre brain, le rapport de la semaine, l'historique, jusqu'au format des fiches) est en français ou en anglais, selon les réglages de votre ordinateur.
- **Vos propres types de fiches** : conférences, livres, clients, œuvres... proposés d'après ce que montre votre ordinateur, et validés avec vous.
- **Windows, macOS et Linux**.

## Installer

Il faut Claude Code (l'app de bureau ou la ligne de commande). Node 22.13+ et git sont vérifiés, et installés si besoin, par la première skill.

```
/plugin marketplace add flavien-ia/hyperbrain-harness
/plugin install hyperbrain@hyperbrain-harness
```

**Depuis un zip reçu, dans l'app Claude (le plus simple)** : sans le décompresser, ouvrez **Personnalisation > Plugins**, choisissez **Téléverser un plugin** et donnez-lui le fichier zip. Aucune commande à taper. Pour une mise à jour, téléversez le nouveau zip de la même façon.

Puis, dans une nouvelle session : **`/hyperbrain:start-hyperbrain`**.

## Les skills

**Le cœur**, ce que tout brain a :

| Skill | Ce qu'elle fait |
|---|---|
| `/hyperbrain:start-hyperbrain` | Vérifie l'ordinateur (Node, git, votre identité git), installe ce qui manque, propose de créer le brain. |
| `/hyperbrain:create-brain` | La construction guidée, comme le `/bootstrap` d'Hypervibe : les décisions, la création et les premières fiches, les sources, puis les modules que vous voulez. Reprend là où on s'était arrêté. |
| `/hyperbrain:brain-sources` | Ce qui nourrit le brain : vos mails et votre agenda, les dossiers où vous travaillez, votre travail avec Claude, vos écrits existants, et des sources bien à vous, définies avec vous. |
| `/hyperbrain:brain-contacts` | Un annuaire des personnes avec qui vous échangez par email, interrogeable dans chaque conversation ; seules celles qui comptent deviennent des fiches. |
| `/hyperbrain:brain-ingest` | Faire entrer un de vos écrits (notes, articles, documents), trois fiches d'essai d'abord. |
| `/hyperbrain:brain` | Capturer une pensée, classée tout de suite (cherche d'abord, ne duplique jamais). |
| `/hyperbrain:brain-review` | La revue de la semaine : les nouveautés, ce que les sources ont apporté, les promotions, les orphelines, des liens proposés. |
| `/hyperbrain:brain-status` | Où en est le brain, et la prochaine étape utile. |

**Les modules**, proposés à la fin de `create-brain`, ou ajoutés quand vous voulez :

| Famille | Skill | Ce qu'elle fait |
|---|---|---|
| Protéger | `/hyperbrain:add-backup` | Une copie privée sur GitHub, une copie froide chaque semaine là où vous voulez, ou les deux. |
| Faire vivre | `/hyperbrain:add-routines` | Une sauvegarde chaque soir (sans IA, sans coût), une revue chaque semaine par Claude, et une lettre par email qui la résume. |
| Utiliser | `/hyperbrain:add-meaning` | La recherche par le sens. |
| | `/hyperbrain:brain-viz` | Voir le brain comme une carte : une page sur votre ordinateur, ou une application web privée si Hypervibe est installé. |
| Étendre | `/hyperbrain:add-second-computer` | Le même brain sur un second ordinateur, synchronisé par sa copie GitHub privée. |
| | `/hyperbrain:add-cloud` | Le brain lisible depuis le cloud, en lecture seule, par les agents en ligne à qui vous donnez une clé (votre propre compte Cloudflare, en Europe). |

## Comment il est construit

- **Le code vit dans le plugin, le brain n'est que des données** : une mise à jour du plugin répare tous les brains d'un coup. Le brain est retrouvé par `~/.hyperbrain/config.json`.
- **Aucune dépendance** : la base est le SQLite fourni avec Node, le serveur MCP parle son protocole à la main. Rien à installer, rien qui casse à l'installation.
- **L'index se reconstruit tout seul** à partir des fiches, dès qu'une fiche a bougé. Les vecteurs de la recherche par le sens sont versionnés dans git, un petit fichier par fiche : un clone retrouve sa recherche par le sens sans un seul appel payant.
- `tests/banc.mjs` joue le parcours complet dans un dossier jetable, avec un faux dossier utilisateur et une fausse API d'embeddings ; `tests/banc-sync.mjs` joue deux ordinateurs autour d'un GitHub local ; `tests/banc-cloud.mjs` joue la copie Cloudflare avec un faux wrangler et le vrai Worker. À relancer tous les trois après toute modification.

## Voir aussi

**Hyperbrain entreprise** est un outil distinct : cartographier les données d'une entreprise et construire son ontologie métier.

## Licence

Apache-2.0.
