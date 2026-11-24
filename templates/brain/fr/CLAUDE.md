# Le second brain de {{NAME}}

Ce dossier est le second brain de {{NAME}}. Les fiches de `vault/` sont **la seule source de vérité** ; tout le reste (l'index, les vecteurs) se reconstruit à partir d'elles.

Il est animé par le plugin **Hypervibe Brain** pour Claude Code : le code vit dans le plugin, ce dossier ne contient que des données. À lire avant toute décision : [`BRAIN.md`](BRAIN.md) (pourquoi ce brain existe, ses domaines, ses règles, ses composantes) et [`SOURCES.md`](SOURCES.md) (ce qui y entre, ce qui n'y entre jamais).

## Interroger

Par les outils MCP du plugin (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`, `brain_fetch` pour la donnée vers laquelle une fiche pointe, `brain_contact` pour l'annuaire des contacts), qui reconstruisent l'index tout seuls quand une fiche a bougé. Ne jamais charger le vault entier en contexte : il se traverse par recherche.

## Écrire

- **Les règles d'écriture** : [`WRITING_RULES.md`](WRITING_RULES.md), une page, à lire avant toute écriture.
- **Une fiche neuve** passe par la skill `/brain:capture` : elle cherche d'abord, classe, valide et sauvegarde. Jamais un fichier écrit à la main.
- **Modifier une fiche existante** ne se fait qu'avec l'accord de {{NAME}}, devant lui ou elle, par les outils du plugin (`rewrite.mjs` pour son texte ou son titre, `promote.mjs` pour la valider), qui mettent `touche` à la date du jour et gardent le changement dans le journal, d'où il s'annule.
- `/brain:status` dit où en est le brain ; la sauvegarde du soir enregistre ce qui est au repos.

## Les règles qui ne plient pas

1. **La machine crée ; sur une fiche validée, elle ne fait qu'ajouter.** Ce qu'elle écrit entre en `graine` avec une `source` ; {{NAME}} garde un droit de veto. Sur une fiche `fiable`, elle ne réécrit jamais le texte de {{NAME}} : elle peut seulement y ajouter un fait qui dit d'où il vient, et tenir à jour ses zones machine. Sur une fiche validée qui est la pensée de {{NAME}} (un concept, une idée, une note de nature décision ou leçon), elle n'ajoute rien : elle propose le changement dans la lettre de la semaine. Une graine passe `fiable` quand elle a pris racine (revue de la semaine) ou quand {{NAME}} la valide : dans la vue en direct (`/brain:live`), le bouton « Valider » d'une fiche écrite par la machine, ou en disant à Claude quelle fiche est juste. Jamais sur le seul jugement de la machine.
2. **Une graine se cite avec prudence, en le disant ; une fiche fiable se cite telle quelle.** Suivre la `source` avant d'affirmer quelque chose d'important.
3. **Tout ce qui est dans le brain est fait pour être lu par l'IA de {{NAME}}.** Ce qui ne doit pas l'être reste dehors : les exclusions d'un juge, un dossier non suivi. Une fiche `prive` se lit comme les autres ; son texte est seulement tenu à l'écart de ce qui se partage (la copie en ligne ne le reçoit que si {{NAME}} l'a choisi, la carte partagée jamais). `vault/danger-zone/` n'est même pas lu.
4. **Aucun secret dans une fiche** : ni clé, ni mot de passe, ni contenu de `.env`.
5. **Une source à la fois** : on n'ingère une nouvelle source qu'une fois la précédente vérifiée (`SOURCES.md`).
6. **Git** : jamais `git add -A` ni `git add .`, jamais de stash ni de `pull --autostash`, jamais de `push --force`. D'autres sessions peuvent travailler dans ce dossier.

## Le format d'une fiche

Voir [`vault/CLAUDE.md`](vault/CLAUDE.md).
