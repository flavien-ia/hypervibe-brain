# Le rythme du brain

Le brain a deux horloges et deux événements. Cette page dit quand chaque source tourne, pourquoi elles tournent ensemble, et ce qui se passe quand l'une d'elles est longue.

## Deux horloges, deux événements

| Quand | Qui | Réglage |
|---|---|---|
| **À chaque tic de l'horloge** (la demi-heure par défaut) | Les programmes qui regardent ce qui a bougé : agenda, courrier, dossiers, conversations | `"every": "30m"` dans le `source.json` de la source |
| **Le soir**, à la sauvegarde | Les programmes coûteux ou dont la donnée bouge peu : veille, vidéos, miroirs, vérifications | `"every": "day"` |
| **Quand sa pile reçoit quelque chose** | Un juge : une IA qui lit ce qu'un programme a déposé pour elle | `"gather"` |
| **À la revue de la semaine** | Les sources que Claude lit avec la personne, le jour choisi pour la revue | `"kind": "claude"`, sans `"live"` |

Une source du soir peut aussi se réveiller en journée, après une skill ou une autre source (`"after": ["skill:devis", "source:contacts"]`).

## Le tic

Un rythme n'est pas « toutes les trente minutes depuis mon dernier passage ». C'est un tic de l'horloge : `30m` veut dire :00 et :30, pour toutes les sources qui portent ce rythme, quoi qu'il se soit passé avant. `hour` veut dire l'heure pile.

Le hub regarde chaque minute si un tic est tombé depuis le dernier passage de chaque source. Si oui, elle est due.

Avant le 19 novembre 2026, chaque source comptait son rythme depuis son propre dernier passage. Chacune dérivait de la durée de ses passages, le cycle d'un juge repoussait celles qui avaient tourné avec lui, et au bout d'une journée neuf sources « au quart d'heure » passaient à quatre moments différents, chacune suivie de sa propre reconstruction de l'index.

## L'ordre d'un tic

1. Les programmes dus passent, l'un après l'autre. Rien ne tourne en parallèle : ils écrivent dans le même brain.
2. Les juges lisent ce que ces programmes viennent de déposer, lot après lot, jusqu'à ce que leur pile soit vide, pendant trente minutes au plus.
3. Si quelque chose a été écrit, l'index est reconstruit une fois, et ce qui a été écrit est commité (une fois par heure au plus, jamais poussé).

## La pile d'un juge

Un programme (une veille) dépose sur la pile d'un juge ce qui vient d'arriver, et le juge lit dans le même tic. Tout ce qui est arrivé depuis le tic précédent est donc lu en un seul passage, ce qui compte : un passage coûte surtout par ce qu'il recharge à chaque fois, pas par ce qu'il lit.

Un élément arrivé à 10 h 05 est déposé et lu à 10 h 30. Le délai va de zéro à trente minutes.

`"gather": "30m"` fait attendre le tic suivant avant de lire (trente à soixante minutes de délai). C'était le réglage par défaut jusqu'au 20 novembre 2026. Il garde un intérêt pour un fil de mail très actif, où deux réponses rapprochées sont alors lues en une fois ; les veilles des conversations et des documents attendent déjà le calme avant de déposer, attendre encore n'y apporte que du retard.

Un juge n'a pas de rythme à lui : il suit ses sources. Dans la vue, un juge dont la pile est vide affiche le prochain tic.

Un juge ne lit que pendant ses heures (`"hours": [7, 23]` par défaut).

## Quand un passage est long

- Un programme a une durée limite (`timeoutMin`), cinq minutes le plus souvent.
- Un juge rend la main au bout de trente minutes ; sa pile continue au tic suivant.
- Un tic qui tombe pendant qu'un juge lit n'est pas perdu : ses sources passent juste après, en retard, et le tic suivant est de nouveau à l'heure.
- Rien n'est manqué par un retard : chaque source lit ce qui a changé depuis son dernier passage réussi.

## Après un échec

- Un programme qui échoue attend son tic suivant.
- Un juge qui échoue se repose une heure avant de réessayer, dix minutes si la cause est le réseau.
- Au deuxième échec de suite, la personne reçoit un mail, une fois par jour au plus. Si la cause est le réseau, le mail ne part qu'après une heure de panne continue : une coupure qui se répare seule ne dérange personne.
- Un coffre fermé n'est pas un échec : la source attend dans une file, et passe au premier battement qui trouve le coffre ouvert.

## Le coffre fermé met une source en attente

Les clés des sources restent dans le coffre de la personne, quand elle en a un. Une source qui nomme les clés qu'elle lit (`"needs"` dans son `source.json`) ne tourne pas tant que le coffre est fermé : elle est mise en attente, sans échec, sans alerte, et sans compter dans ses passages ratés. Cela vaut pour le tic de la journée comme pour la sauvegarde du soir.

- La file est `~/.hypervibe-brain/queue.json` : ce qui attend, jamais un secret.
- La source repart seule au premier battement qui trouve le coffre ouvert, qui que ce soit qui l'ait ouvert. Un coffre trouvé fermé n'est redemandé que cinq minutes plus tard, ou aussitôt que la fenêtre ouverte par le hub se ferme : le délai va de zéro à six minutes environ.
- Dans la vue en direct, une source qui attend porte une petite clé.
- La fenêtre du coffre est proposée, une seule à la fois. Fermée sans mot de passe, elle n'est pas reproposée avant une heure.

L'accès des juges à Claude est le seul secret qui ne vit pas dans le coffre : il est gardé dans un fichier de l'ordinateur (`~/.hypervibe-brain/judge-token.json`). Un coffre se referme au bout de quelques heures ; avec le jeton dedans, tous les lecteurs de fond s'arrêtaient avec lui, chaque nuit, jusqu'à ce que quelqu'un le rouvre. Décision du 21 novembre 2026.

## Dans le code

- `scripts/pure.mjs` : les tics (`tickPassed`, `nextTick`, `clockOrigin`) et la lecture d'un rythme (`interval`).
- `scripts/hub.mjs` : le battement, ce qui est dû (`dueByTime`), l'ordre d'un tic.
- `scripts/judge.mjs` : la pile d'un juge et son rassemblement (`duePiles`).
- `scripts/vault-queue.mjs` : la file d'attente du coffre, pour le battement comme pour le soir ; `scripts/judge-token.mjs` : le jeton des juges, hors du coffre.
- `live/activity.mjs` : le prochain passage affiché autour de chaque outil dans la vue.
- Les vérifications : scènes `hub`, `judges` et `standard-sources` du banc.
