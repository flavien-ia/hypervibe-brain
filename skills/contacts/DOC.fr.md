# /brain:contacts

Constitue l'annuaire des contacts : les personnes avec qui vous échangez par email, qui elles sont, depuis quand, à quel rythme, à propos de quoi. Claude peut ensuite l'interroger dans chaque conversation. Seules les personnes qui comptent deviennent des fiches, et uniquement sur votre décision.

## Quand l'utiliser

- Quand vous voulez que « qui est mon comptable ? » ou « à qui ai-je parlé dans telle entreprise ? » trouvent une réponse dans n'importe quelle conversation.
- Pendant `/brain:create`, qui vous le propose après le choix des sources.
- Pour décider quelles personnes méritent une fiche dans le brain.
- Si l'annuaire est déjà en place : Claude vous dit combien de personnes il contient et rappelle comment il vit ensuite.

## Comment ça se passe

1. **Ce que c'est, et ce que ça implique** : Claude vous l'explique en quelques lignes, puis attend votre oui pour activer l'annuaire.
2. **Le premier remplissage** : Claude lit les trois derniers mois de vos mails, en commençant par les messages envoyés (les personnes à qui vous écrivez sont celles qui comptent).
  - Pour chaque personne : son adresse, son nom, le nombre de messages envoyés et reçus, la première et la dernière date, et quelques objets de messages.
  - Jamais le texte des messages.
  - Newsletters, notifications, expéditeurs automatiques et envois de masse sont laissés de côté.
  - Pour les personnes avec qui vous échangez le plus, Claude ajoute une ligne de présentation tirée des mails (par exemple « son comptable ») et quelques thèmes. Rien de privé (santé, argent, famille), sauf si vous le voulez.
3. **Qui mérite une fiche** : l'annuaire range les personnes en trois niveaux. Le noyau, celles qui comptent (des échanges dans les deux sens), et le reste (des données seulement). Claude vous montre le noyau et les premières de celles qui comptent, et vous demande lesquelles méritent une fiche. Pour chaque oui, la fiche est écrite dans le type de votre brain réservé aux personnes.
4. **La suite, sans vous** : chaque semaine, la revue de la semaine ajoute les échanges de la semaine (si la source mails est active) et propose une fiche pour toute personne montée dans le noyau sans en avoir. Et dans n'importe quelle conversation, Claude répond à « qui est... » ou « qui travaille chez... ».
5. **Fin** : deux lignes, combien de personnes dans l'annuaire, combien sont devenues des fiches.

## Ce que ça crée pour vous

- L'**annuaire des contacts** : noms, adresses, dates, nombres de messages et objets
- Une **fiche** pour chaque personne que vous avez choisie, dans l'un de vos domaines
- Un annuaire **interrogeable par Claude** dans toutes vos conversations
- Sa **mise à jour** chaque semaine par la revue de la semaine

## Prérequis

- Un brain déjà créé
- Le connecteur Gmail ou Outlook relié dans votre application Claude (Réglages, Connecteurs). Sans lui, Claude vous indique où le relier, et vous revenez ensuite.
- Pour la mise à jour hebdomadaire : la revue de la semaine et la source mails actives

## Astuces

{{callout:info|Ce que l'annuaire garde, et où}}
Des noms, des adresses, des dates, des nombres de messages et des objets : jamais le texte d'un email. L'annuaire reste sur votre ordinateur et dans les copies privées de votre brain. Dans une fiche, l'adresse d'une personne reste dans sa source, jamais dans le texte.
{{/callout}}

{{callout:tip|Écarter quelqu'un pour de bon}}
L'adresse personnelle d'un collègue, un membre de votre famille : dites à Claude de l'exclure. Elle est ajoutée à la liste des adresses écartées et n'entrera plus jamais dans l'annuaire.
{{/callout}}

{{callout:tip|Des seuils à votre mesure}}
Le nombre d'échanges à partir duquel une personne « compte » ou entre dans le noyau est propre à votre brain : Claude peut le changer à votre demande. Une source à vous (un outil de suivi de clients, par exemple) peut aussi placer des personnes dans un niveau, que les échanges peuvent ensuite relever mais jamais abaisser.
{{/callout}}
