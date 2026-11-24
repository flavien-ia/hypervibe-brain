# /brain:live

Montre votre brain en direct, dans une fenêtre à lui sur votre ordinateur : **la carte de vos fiches**, qui s'allument au moment où Claude les lit ou les écrit, **ce qui nourrit votre brain** autour d'elle, et **ce que cela consomme**. Une fois allumée, la vue démarre avec votre session et reste prête. La même skill sert à l'ouvrir ou à l'éteindre.

## Quand l'utiliser

- Vous voulez voir ce que contient votre brain, sous forme de carte plutôt que de liste
- Vous voulez suivre ce que Claude lit dans votre brain pendant que vous travaillez avec lui
- Vous voulez savoir ce que consomme la lecture en arrière-plan de vos conversations et de vos documents, et lui fixer un plafond
- Vous voulez mettre une source en pause, changer son rythme, ou dire ce qui ne doit jamais être lu
- Vous voulez annuler quelque chose que la machine a écrit dans une fiche
- Vous voulez passer en revue les fiches que la machine a écrites et valider celles qui sont justes

## Comment ça se passe

1. **La présentation** : Claude vous dit ce que la vue montre et ce qu'elle implique, avant de rien allumer.
2. **Le point** : si la vue démarre déjà avec votre session, et si elle tourne en ce moment.
3. **L'allumage** : Claude fait démarrer la vue avec votre session, la lance tout de suite et ouvre sa fenêtre. Il n'y a rien à installer : la vue est livrée avec le plugin.
4. **La fenêtre** : elle s'ouvre sans barre d'adresse, dans Chrome ou Edge si vous avez l'un des deux, sinon dans votre navigateur habituel. Vous pouvez l'installer comme une application depuis la page, pour lui donner sa propre icône.
5. **Sur un brain tout neuf** : la vue dit elle-même ce qui manque encore (pas de fiche, pas de source, la lecture en journée pas démarrée) et vous donne chaque fois la phrase à dire à Claude.
6. **L'extinction** : vous dites « éteins la vue en direct ». Elle ne démarre plus avec votre session, et celle qui tourne est arrêtée. Votre brain ne change pas.

## Ce que ça crée pour vous

- Une **fenêtre sur votre brain**, avec deux vues de la carte : par domaine, et par le sens une fois la recherche par le sens allumée
- Les **sources et les données** autour de la carte, chacune avec ce qu'elle a fait cette semaine et son prochain passage
- Un **panneau d'activité** : quelles conversations lisent le brain en ce moment, et les dernières fiches écrites
- Une **page de consommation** : ce que Claude lit dans votre brain, et ce que coûte la lecture en arrière-plan, jour par jour
- Une **page de réglages** : le rythme de chaque source, sa pause, le modèle et le plafond par jour de ce qui lit en arrière-plan, ce qui ne doit jamais être lu
- Un **index** de tout ce que le brain sait retrouver, et un **historique** de ce que chaque source a écrit, où une écriture de la machine s'annule en un clic
- De quoi **valider les graines** : un filtre « Graines » qui montre les fiches écrites par la machine que personne n'a encore validées, un bouton « Valider » sur chacune (ou la touche V), et « Graine suivante » pour passer à la suivante (ou la touche N). Pas de validation en masse : valider, c'est dire « je l'ai lue, elle est juste ». Une fois une fiche validée, la machine ne réécrit jamais votre texte : elle peut seulement y ajouter un fait qui dit d'où il vient, et sur un concept, une idée, une décision ou une leçon validés, elle n'ajoute rien et propose le changement dans la lettre de la semaine
- Un petit fichier qui lance la vue à l'ouverture de votre session, retiré quand vous l'éteignez

## Prérequis

- Un brain déjà créé (`/brain:create`)
- Un navigateur sur cet ordinateur ; Chrome ou Edge pour avoir la fenêtre sans barre d'adresse

## Astuces

{{callout:info|Elle reste sur votre ordinateur}}
La vue est une page que seul cet ordinateur peut ouvrir, et même là elle ne répond qu'avec une clé gardée pour votre compte, que sa fenêtre reçoit d'elle-même. Rien n'est envoyé ailleurs, et elle n'utilise aucune IA par elle-même : elle montre ce que font le brain et Claude.
{{/callout}}

{{callout:tip|Sa propre icône}}
Dans Chrome ou Edge, la page propose d'installer la vue comme une application. Elle a alors sa propre icône, que vous pouvez épingler à la barre des tâches ou au Dock, et s'ouvre comme n'importe quel programme.
{{/callout}}

{{callout:info|Une petite clé à côté d'une source}}
Une source dont la clé est gardée dans votre coffre Hypervibe ne tourne pas tant que le coffre est fermé, et la vue montre une petite clé à côté d'elle. C'est une attente, pas une panne : la source repart toute seule dès que le coffre est rouvert.
{{/callout}}

{{callout:info|Après une mise à jour du plugin}}
Il n'y a rien à faire. Une vue qui tourne passe d'elle-même à la nouvelle version, et sa fenêtre se recharge.
{{/callout}}

{{callout:warning|La première fois sur Mac}}
macOS peut afficher une notification disant qu'un élément nommé « node » a été ajouté en arrière-plan : c'est cette vue. Le désactiver dans les réglages empêche la vue de démarrer avec votre session.
{{/callout}}
