# Le second brain de {{NAME}}

Ce dossier est le second brain de {{NAME}}. Les fiches de `vault/` sont **la seule source de vérité** ; tout le reste (l'index, les vecteurs) se reconstruit à partir d'elles.

Il est animé par le plugin **Hyperbrain** pour Claude Code : le code vit dans le plugin, ce dossier ne contient que des données. À lire avant toute décision : [`BRAIN.md`](BRAIN.md) (pourquoi ce brain existe, ses domaines, ses règles, ses composantes) et [`SOURCES.md`](SOURCES.md) (ce qui y entre, ce qui n'y entre jamais).

## Interroger

Par les outils MCP du plugin (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`), qui reconstruisent l'index tout seuls quand une fiche a bougé. Ne jamais charger le vault entier en contexte : il se traverse par recherche.

## Écrire

- **Une fiche neuve** passe par la skill `/hyperbrain:brain` : elle cherche d'abord, classe, valide et sauvegarde. Jamais un fichier écrit à la main.
- **Modifier une fiche existante** ne se fait qu'avec l'accord de {{NAME}}, devant lui ou elle, puis `updated` à la date du jour.
- `/hyperbrain:brain-status` dit où en est le brain ; la sauvegarde du soir enregistre ce qui est au repos.

## Les règles qui ne plient pas

1. **La machine crée, elle ne modifie jamais une fiche validée.** Ce qu'elle écrit entre en `seed` (graine) avec une `source` ; {{NAME}} garde un droit de veto. Une graine passe `trusted` (fiable) quand elle a pris racine (revue de la semaine) ou quand {{NAME}} la valide.
2. **Une graine se cite avec prudence, en le disant ; une fiche fiable se cite telle quelle.** Suivre la `source` avant d'affirmer quelque chose d'important.
3. **Une fiche `private` n'est jamais montrée à une IA** : elle existe (titre, liens) mais son contenu ne sort ni par la recherche ni par les outils MCP, et elle n'a pas de vecteur. `vault/danger-zone/` n'est même pas lu.
4. **Aucun secret dans une fiche** : ni clé, ni mot de passe, ni contenu de `.env`.
5. **Une source à la fois** : on n'ingère une nouvelle source qu'une fois la précédente vérifiée (`SOURCES.md`).
6. **Git** : jamais `git add -A` ni `git add .`, jamais de stash ni de `pull --autostash`, jamais de `push --force`. D'autres sessions peuvent travailler dans ce dossier.

## Le format d'une fiche

Voir [`vault/CLAUDE.md`](vault/CLAUDE.md).
