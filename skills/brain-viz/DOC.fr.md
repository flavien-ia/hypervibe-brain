# /brain-viz

Montre votre brain sous forme de **carte** : les fiches, leurs liens, les domaines. Une page sur votre ordinateur, prête en quelques secondes, ou, si le plugin Hypervibe est installé, une application web privée que vous ouvrez de partout, téléphone compris.

## Quand l'utiliser

- Vous voulez voir d'un coup d'œil ce que contient votre brain et comment les fiches se relient
- Vous voulez repérer les fiches isolées, les domaines denses, les graines pas encore validées
- Vous voulez parcourir votre brain en cliquant de fiche en fiche plutôt qu'en posant des questions
- Vous voulez consulter votre brain depuis votre téléphone (avec Hypervibe)

## Comment ça se passe

1. **Ce qui est possible** : Claude vérifie qu'un brain existe (sinon il propose `/create-brain` et s'arrête) et regarde si Hypervibe est installé.
2. **Le choix** : sans Hypervibe, Claude fait directement la page. Avec Hypervibe, il vous présente les deux formes et ce que chacune implique. Vous pouvez faire la page maintenant et l'application plus tard.
3. **La page sur l'ordinateur** : Claude la construit à partir de vos fiches et l'ouvre pour vous. Rien ne quitte votre ordinateur.
4. **La lecture de la carte** : Claude vous l'explique en trois lignes. La couleur indique le domaine, la taille le nombre de liens, les pointillés une graine. En haut, une recherche et des filtres ; un clic sur une fiche l'ouvre à droite, avec ses liens.
5. **L'application privée (avec Hypervibe)** : Claude prépare un échantillon de vos données, puis confie la construction à Hypervibe, qui met l'application en ligne et vous donne son adresse. Comptez environ une demi-heure.
6. **La mise à jour de l'application** : Claude vous demande si la sauvegarde du soir peut mettre l'application à jour en ligne toute seule. Sans votre oui explicite, les données sont préparées chaque soir et envoyées seulement quand vous le demandez.
7. **Le test, c'est vous** : vous ouvrez, vous cliquez, et vous dites à Claude ce que vous en pensez. Il ne juge pas le résultat à votre place.

## Ce que ça crée pour vous

- Une **page de carte** dans le dossier de votre brain, reconstruite à partir des fiches (elle n'entre pas dans l'historique du brain)
- Son rafraîchissement automatique chaque soir, si la sauvegarde du soir est en place
- Avec Hypervibe : une **application web privée**, à un seul compte (le vôtre), sans inscription ni page publique, avec carte, recherche, filtres par domaine et par type, lecture d'une fiche et chronologie

## Prérequis

- Un brain déjà créé (`/create-brain`)
- Une connexion internet pour afficher la page (elle charge en ligne son outil d'affichage)
- Pour l'application : le plugin Hypervibe installé
- Pour le rafraîchissement automatique : la sauvegarde du soir (`/add-routines`)

## Astuces

{{callout:info|Ce qui ne sort jamais}}
Le contenu d'une fiche privée n'est jamais dans la page ni dans l'application : seuls son titre et ses liens y figurent. Les données de l'application ne contiennent aucun emplacement de votre ordinateur.
{{/callout}}

{{callout:warning|Ce que l'application met en ligne}}
Les titres et de courts extraits de vos fiches sont stockés en ligne, derrière votre identifiant. L'application tourne sur les offres gratuites des services qu'utilise Hypervibe, et chaque mise à jour est une nouvelle mise en ligne.
{{/callout}}

{{callout:tip|Sans Hypervibe aujourd'hui}}
Commencez par la page. Une fois Hypervibe installé, relancez `/brain-viz` : l'application vous sera proposée.
{{/callout}}
