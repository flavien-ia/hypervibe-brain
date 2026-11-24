# /brain:status

Fait le point sur votre brain en quelques chiffres : combien de fiches, dans quel état, s'il est protégé, si ses tâches automatiques tournent. Claude termine par **une seule recommandation**, la plus utile maintenant, et propose de s'en occuper tout de suite.

## Quand l'utiliser

- Vous voulez savoir où en est votre brain après quelques jours ou quelques semaines d'usage
- Vous doutez que la sauvegarde du soir ou la revue de la semaine ait bien tourné
- Vous ne savez pas quelle est la prochaine étape utile
- Votre brain vit sur deux ordinateurs et vous voulez vérifier qu'ils sont bien à jour l'un par rapport à l'autre
- Vous avez reçu un email disant que quelque chose s'est mal passé, ou qu'un juge de votre brain est en panne

## Comment ça se passe

1. **Le relevé** : Claude interroge le brain et ses tâches automatiques. S'il n'y a pas encore de brain sur cet ordinateur, il vous le dit, vous propose `/brain:start`, et s'arrête là.
  - Ce qui a besoin de vous est dit avant tout chiffre : un Claude qui lit en arrière-plan et ne peut plus travailler (lequel, depuis quand, la cause probable en mots simples), ou une alerte de la semaine. Claude propose alors de réparer tout de suite.
2. **Le brain** : le nombre de fiches, combien sont des graines et combien sont fiables, et vos domaines avec le nombre de fiches de chacun. Un domaine resté vide est signalé. Quand beaucoup de graines attendent, Claude vous rappelle comment elles se valident : dans la vue en direct (le filtre « Graines », puis le bouton « Valider » de chaque fiche), ou en disant à Claude quelle fiche est juste.
3. **Sa santé** : les erreurs (il doit y en avoir zéro), les avertissements, et si la recherche par le sens est active ou non.
4. **Sa sécurité** : s'il est sauvegardé en ligne ou seulement sur cet ordinateur, la date de la dernière sauvegarde, et les fichiers pas encore sauvegardés.
5. **Sa vie** : la sauvegarde du soir (en place ou non, son dernier passage et son résultat) et la revue de la semaine (en place ou non, son dernier rapport).
6. **Ce qui le nourrit et ce qu'il fait** : les sources actives (mails et agenda, travail avec Claude, dossiers suivis) et les modules en place (copie en ligne, copie froide, recherche par le sens, carte), dits en mots simples.
7. **Son démarrage** : si le démarrage n'a pas été mené jusqu'au bout, Claude vous dit dans quelle partie il en est (le brain lui-même, les outils qui le nourrissent, le savoir qui entre, vos skills et vos garde-fous, les routines) et quelle étape vient ensuite. `/brain:start` reprend à partir de là.
8. **La recommandation** : une phrase, une seule action, et la proposition de la faire maintenant.

## Ce que ça crée pour vous

- Un **tableau de bord court**, dans la conversation : des chiffres d'abord, puis une recommandation
- Si le brain vit sur deux ordinateurs : lequel le fait tourner, et le retard ou l'avance de celui où vous êtes
- L'état de votre annuaire : combien de personnes, combien dans le premier cercle, combien ont une fiche
- Rien d'autre : cette skill lit, elle ne crée et ne modifie aucune fiche

## Prérequis

- Un brain déjà créé sur cet ordinateur (sinon Claude vous propose de le créer)

## Astuces

{{callout:info|La règle du zéro erreur}}
Une erreur dans une fiche empêche le brain de mettre à jour son index, donc sa recherche. C'est pourquoi la corriger passe avant tout le reste dans la recommandation de Claude. Les avertissements, eux, ne bloquent rien.
{{/callout}}

{{callout:tip|Dans quel ordre Claude recommande}}
Toujours le même : corriger les erreurs, réparer une lecture en arrière-plan en panne ou une source en difficulté, poursuivre le démarrage là où il en est (`/brain:start`), protéger le brain (`/brain:add-backup`), mettre en place les tâches automatiques (`/brain:add-routines`), ajouter une source (`/brain:sources`) ou faire entrer un écrit (`/brain:ingest`), puis la recherche par le sens (`/brain:add-embeddings`).
{{/callout}}

{{callout:warning|Ce qui est dit en premier}}
Une lecture en arrière-plan en panne et une alerte de la semaine passent avant tout le reste, avec la proposition de réparer. Sur deux ordinateurs, un conflit (la même fiche modifiée des deux côtés) ou des changements mis de côté en attente sont annoncés en premier eux aussi. Il en va de même pour une de vos sources personnelles en erreur, ou pas encore approuvée sur cet ordinateur, avec ce qu'il faut faire. Une source qui attend seulement que votre coffre Hypervibe soit ouvert n'est pas en erreur : Claude le dit comme une attente, et elle repart toute seule une fois le coffre ouvert.
{{/callout}}
