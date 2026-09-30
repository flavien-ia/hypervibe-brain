# {{NAME}} : second brain

Ce dossier est le second brain de {{NAME}}. Les fiches de `vault/` sont **la seule source de vérité** ; tout le reste (l'index, les vecteurs) se reconstruit à partir d'elles.

À lire avant toute décision : [`BRAIN.md`](BRAIN.md) (pourquoi ce brain existe, ses domaines, ses règles) et [`SOURCES.md`](SOURCES.md) (ce qui y entre, ce qui n'y entre jamais).

## Interroger

```bash
pnpm query search "plusieurs mots"          # chaque mot, n'importe où, accents ignorés
pnpm query search --meaning "une idée"      # par le sens (si une clé d'embeddings est posée)
pnpm query get <slug>                       # une fiche, ses liens, ce qui pointe vers elle
pnpm query neighbors <slug>                 # son voisinage
pnpm query timeline --since 2026-09         # dans l'ordre du temps
pnpm status                                 # l'état du brain
```

Depuis Claude, les mêmes questions passent par le serveur MCP (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`), qui reconstruit l'index tout seul quand une fiche a bougé.

Ne jamais charger le vault entier en contexte : il se traverse par recherche.

## Écrire

- **Une fiche neuve** passe par `scripts/capture.mjs` (ou la skill de capture) : elle cherche un nom libre, classe, valide et commite. Jamais un fichier écrit à la main par Claude.
- **Modifier une fiche existante** ne se fait qu'avec l'accord de {{NAME}}, devant lui ou elle, en éditant le fichier puis en mettant `updated` à la date du jour.
- `pnpm save` commite ce qui est au repos (fiches neuves ou supprimées, fiches modifiées qui n'ont plus bougé depuis 30 minutes) et pousse si c'est autorisé dans `hyperbrain.json` (`autoPush`).

## Les règles qui ne plient pas

1. **La machine crée, elle ne modifie jamais une fiche validée.** Ce qu'elle écrit entre en `seed` avec une `source` ; {{NAME}} garde le droit de veto. Une `seed` passe `trusted` quand elle a pris racine (revue hebdomadaire) ou quand {{NAME}} la valide.
2. **`seed` se cite avec prudence, en le disant ; `trusted` se cite tel quel.** Suivre la `source` avant d'affirmer quelque chose d'important.
3. **Une fiche `private` n'est jamais montrée à une IA** : elle existe (titre, liens) mais son contenu ne sort ni par la recherche ni par le MCP, et elle n'a pas de vecteur. `vault/danger-zone/` n'est même pas lu.
4. **Aucun secret dans une fiche** : ni clé, ni mot de passe, ni contenu de `.env`.
5. **Une source à la fois** : on n'ingère une nouvelle source qu'une fois la précédente vérifiée (`SOURCES.md`).
6. **Git** : jamais `git add -A` ni `git add .`, jamais de stash ni de `pull --autostash`. D'autres sessions peuvent travailler dans ce dossier.

## Le format d'une fiche

Voir [`vault/CLAUDE.md`](vault/CLAUDE.md).
