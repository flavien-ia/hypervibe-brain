# /brain:sources

Vous choisissez ce qui nourrit votre second brain : vos mails et votre agenda, les dossiers où vous travaillez, votre travail avec Claude, vos écrits existants, et des sources bien à vous. Chaque source est présentée avec ce qu'elle apporte et ce qu'elle implique avant que vous décidiez. Vous pouvez en ajouter ou en retirer à tout moment.

## Quand l'utiliser

- Pendant `/brain:create`, qui la lance à l'étape des sources.
- Plus tard, pour activer ou retirer une source, ou ajouter un dossier à suivre.
- Pour que le brain suive tout seul quelque chose qui vous est propre : vos posts, un outil de suivi de clients, une application de lecture, un flux.
- Pour dresser la liste de vos écrits à faire entrer.

## Comment ça se passe

1. **État des lieux** : Claude dit en trois lignes quelles sources sont actives, quels dossiers sont suivis et quels écrits sont déjà listés.
2. **Les sources vivantes** : regardées chaque semaine par la revue de la semaine. Claude présente chacune, puis enregistre votre choix.
  - Mails et agenda : les nouvelles personnes qui comptent, les réunions à retenir et les décisions prises deviennent des fiches. Claude les lit par les connecteurs de votre Claude (Gmail, Google Agenda, Outlook) ; le texte d'un email n'est jamais copié, au plus une phrase de résumé ; newsletters et notifications sont ignorées.
  - Dossiers suivis : les fichiers nouveaux ou modifiés dans les dossiers que vous choisissez sont regardés, et ce qui le mérite devient une fiche. Rien ne quitte l'ordinateur.
  - Travail avec Claude : les projets sur lesquels vous avez travaillé avec Claude sont résumés, et un projet sans fiche en reçoit une. Seule une ligne par session de travail est notée sur l'ordinateur (le nom du dossier du projet).
3. **Réglage à votre goût** : pour les mails et l'agenda, Claude regarde avec vous les réunions de la dernière semaine et vous demande quel genre de réunion mérite une fiche. Pour les dossiers, il suggère ceux que vos réponses désignent et vérifie qu'ils existent.
4. **Vos propres sources** : Claude vous demande s'il y a autre chose que votre brain devrait suivre tout seul. Chaque source se définit avec vous, en mots simples : ce qu'elle lit, ce qui devient une fiche (et dans quel type et quel domaine), à quel rythme (chaque jour ou chaque semaine), si une fiche peut être rafraîchie ensuite, et qui s'en charge.
  - Lue automatiquement : un petit programme, écrit avec vous, quand la source se lit sans jugement.
  - Faite par Claude : des consignes, écrites avec vous, que Claude suit pendant la revue de la semaine, quand il faut du jugement ou un navigateur.
5. **Essai, puis votre accord** : un programme est d'abord essayé sans rien écrire. Claude vous montre le nombre de fiches et les trois premières, et ajuste jusqu'à ce que vous disiez « c'est ça ». Il ne tourne qu'après votre accord sur cet ordinateur ; ensuite, cinq fiches du premier passage sont relues ensemble. Une source faite par Claude est déroulée une première fois avec vous.
6. **Vos écrits** : Claude vous demande ce que vous avez déjà écrit et où, le classe par intérêt avec vous, en fait une liste à cocher, puis propose de faire entrer le premier avec `/brain:ingest`.
7. **Fin** : deux lignes, quelles sources nourrissent le brain et quand elles seront lues.

## Ce que ça crée pour vous

- Vos **choix de sources vivantes** enregistrés, avec la liste des dossiers suivis
- Pour chaque source à vous : son **programme** ou ses **consignes**, rangés dans le brain
- La **liste de vos écrits**, à cocher au fil des entrées
- Si vous le voulez, une **adresse de capture** par email
- Si vous le voulez, une **étape à vous** : un programme qui n'apporte aucune fiche mais tourne avec le brain chaque soir ou chaque semaine (publier une copie pour une de vos applications, vérifier quelque chose)

## Prérequis

- Un brain déjà créé
- Pour les mails et l'agenda : les connecteurs Gmail, Google Agenda ou Outlook reliés dans votre application Claude (Réglages, Connecteurs). La source ne démarre qu'une fois ceux-ci reliés.
- La revue de la semaine, installée par `/brain:add-routines`. En attendant, les sources sont lues quand vous dites « fais la revue de mon brain ».
- Si une source a besoin d'une clé d'accès : c'est vous qui la collez dans le fichier de secrets du brain, jamais dans la conversation

## Astuces

{{callout:tip|Une adresse de capture}}
Si la source mails est active, une pensée envoyée par email à une adresse à vous (ou marquée d'un mot convenu dans l'objet) devient une graine à la revue suivante. Le message est reformulé en fiche, jamais collé tel quel, et rien d'autre dans la boîte n'est lu.
{{/callout}}

{{callout:info|Des graines, sauf pour ce qui est déjà fait}}
Ce qu'une source apporte entre en graine, et une fiche ne peut être rafraîchie que tant qu'elle est encore une graine. Seule exception : les objets finis (vos posts, articles, conférences données) peuvent entrer en fiable et rester à jour, tant que personne n'a touché la fiche. Une seule modification de votre main, et elle n'est plus jamais réécrite. Rien n'entre deux fois.
{{/callout}}

{{callout:warning|Le seul cas où un programme écrit dans une fiche validée}}
Une source peut tenir à jour quelques lignes dans des fiches existantes (un nombre de messages, un chiffre), uniquement à l'intérieur d'une zone marquée à son nom, jamais un caractère en dehors. Claude vous le dit clairement avant de la mettre en place.
{{/callout}}
