# /brain:start

Le démarrage de votre second brain, d'un ordinateur où rien n'est encore installé jusqu'à un brain qui connaît déjà votre travail. Claude le construit partie après partie : chacune est mise en place puis remplie avant que la suivante commence, et il reprend là où vous vous êtes arrêté, le jour même ou un mois plus tard. Vous ne tapez rien : il s'occupe de tout et vous montre l'avancement sous forme de petite liste.

## Quand l'utiliser

- Juste après avoir installé le plugin, avant toute autre skill.
- Pour reprendre le démarrage là où vous l'aviez laissé : Claude vous dit dans quelle partie vous en êtes et continue à partir de là.
- Quand une autre skill vous dit que l'ordinateur n'est pas prêt.
- Sur un nouvel ordinateur, même si vous avez déjà un brain ailleurs : Claude le retrouve avant de créer quoi que ce soit.

## Comment ça se passe

1. **Un brain existe-t-il déjà ?** Avant tout, Claude regarde, sans rien modifier, si vous avez déjà un brain : sur cet ordinateur (dans votre dossier personnel et ses sous-dossiers, dans `C:\DEV` ou `~/dev`), ou sur votre GitHub s'il y est connecté (une seule question posée à GitHub, rien n'est copié). Il ne vous en parle que s'il trouve quelque chose.
  - Un brain dans un dossier de cet ordinateur : Claude vous dit où, et le reprend tel quel avec votre accord.
  - Un brain sur votre GitHub : c'est le même brain sur un deuxième ordinateur, et Claude passe la main à `/brain:add-second-computer`.
  - Rien trouvé : Claude vous demande une fois si vous gardez un brain ailleurs, par exemple une copie froide sur un disque, qu'il restaure plutôt que de repartir de zéro.
2. **La machine** : Node en version 22.16 ou plus récente (le moteur qui fait tourner la recherche du brain), git (l'outil qui garde l'historique de vos fiches) et votre identité git (le nom et l'email qui signent chaque enregistrement) sont vérifiés, puis installés ou mis à jour si nécessaire. Sous Windows, Claude installe et l'application vous demande votre accord à chaque étape. Sur Mac, c'est vous qui installez et Claude qui guide, parce que les installeurs demandent le mot de passe du Mac dans leur propre fenêtre. Sous Linux, ce qui exige les droits d'administrateur est saisi par vous. Tant que le brain n'existe pas, Claude ouvre dans votre navigateur une page qui montre tout le démarrage : chaque partie, ce qui est fait, ce qui est en cours, ce qui attend.
3. **Le brain lui-même** : Claude vous demande à quoi il servira, ses domaines et ses types de fiches, puis où vous voulez qu'il vive, en proposant un dossier nommé `brain` dans votre dossier personnel dont il écrit le chemin complet. Il le construit avec vous par `/brain:create`, avec ses premières fiches.
  - Sa vue en direct s'ouvre alors dans sa propre fenêtre. Gardez-la à côté de la conversation : elle suit tout le reste du démarrage d'elle-même, et Claude ne la rouvre pas à chaque partie.
  - Son panneau « Construction du brain », en haut à droite, montre les parties et, pour le savoir, chaque bloc avec son total, ce qui est entré, ce qui reste et les fiches ajoutées. Vous pouvez le replier.
  - Dans la vue, les bulles de vos domaines apparaissent : chaque fiche ira dans l'une d'elles.
4. **Les outils** : ce qui nourrira le brain, mis en place avant que le savoir entre, pour que vous sachiez toujours d'où vient ce qu'il sait.
  - Vos sources, choisies avec `/brain:sources` : vos mails et votre agenda, les dossiers où vous travaillez, votre travail avec Claude, des sources bien à vous.
  - La lecture en direct : un Claude en arrière-plan peut lire vos conversations et vos documents le jour même. Claude vous dit ce que cela consomme de votre forfait Claude avant de l'activer. Si vous la voulez, vous créez vous-même son accès, dans une fenêtre que Claude ouvre pour vous, et vous choisissez ce qu'elle peut consommer par jour. Si vous ne pouvez pas créer cet accès tout de suite, il peut attendre, et le démarrage continue.
  - Dans la vue, l'anneau des outils apparaît autour de votre brain.
5. **Le savoir** : ce qui existe déjà entre dans le brain, bloc par bloc.
  - Claude compte d'abord tout, sans rien lire : vos écrits, ce que Claude retient déjà de vous (la mémoire qu'il tient de lui-même, d'une conversation à l'autre), vos conversations avec Claude des trente derniers jours, les documents de vos dossiers suivis, les personnes avec qui vous échangez par email.
  - Pour chaque bloc, il donne une estimation de ce que sa lecture consommerait de votre forfait Claude et du temps qu'elle prendrait, et vous choisissez : maintenant, plus tard, ou jamais.
  - Vos écrits passent en premier, pour que votre brain contienne vos propres mots dans l'heure. Chaque bloc est suivi élément par élément : combien sont entrés, combien restent, combien de fiches ils ont ajoutées. Un bloc n'est dit entré que lorsqu'un programme l'a compté.
  - Les conversations et les documents sont lus en arrière-plan, quelques-uns à la fois, sur autant de jours qu'il le faut : le démarrage continue pendant ce temps, et les fiches arrivent sur la carte à mesure qu'elles s'écrivent.
6. **L'exécutif** : vos propres skills et les garde-fous qui les encadrent, laissés dans les dossiers de Claude Code, sont rangés dans votre brain avec `/brain:executive`, et Claude les trouve comme avant. Si vous n'en avez pas, Claude n'en parle pas. Dans la vue, la couronne des harnais apparaît.
7. **La vie du brain** : l'alerte, qui vous prévient le jour même quand quelque chose ne va pas (avec un email d'essai pour que vous voyiez où il arrive), puis la sauvegarde du soir et la revue de la semaine, mises en place avec `/brain:add-routines`. Les derniers modules de la création vous sont ensuite proposés, comme la copie en ligne ou la recherche par le sens. Sur l'anneau de la vue, chaque outil montre alors son prochain passage.
8. **S'arrêter et revenir** : vous pouvez vous arrêter à tout moment. Ce qui est fait reste fait, ce que vous avez gardé pour plus tard attend, et `/brain:start` reprend à partir de là.

## Ce que ça crée pour vous

- Un ordinateur prêt : Node et git installés ou mis à jour si nécessaire
- Votre **identité** (nom et email) enregistrée, pour signer les enregistrements du brain
- Si vous aviez déjà un brain, ce brain repris tel quel, et jamais un second à côté
- Votre **brain**, à l'endroit que vous avez choisi, construit avec `/brain:create`
- Sa **vue en direct**, avec le panneau de la construction pendant tout le démarrage
- Ce que vous avez choisi en chemin : vos sources, la lecture en direct avec son accès et son plafond par jour, ce qui existait déjà, vos skills et vos garde-fous, l'email d'alerte, les tâches automatiques
- Un **relevé de l'avancement de votre démarrage**, gardé sur cet ordinateur : ce qui est en place, ce que vous avez refusé, ce que vous avez gardé pour plus tard, et ce que chaque bloc du savoir comptait au départ
- La **page du démarrage**, dans votre navigateur, qui montre ce relevé et le suit toute seule
- L'emplacement du plugin, noté pour la sauvegarde du soir

## Prérequis

- Claude Code (l'application de bureau ou la ligne de commande), avec le plugin Hypervibe Brain installé
- Une connexion internet, pour les installations
- Sous Windows : l'installateur d'applications de Windows (« App Installer », gratuit dans le Microsoft Store). S'il manque, Claude vous le dit, vous l'installez, puis vous relancez `/brain:start`.
- Sur Mac : le mot de passe de votre Mac, que les installeurs vous demanderont
- Pour retrouver un brain sur GitHub : le programme GitHub en ligne de commande, connecté à votre compte (facultatif : sans lui, Claude vous pose la question)
- Pour la lecture en direct seulement : un abonnement Claude, et le programme Claude en ligne de commande, que Claude vous aide à installer s'il manque

## Astuces

{{callout:warning|Après une installation, quittez vraiment l'application}}
L'application Claude ne cherche Node qu'à son démarrage. Si Claude n'arrive pas à joindre le brain, il vous demande de quitter complètement l'application (sur Mac : menu Claude, Quitter, et pas seulement fermer la fenêtre), de la rouvrir, puis de relancer `/brain:start`.
{{/callout}}

{{callout:info|Sur Mac, préférez l'installeur officiel de Node}}
L'installeur officiel place Node là où l'application Claude le trouve. Avec Homebrew, il arrive que l'application ne le voie pas, même après un redémarrage : passer par l'installeur officiel règle en général le problème.
{{/callout}}

{{callout:warning|Ne collez jamais le jeton d'accès dans la conversation}}
Le Claude d'arrière-plan travaille avec un jeton, c'est-à-dire un accès durable à votre compte Claude. Vous le créez et le rangez vous-même, dans une fenêtre que Claude ouvre : il reste sur votre ordinateur, dans un fichier que votre compte est seul à pouvoir lire, et Claude ne le voit jamais. Il n'est pas rangé dans un coffre, à dessein : un coffre se referme au bout de quelques heures, et la lecture en arrière-plan s'arrêterait avec lui. S'il se retrouve un jour dans une conversation, Claude vous dit de le révoquer et d'en créer un autre.
{{/callout}}

{{callout:info|Les coûts annoncés sont des estimations}}
Lire une conversation ou un document consomme environ 100 000 à 200 000 jetons de votre forfait Claude, la plupart étant du contexte relu. Avec un abonnement, rien n'est facturé pour cela, mais cela compte dans les limites de votre forfait. C'est pourquoi le savoir est compté avant toute lecture, et pourquoi la lecture en arrière-plan s'arrête d'elle-même chaque jour à un plafond que vous choisissez.
{{/callout}}

{{callout:tip|Vous pouvez vous arrêter à tout moment}}
Répondre « plus tard » ne fait rien perdre. Chaque étape et chaque bloc peut attendre, et `/brain:start` commence toujours par vous dire où vous en êtes.
{{/callout}}
