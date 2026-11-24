# /brain:sources

Vous choisissez ce qui nourrit votre second brain : vos mails et votre agenda, les dossiers où vous travaillez, votre travail avec Claude, vos écrits existants, et des sources bien à vous. Chaque source est présentée avec ce qu'elle apporte et ce qu'elle implique avant que vous décidiez. Vous pouvez en ajouter ou en retirer à tout moment.

## Quand l'utiliser

- Pendant `/brain:create`, qui la lance à l'étape des sources.
- Plus tard, pour activer ou retirer une source, ou ajouter un dossier à suivre.
- Pour que votre travail avec Claude et vos dossiers suivis soient lus en direct, dans la journée, plutôt qu'une fois par semaine.
- Pour dire ce qui ne doit jamais être lu : le dossier d'un client, une archive, un genre de fichier, un de vos projets.
- Pour que le brain suive tout seul quelque chose qui vous est propre : vos posts, un outil de suivi de clients, une application de lecture, un flux.
- Pour dresser la liste de vos écrits à faire entrer.
- Quand la lecture en direct ne fonctionne plus et que vous voulez la faire réparer.

## Comment ça se passe

1. **État des lieux** : Claude dit en trois lignes quelles sources sont actives, quels dossiers sont suivis et quels écrits sont déjà listés.
2. **Les sources vivantes** : regardées chaque semaine par la revue de la semaine. Claude présente chacune, puis enregistre votre choix.
  - Mails et agenda : les nouvelles personnes qui comptent, les réunions à retenir et les décisions prises deviennent des fiches. Claude les lit par les connecteurs de votre Claude (Gmail, Google Agenda, Outlook) ; le texte d'un email n'est jamais copié, au plus une phrase de résumé ; newsletters et notifications sont ignorées.
  - Dossiers suivis : les fichiers nouveaux ou modifiés dans les dossiers que vous choisissez sont regardés, et ce qui le mérite devient une fiche. Un dossier est lu avec tout ce qu'il contient, jusqu'à son dernier sous-dossier : indiquez le plus large. Rien ne quitte l'ordinateur.
  - Travail avec Claude : les projets sur lesquels vous avez travaillé avec Claude sont résumés, et un projet sans fiche en reçoit une. Seule une ligne par session de travail est notée sur l'ordinateur (le nom du dossier du projet).
3. **Réglage à votre goût** : pour les mails et l'agenda, Claude regarde avec vous les réunions de la dernière semaine et vous demande quel genre de réunion mérite une fiche. Pour les dossiers, il suggère ceux que vos réponses désignent et vérifie qu'ils existent.
4. **En direct si vous le voulez** : votre travail avec Claude et vos dossiers suivis peuvent être lus dans la journée. Un Claude en arrière-plan lit chaque conversation une fois terminée et chaque document que vous avez modifié, et garde ce qui comptera plus tard, en nouvelles graines et en faits datés ajoutés à vos fiches existantes, chacun avec sa provenance. Claude vous dit ce que cela coûte avant de l'activer, puis vous aide à donner son accès à ce Claude d'arrière-plan : vous le créez vous-même, dans une fenêtre que Claude ouvre pour vous. Les mails et l'agenda restent hebdomadaires.
5. **Vos propres sources** : Claude vous demande s'il y a autre chose que votre brain devrait suivre tout seul. Chaque source se définit avec vous, en mots simples : ce qu'elle lit, ce qui devient une fiche (et dans quel type et quel domaine), à quel rythme (chaque jour ou chaque semaine), si une fiche peut être rafraîchie ensuite, et qui s'en charge.
  - Lue automatiquement : un petit programme, écrit avec vous, quand la source se lit sans jugement.
  - Faite par Claude : des consignes, écrites avec vous, que Claude suit pendant la revue de la semaine, quand il faut du jugement ou un navigateur.
6. **Essai et accord** : un programme est d'abord essayé sans rien écrire. Claude vous montre le nombre de fiches et les trois premières, et ajuste jusqu'à ce que vous disiez « c'est ça ». Il ne tourne qu'après votre accord sur cet ordinateur ; ensuite, cinq fiches du premier passage sont relues ensemble. Une source faite par Claude est déroulée une première fois avec vous.
7. **Vos écrits** : Claude vous demande ce que vous avez déjà écrit et où, le classe par intérêt avec vous, en fait une liste à cocher, puis propose de faire entrer le premier avec `/brain:ingest`.
8. **Fin** : deux lignes, quelles sources nourrissent le brain et quand elles seront lues.

## Ce que ça crée pour vous

- Vos **choix de sources vivantes** enregistrés, avec la liste des dossiers suivis
- Si vous le voulez, la **lecture en direct** de vos conversations avec Claude et de vos dossiers suivis : pour chacune, les consignes du Claude qui lit, que vous pouvez ajuster, et le petit programme qui lui donne ce qui est terminé
- Pour chaque source à vous : son **programme** ou ses **consignes**, rangés dans le brain
- La **liste de vos écrits**, à cocher au fil des entrées
- Si vous le voulez, une **adresse de capture** par email
- Si vous le voulez, une **étape à vous** : un programme qui n'apporte aucune fiche mais tourne avec le brain chaque soir ou chaque semaine (publier une copie pour une de vos applications, vérifier quelque chose)

## Prérequis

- Un brain déjà créé
- Pour les mails et l'agenda : les connecteurs Gmail, Google Agenda ou Outlook reliés dans votre application Claude (Réglages, Connecteurs). La source ne démarre qu'une fois ceux-ci reliés.
- La revue de la semaine, installée par `/brain:add-routines`. En attendant, les sources sont lues quand vous dites « fais la revue de mon brain ».
- Pour la lecture en direct : un abonnement Claude, le programme d'arrière-plan du brain activé (Claude le fait avec vous), et un accès durable à votre compte Claude que vous créez vous-même, dans une fenêtre que Claude ouvre pour vous. Il reste sur votre ordinateur, dans un fichier que votre compte est seul à pouvoir lire (et non dans un coffre, qui se referme au bout de quelques heures et arrêterait la lecture avec lui), et ne passe jamais par la conversation.
- Si une source a besoin d'une clé d'accès : c'est vous qui la collez dans le fichier de secrets du brain, jamais dans la conversation. Si vous gardez vos clés dans un coffre Hypervibe, la clé y reste.

## Astuces

{{callout:tip|Une adresse de capture}}
Si la source mails est active, une pensée envoyée par email à une adresse à vous (ou marquée d'un mot convenu dans l'objet) devient une graine à la revue suivante. Le message est reformulé en fiche, jamais collé tel quel, et rien d'autre dans la boîte n'est lu.
{{/callout}}

{{callout:info|Ce que coûte la lecture en direct}}
Elle consomme votre forfait Claude : environ 100 000 à 200 000 jetons par conversation ou document lu, dont les neuf dixièmes sont du contexte relu, et plusieurs millions de jetons pour une journée chargée. Avec un abonnement, rien n'est facturé pour cela, mais cela compte dans les limites de votre forfait. La revue de la semaine vous dit ce qui a été lu, ce qui a été écrit et ce que cela a coûté ; vous pouvez la mettre en pause à tout moment, et tout ce qu'elle écrit s'annule en une phrase.
{{/callout}}

{{callout:info|Un plafond par jour}}
La lecture en direct s'arrête d'elle-même quand elle a consommé cinq millions de jetons dans la journée, et reprend le lendemain matin ; rien n'est perdu entre-temps, ce qui est arrivé attend. Vous pouvez déplacer ce plafond ou le retirer. Et quand beaucoup d'éléments attendent d'un coup (au retour de vacances, ou quand on fait entrer d'anciennes conversations), elle ne lit rien et vous demande d'abord : tout lire, seulement les plus récents, ou rien.
{{/callout}}

{{callout:info|Quand la lecture en direct s'arrête}}
Si le Claude qui lit en arrière-plan ne peut plus travailler (son accès a expiré, la limite de votre forfait est atteinte), votre brain vous prévient par email si vous en avez réglé un, et `/brain:status` le dit en premier dans tous les cas. Une phrase suffit pour le faire réparer : « le juge de mon brain est en panne, répare-le ». Rien n'est perdu entre-temps : ce qu'il n'a pas pu lire attend.
{{/callout}}

{{callout:info|Une source qui attend votre coffre}}
Une source dont la clé est gardée dans votre coffre Hypervibe ne tourne pas tant que le coffre est fermé. C'est une attente, pas une panne : rien n'est perdu, la source repart toute seule dès que le coffre est rouvert, et la vue en direct montre une petite clé à côté d'elle en attendant. Le Claude qui lit en arrière-plan, lui, n'attend jamais le coffre : son accès est gardé dans un fichier de votre ordinateur.
{{/callout}}

{{callout:warning|Ce qu'elle ne doit jamais lire}}
Dites-le en une phrase : « ne lis jamais ce qui est dans mon dossier Acme », « laisse mes fichiers Excel de côté », « pas les conversations de ce projet ». Claude en fait une règle, vous montre ce qu'elle écarte parmi ce qui attendait, et l'enregistre. À partir de là, rien de tout cela n'arrive à la lecture en direct. Ce qui a été lu avant reste dans le brain tant que vous ne l'annulez pas.
{{/callout}}

{{callout:info|Ce qui entre en graine}}
Ce qu'une source apporte entre en graine, et une source ne peut réécrire une fiche que tant qu'elle est encore une graine écrite par cette même source. Seule exception : les objets finis (vos posts, articles, conférences données) peuvent entrer en fiable et rester à jour, tant que personne n'a touché la fiche. Une seule modification de votre main, et elle n'est plus jamais réécrite. Rien n'entre deux fois.
{{/callout}}

{{callout:warning|Ce que la machine peut ajouter à une fiche validée}}
La machine crée des fiches ; sur une fiche que vous avez validée, elle ne réécrit jamais votre texte. Elle peut seulement y ajouter un fait qui dit d'où il vient (c'est ce que fait la lecture en direct), et une source peut y tenir à jour quelques lignes (un nombre de messages, un chiffre) à l'intérieur d'une zone marquée à son nom, jamais un caractère en dehors ; Claude vous le dit clairement avant de mettre en place une telle source. Sur un concept, une idée, une décision ou une leçon validés, qui sont votre pensée, elle n'ajoute rien : elle propose le changement dans la lettre de la semaine.
{{/callout}}
