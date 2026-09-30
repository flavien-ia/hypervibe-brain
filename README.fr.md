# Hyperbrain

**Un second brain pour Claude Code.** Vos idées, vos projets, les gens qui comptent, ce que vous avez écrit et décidé, en fiches markdown liées entre elles. Claude les consulte depuis n'importe quelle conversation, sans qu'on le lui demande, et sait y écrire proprement.

*[English version](README.md)*

## Ce que vous obtenez

- **Vos fiches sont à vous** : de simples fichiers markdown, dans le dossier de votre choix, dans votre propre dépôt git (sauvegarde GitHub privée recommandée). Aucun service en ligne imposé.
- **Claude lit votre brain partout** : le serveur MCP du plugin dit à chaque session que votre brain existe et quand le consulter.
- **Recherche par les mots et par le sens** : chaque mot, n'importe où, accents ignorés ; et, avec une clé OpenAI (quelques centimes pour des milliers de fiches), par le sens.
- **Un modèle de confiance** : ce que la machine écrit entre en `seed`, n'écrase jamais ce que vous avez validé, et passe `trusted` quand il a pris racine. Une fiche privée n'est jamais montrée à une IA.
- **Il vit tout seul** : une sauvegarde chaque soir (sans IA, sans coût) et une revue chaque semaine par Claude.

## Installer

Il faut Claude Code (l'app de bureau ou la ligne de commande). Node 22.13+ et git sont vérifiés, et installés si besoin, par la première skill.

```
/plugin marketplace add flavien-ia/hyperbrain-harness
/plugin install hyperbrain@hyperbrain-harness
```

Puis, dans une nouvelle session : **`/hyperbrain:start-hyperbrain`**.

## Les skills

| Skill | Ce qu'elle fait |
|---|---|
| `/hyperbrain:start-hyperbrain` | Vérifie l'ordinateur (Node, git, votre identité git ; GitHub et Cloudflare en option), installe ce qui manque, propose de créer le brain. |
| `/hyperbrain:create-brain` | La construction guidée, en cinq étapes avec une porte chacune : les décisions, la création et les premières fiches, Claude qui le lit partout, vos sources, les routines. Reprend là où on s'était arrêté. |
| `/hyperbrain:brain` | Capturer une pensée, classée tout de suite (cherche d'abord, ne duplique jamais). |
| `/hyperbrain:brain-ingest` | Faire entrer une source existante (notes, articles, documents), trois fiches d'essai d'abord. |
| `/hyperbrain:brain-review` | La revue de la semaine : les nouveautés, les promotions, les orphelines, les liens cassés, des liens proposés. |
| `/hyperbrain:brain-status` | Où en est le brain, et la prochaine étape utile. |
| `/hyperbrain:brain-routines` | Armer, vérifier ou arrêter la sauvegarde du soir et la revue de la semaine. |

## Comment il est construit

- **Le code vit dans le plugin, le brain n'est que des données** : une mise à jour du plugin répare tous les brains d'un coup. Le brain est retrouvé par `~/.hyperbrain/config.json`.
- **Aucune dépendance** : la base est le SQLite fourni avec Node, le serveur MCP parle son protocole à la main. Rien à installer, rien qui casse à l'installation.
- **L'index se reconstruit tout seul** à partir des fiches, dès qu'une fiche a bougé. Les vecteurs de la recherche par le sens sont versionnés dans git, un petit fichier par fiche : un clone retrouve sa recherche par le sens sans un seul appel payant.
- `tests/banc.mjs` joue le parcours complet dans un dossier jetable, avec un faux dossier utilisateur et une fausse API d'embeddings. À relancer après toute modification : `node tests/banc.mjs`.

## Voir aussi

**Hyperbrain entreprise** est un outil distinct : cartographier les données d'une entreprise et construire son ontologie métier.

## Licence

Apache-2.0.
