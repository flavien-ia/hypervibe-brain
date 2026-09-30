# create-hyperbrain

Une skill Claude Code qui accompagne, étape par étape, la construction d'un **second brain** personnel : des fiches markdown liées entre elles (idées, projets, personnes, publications, décisions), une recherche plein texte et par le sens, et un branchement qui permet à Claude de le consulter depuis n'importe quelle session, et d'y écrire proprement.

Elle est **autonome** : aucun plugin requis, aucune dépendance à installer. Il faut seulement **Node 22.13 ou plus récent**, **git**, et Claude Code (en ligne de commande ou dans l'app de bureau).

## Installer

1. Récupérer ce dossier (une archive ou un clone).
2. Dans ce dossier : `node installer.mjs`
3. Ouvrir une **nouvelle** session Claude Code et taper `/create-hyperbrain`.

La skill fait le reste, en posant ses questions une à une. On peut s'arrêter à tout moment : `/create-hyperbrain` reprend là où on s'était arrêté.

## Le parcours

| Étape | Ce qui se passe | On passe à la suivante quand... |
|---|---|---|
| 1. Les décisions | pourquoi ce brain, ses domaines, ses sources, ce qui reste privé, sa sauvegarde | le récapitulatif est validé |
| 2. La création | le dossier du brain, puis une vingtaine de fiches tirées d'une conversation | une recherche retrouve une fiche |
| 3. Le branchement | Claude sait lire le brain et y écrire, depuis n'importe quelle session ; en option la recherche par le sens et une sauvegarde GitHub privée | une nouvelle session répond à partir des fiches |
| 4. Les sources | ce qu'on a déjà écrit entre, une source à la fois | une source entière est ingérée et vérifiée |
| 5. La vie | le réflexe de capturer, et une revue chaque semaine | une première revue a tourné |

## Ce que contient le brain créé

- `vault/` : les fiches, **la seule source de vérité**, une par sujet, en neuf types.
- `BRAIN.md` : pourquoi ce brain existe, ses domaines, ses règles. `SOURCES.md` : ce qui y entre, dans quel ordre.
- `scripts/` : l'index (SQLite, fourni par Node), la recherche, le serveur MCP que Claude interroge, la capture, la sauvegarde, la revue de la semaine.
- `index/embeddings/` : les vecteurs de la recherche par le sens, un petit fichier par fiche, **versionnés dans git** : un clone du brain retrouve sa recherche par le sens sans un seul appel payant.

## Les principes

1. **La machine crée, elle ne modifie jamais une fiche validée.** Ce qu'elle écrit entre en `seed` avec sa source ; la personne garde un droit de veto. Une `seed` devient `trusted` quand elle a pris racine.
2. **Une fiche `private` n'est jamais montrée à une IA.** Elle existe (titre, liens), son contenu ne sort jamais.
3. **Une source à la fois**, avec trois fiches d'essai relues avant chaque lot.
4. **Aucun secret** dans le brain, ni dans la conversation : une clé d'API se colle à la main dans le fichier `.env`.
5. **Rien n'est écrasé** dans la configuration de Claude : le branchement prend un autre nom si `brain` est déjà pris, sauvegarde `~/.claude.json` avant de le toucher, et se défait d'une commande (`node outils/connect.mjs --dir <brain> --remove`).

## Pour qui maintient la skill

- `gabarit/` : ce qui est copié dans chaque nouveau brain.
- `outils/init.mjs` crée un brain, `outils/connect.mjs` le branche ou le débranche.
- `tests/banc.mjs` joue le parcours complet dans un dossier jetable, avec un faux dossier utilisateur et une fausse API d'embeddings : **à relancer après toute modification** (`node tests/banc.mjs`). Rien n'y touche à la vraie configuration.
