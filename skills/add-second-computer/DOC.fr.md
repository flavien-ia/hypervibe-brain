# /add-second-computer

Installe le **même brain sur deux ordinateurs** (un fixe et un portable, par exemple). Ce que vous écrivez sur l'un se retrouve sur l'autre le soir même, ou tout de suite quand vous capturez une pensée. Les deux se rejoignent sur votre copie privée en ligne sur GitHub.

## Quand l'utiliser

- Vous travaillez sur deux ordinateurs et voulez le même brain sur les deux
- Vous remplacez l'ordinateur qui faisait tourner le brain par un autre
- La synchronisation semble bloquée et vous voulez savoir pourquoi
- Vous voulez arrêter la synchronisation sur l'un des deux

## Comment ça se passe

1. **L'explication** : Claude vous dit comment les deux ordinateurs se partagent le travail et ce que cela implique, avant de rien changer.
2. **Le rôle de chacun** : l'un des deux **fait tourner le brain** (il suit vos sources, calcule la recherche par le sens, tient l'annuaire, fait la revue de la semaine et la lettre). L'autre lit et écrit des fiches, et reçoit tout cela. Choisissez celui qui est allumé le plus souvent.
3. **La copie en ligne** : si le brain n'a pas encore de copie sur GitHub, Claude lance d'abord `/add-backup`, puis revient ici.
4. **Sur le premier ordinateur** : sur votre parole, Claude le désigne comme celui qui fait tourner le brain. Avec votre accord, le brain y enregistre et envoie désormais ses changements tout seul, et Claude envoie une première fois ce qui s'y trouve.
5. **Sur le second ordinateur** : vous y ouvrez Claude, avec Hyperbrain installé (`/start-hyperbrain` d'abord), et vous dites « ajoute cet ordinateur à mon brain ». Claude vérifie l'accès à GitHub, récupère le brain dans un dossier de votre espace personnel, et vous demande le même accord.
6. **La sauvegarde du soir, là aussi** : Claude lance `/add-routines` sur le second ordinateur, pour la sauvegarde du soir seulement. Son soir fait moins : il sauvegarde ses fiches et synchronise, rien d'autre.
7. **L'essai à deux** : vous capturez une pensée sur un ordinateur, vous dites « synchronise mon brain » sur l'autre, et la fiche y est.

## Ce que ça crée pour vous

- Le **brain complet sur le second ordinateur**, relié à votre copie GitHub privée
- Un **ordinateur désigné** pour faire tourner le brain, noté dans le brain lui-même
- La **synchronisation automatique** sur chaque ordinateur où vous l'avez acceptée : chaque soir, et à chaque capture
- Deux lignes de conclusion : quel ordinateur fait tourner le brain, et quand les deux se rejoignent

## Prérequis

- Un brain déjà créé, avec sa copie en ligne sur GitHub (`/add-backup`)
- Hyperbrain installé sur les deux ordinateurs
- Sur le second, un accès au compte GitHub qui contient votre brain privé
- Votre accord, donné sur chaque ordinateur, pour que le brain envoie ses changements tout seul

## Astuces

{{callout:info|Un conflit n'écrase rien}}
Si la même fiche a été modifiée sur les deux ordinateurs avant qu'ils se rejoignent, la synchronisation s'arrête et vous prévient. Rien n'est perdu. Claude vous montre les deux versions, vous choisissez ou vous fusionnez, il écrit le résultat devant vous. Il ne choisit jamais à votre place.
{{/callout}}

{{callout:warning|Pas dans un dossier synchronisé}}
Sur le second ordinateur, le brain s'installe dans un dossier de votre espace personnel, jamais dans Dropbox, iCloud ou OneDrive. La synchronisation passe par GitHub, pas par ces services.
{{/callout}}

{{callout:tip|Changer d'ordinateur principal}}
Pour que l'autre ordinateur fasse tourner le brain à son tour, dites-le à Claude : il arrête la sauvegarde du soir et la revue sur l'ancien, donne le rôle au nouveau, puis y remet les tâches en place avec `/add-routines`. Hors connexion, rien à faire : le retard se rattrape au passage suivant.
{{/callout}}
