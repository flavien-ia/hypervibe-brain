# /add-routines

Met en place ce qui se passe sans que vous le demandiez : **la sauvegarde du soir** (sans IA, sans coût), **la revue de la semaine** par Claude, et, si vous le voulez, une lettre par email qui la résume. La même skill sert à vérifier ces tâches, à changer leur horaire ou à les arrêter.

## Quand l'utiliser

- Vous voulez que votre brain se sauvegarde tout seul chaque soir
- Vous voulez que Claude relise votre brain chaque semaine et vous laisse un rapport
- Vous voulez recevoir ce rapport par email, lisible sur votre téléphone
- Vous voulez changer une heure, vérifier qu'une tâche tourne, ou en arrêter une

## Comment ça se passe

1. **La présentation** : Claude vous explique les deux tâches, qui ne sont pas de même nature, avant de toucher à quoi que ce soit.
2. **L'état des lieux** : en deux lignes, ce qui est déjà en place, le prochain passage et comment s'est passé le dernier. Puis vous choisissez : tout mettre en place (recommandé), changer une heure, arrêter une tâche, ou rien.
3. **La sauvegarde du soir** : Claude vous demande l'heure si 21 h ne vous convient pas, puis confie la tâche au planificateur de votre ordinateur. Chaque soir, l'ordinateur enregistre les changements du jour, reconstruit la recherche, et envoie le tout vers votre copie en ligne si vous en avez une.
4. **L'essai immédiat** : Claude lance la sauvegarde une première fois, pour que vous la voyiez fonctionner. Si quelque chose échoue, il lit la trace, vous l'explique en mots simples et corrige.
5. **La revue de la semaine** : vous choisissez le jour et l'heure (par exemple dimanche 18 h). Claude crée une tâche planifiée dans l'application Claude. Si votre installation ne le permet pas, il vous le dit et vous propose l'habitude manuelle : une fois par semaine, vous dites « fais la revue de mon brain ».
6. **La lettre de la semaine** : Claude vous propose de recevoir la revue par email. Elle part de votre propre boîte (Gmail ou Outlook reliés à Claude), ou d'un compte Brevo ou Resend que vous avez déjà. Votre accord explicite est demandé avant tout envoi.
7. **Une première lettre** : Claude en envoie une tout de suite, pour que vous disiez si elle vous convient. Vos préférences (plus courte, autre ton) sont notées et suivies ensuite.

## Ce que ça crée pour vous

- Une **tâche quotidienne** dans le planificateur de votre ordinateur, à l'heure choisie
- Une **tâche hebdomadaire** dans l'application Claude, qui lance la revue sans poser de question et sans modifier aucune fiche fiable
- Si vous l'acceptez, une **lettre hebdomadaire** : ce qui est entré dans le brain, les graines écrites par la machine, ce qu'elle propose, et comment répondre en une phrase
- Deux lignes de conclusion : ce qui est en place, et la date du prochain passage

## Prérequis

- Un brain déjà créé (`/create-brain`)
- Pour la revue automatique : l'application de bureau Claude, ouverte au moment prévu
- Pour la lettre : votre messagerie reliée à Claude, ou un compte Brevo ou Resend avec une adresse d'expéditeur vérifiée

## Astuces

{{callout:info|Ordinateur éteint le soir}}
Si l'ordinateur était éteint ou en veille à l'heure prévue, la sauvegarde se rattrape au prochain réveil ou démarrage, et ne fait rien si la soirée avait déjà été sauvegardée. La revue, elle, attend que l'application Claude soit ouverte : votre brain est sur votre ordinateur, pas sur internet.
{{/callout}}

{{callout:warning|Sur Mac, le premier soir}}
macOS affiche une notification signalant qu'un élément nommé « node » a été ajouté en arrière-plan : c'est cette sauvegarde, et la désactiver dans les réglages l'arrête sans prévenir. Si le brain ou la copie froide se trouve sur le Bureau, dans Documents, Téléchargements, iCloud ou un disque externe, macOS demandera une autorisation le premier soir : gardez l'ordinateur éveillé, ou acceptez la question le lendemain matin.
{{/callout}}

{{callout:tip|Ce que coûte chaque tâche}}
La sauvegarde du soir n'utilise aucune IA et ne coûte rien. La revue de la semaine utilise un peu de votre abonnement Claude. Pour la lettre envoyée par Brevo ou Resend, vous collez la clé dans un fichier que Claude ouvre pour vous, jamais dans la conversation.
{{/callout}}
