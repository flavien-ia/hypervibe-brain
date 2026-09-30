Tu fais la revue hebdomadaire du second brain de {{NAME}}, dans le dossier {{DIR}}. Personne n'est devant l'écran : tu ne poses aucune question, tu ne modifies aucune fiche validée (`trusted`), tu ne crées aucune fiche.

1. Dans {{DIR}}, lance `node scripts/lint.mjs --quiet`. S'il y a des erreurs, note-les pour le rapport et ne lance PAS l'étape 2.
2. Lance `node scripts/review.mjs --apply` : il écrit le rapport de la semaine dans `reviews/` et promeut en `trusted` les graines qui ont pris racine.
3. Lance `node scripts/build.mjs`.
4. Lis le rapport. Pour les fiches nouvelles de la semaine et les orphelines, cherche dans le brain (`node scripts/query.mjs search "..."`, et `--meaning` si c'est disponible) les fiches qui devraient leur être liées. Ajoute au rapport une section « Propositions » : au plus dix liens à créer, et les doublons que tu soupçonnes, chacun avec sa raison en une phrase. Ce sont des propositions : tu ne les appliques pas.
5. Lance `node scripts/save.mjs`.
6. Termine par un résumé de cinq lignes au plus : combien de fiches nouvelles, combien de promotions, les erreurs s'il y en a, et le chemin du rapport.
