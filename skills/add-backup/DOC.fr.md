# /add-backup

Protège votre brain contre la perte : **une copie privée en ligne sur GitHub**, **une copie froide** chaque semaine à l'endroit de votre choix, ou les deux. Les deux sont recommandées, parce qu'elles ne protègent pas des mêmes accidents.

## Quand l'utiliser

- Votre brain n'existe que sur votre ordinateur et vous ne voulez pas le perdre en cas de panne, de vol ou de casse
- Vous voulez pouvoir revenir à une version passée d'une fiche
- Vous voulez une archive complète hors ligne, qui ne dépend d'aucun compte
- Vous préparez l'installation du brain sur un second ordinateur (`/add-second-computer` a besoin de la copie en ligne)

## Comment ça se passe

1. **Ce qui existe déjà** : Claude regarde quelle protection est déjà en place, vous le dit, et ne vous propose que le reste.
2. **Le choix** : Claude vous explique les deux protections, puis vous demande laquelle vous voulez : la copie en ligne, la copie froide, ou les deux.
3. **La copie en ligne, le compte** : Claude vérifie que votre ordinateur est relié à GitHub. Sinon, il vous donne un code à usage unique et ouvre votre navigateur : vous vous connectez, ou vous créez un compte gratuit. Sur Mac, l'outil GitHub s'installe d'abord depuis le site de GitHub.
4. **La copie en ligne, l'espace privé** : avec votre accord explicite, Claude crée sur votre compte un espace privé et y envoie tout le brain avec son historique. Toujours privé, jamais public.
5. **L'envoi automatique** : Claude vous demande si le brain peut envoyer ses sauvegardes sur GitHub tout seul (à chaque capture et chaque soir), ou seulement quand vous le demandez. C'est une permission que vous donnez ou non.
6. **La copie froide, l'endroit** : vous indiquez où la ranger. Un disque externe ou une clé USB est le plus sûr ; un dossier synchronisé (Dropbox, iCloud Drive, OneDrive) convient aussi. Seule contrainte : pas à l'intérieur du brain lui-même.
7. **La première copie froide** : Claude la fait tout de suite, la vérifie avant de la garder, et vous donne le fichier créé et le nombre de sauvegardes qu'il contient.
8. **La suite** : la sauvegarde du soir en refait une tous les sept jours. Si elle n'est pas en place, Claude vous le dit et vous propose `/add-routines`.

## Ce que ça crée pour vous

- Un **espace privé sur votre compte GitHub**, avec tout votre brain et son historique
- Si vous l'acceptez, l'**envoi automatique** des sauvegardes vers GitHub
- Une **copie froide** : le brain entier et son historique dans un seul fichier, à l'endroit choisi
- Une nouvelle copie froide chaque semaine, les **huit dernières** étant conservées
- Deux lignes de conclusion : ce qui est protégé désormais, et comment

## Prérequis

- Un brain déjà créé (`/create-brain`)
- Pour la copie en ligne : un compte GitHub gratuit (Claude vous guide pour le créer)
- Pour la copie froide : un endroit où la ranger, et aucun compte
- Pour que la copie froide se refasse toute seule : la sauvegarde du soir (`/add-routines`)

## Astuces

{{callout:tip|Pourquoi les deux}}
La copie en ligne vous sauve si l'ordinateur est perdu ou cassé, et vous permet de retrouver n'importe quelle version passée d'une fiche. La copie froide survit même à la perte simultanée de l'ordinateur et du compte GitHub.
{{/callout}}

{{callout:info|Restaurer depuis une copie froide}}
Une phrase à retenir : ouvrez une conversation, dites « restaure mon brain depuis sa copie froide », et donnez le fichier. Claude remet le brain en place sur l'ordinateur, et la recherche se reconstruit à la première question.
{{/callout}}

{{callout:warning|Disque non branché : pas une erreur}}
Si le disque externe n'est pas branché le soir où la copie froide devait se faire, rien ne casse : cette semaine-là n'a pas de copie, la suivante en aura une. Sans sauvegarde du soir, la copie froide ne se fait que lorsque vous la demandez.
{{/callout}}
