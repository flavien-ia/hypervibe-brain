# La documentation du plugin

Ce dossier explique comment le plugin fonctionne, sujet par sujet. Il est écrit pour nous aujourd'hui, en français, et servira de base à la documentation publique.

Une page dit ce que fait le plugin et pourquoi, sans recopier le code. Elle se termine par les fichiers concernés et les vérifications du banc qui la couvrent, pour qu'on sache où regarder quand elle ne suffit plus.

## Les pages écrites

| Page | Ce qu'elle explique |
|---|---|
| [Ce qui tourne tout seul est approuvé sur chaque ordinateur](approbations.md) | Les empreintes et les approbations par ordinateur (garde-fous, skills, programmes, juges, registre des données, dossiers suivis), le lanceur des garde-fous, ce qui était déjà en place, les règles d'un juge, les limites |
| [Les journaux du brain](journal.md) | Où va chaque ligne, le fichier par mois, les lignes silencieuses, qui lit quoi |
| [La mémoire de l'IA entre dans le brain](memoire.md) | La sauvegarde, la mise de côté, les registres par lots, la relecture, le verrou et le retour arrière |
| [Les réglages propres à chaque brain](reglages.md) | Où se met chaque sorte de règle propre à une personne, qui la lit et quand, les clés de `brain.json`, les réglages des suggestions et des rappels des leçons |
| [Le rythme du brain](rythme.md) | Les deux horloges, le tic commun, la pile d'un juge, ce qui se passe quand un passage est long, la source qui attend un coffre fermé |

## Les pages à écrire

Ces sujets ne sont expliqués aujourd'hui que dans les commentaires du code et dans `CHANGELOG.md`.

| Sujet | Où est l'explication pour l'instant |
|---|---|
| Les juges : lancement étanche, limites, preuve de lecture | `scripts/judge.mjs`, `scripts/readers/opened.mjs` |
| Les sources : les trois genres, la confiance, les modèles standard | En-tête de `scripts/sources.mjs`, `templates/sources/` |
| L'annulation d'une écriture | `scripts/undo.mjs`, `scripts/before.mjs` |
| La sauvegarde et la synchronisation entre ordinateurs | `scripts/save.mjs`, `scripts/sync.mjs` |
| Le démarrage et la première grande session (les neuf étapes, les cinq blocs, la page) | `scripts/start.mjs`, `scripts/start-page.mjs` (la page du démarrage), `scripts/ledger.mjs`, `skills/_catch-up/` |
| Ce que la machine peut écrire dans une fiche (créer, ajouter un fait, tenir une zone machine, proposer) | En-tête de `scripts/notes.mjs` (la règle post-veto, `factRefusal`), `scripts/fact.mjs`, `templates/brain/*/WRITING_RULES.md` (règle 7) |
| La validation d'une graine | `scripts/promote.mjs`, `scripts/review.mjs` (les promotions de la revue), `live/page/validate.js` |
| Ce qu'une fiche privée laisse sur l'ordinateur | En-têtes de `scripts/engine.mjs`, `scripts/cloud.mjs` et `scripts/viz.mjs` |
| L'index et la recherche (la construction de ce qui a changé, les suggestions à chaque message) | En-têtes de `scripts/build.mjs`, `scripts/engine.mjs`, `scripts/suggest.mjs`, `scripts/hook-suggest.mjs` |
| La vue en direct (son jeton, ses routes, sa mise à jour) | `live/README.md`, `live/server.mjs`, `live/page/main.js` |
| Le coffre et les connexions | `scripts/health.mjs`, `scripts/judge-token.mjs`, `scripts/vault-queue.mjs` (l'attente d'une source et la place du jeton des juges sont déjà dans [Le rythme du brain](rythme.md)) |
| Le banc d'essai, ses scènes et les vérifications par partie | En-tête de `tests/banc.mjs`, `tests/zones/*.mjs` |

## Règles d'écriture de ces pages

- Une page, un sujet, un titre qui le nomme.
- Les faits datés quand ils expliquent un choix (« depuis le 18 novembre 2026 »).
- Les chiffres mesurés sur un vrai brain, pas des ordres de grandeur supposés.
- Quand le code change, la page change dans le même commit.
