# /brain:add-meaning

Active **la recherche par le sens** : votre brain retrouve une fiche même quand vous la cherchez avec d'autres mots que les siens. Cela demande une clé OpenAI et coûte quelques centimes pour des milliers de fiches. La clé ne passe jamais par la conversation.

## Quand l'utiliser

- Vous cherchez souvent une fiche sans vous souvenir des mots exacts qu'elle contient
- Votre brain grossit et la recherche par les mots ne suffit plus
- Vous voulez que Claude retrouve de lui-même les fiches proches d'un sujet, même formulé autrement

## Comment ça se passe

1. **L'explication** : Claude vous dit ce que la recherche par le sens change et ce qu'elle implique. Exemple : « le livre que je veux écrire » retrouve votre fiche intitulée « Projet de roman ».
2. **La vérification** : si la recherche par le sens est déjà active, Claude vous le dit et s'arrête là. Sinon, il vous demande si vous la voulez.
3. **Le compte et la clé** : si vous n'en avez pas encore, Claude vous guide sur le site d'OpenAI pour créer un compte, une clé, et ajouter un petit crédit (quelques dollars durent des années).
4. **La clé, hors de la conversation** : Claude prépare un fichier dans votre brain et l'ouvre dans votre éditeur de texte. Vous y collez la clé, vous enregistrez, vous fermez, et vous dites à Claude que c'est fait.
5. **Le premier calcul** : Claude fait traiter toutes vos fiches non privées, et vous dit combien l'ont été.
6. **La preuve** : Claude lance une recherche avec des mots qui ne figurent dans aucune de vos fiches, et vous voyez la bonne fiche remonter.

## Ce que ça crée pour vous

- La **recherche par le sens**, utilisable par Claude dans toutes vos conversations
- Un **fichier privé** dans votre brain, qui contient la clé et reste hors de l'historique et de toutes les copies
- Une ligne de conclusion : la recherche est active, et ce qu'elle a coûté (le nombre de fiches traitées)

## Prérequis

- Un brain déjà créé (`/brain:create`)
- Un compte OpenAI avec une clé et un petit crédit (Claude vous guide pour les créer)
- Un autre service compatible avec OpenAI convient aussi : dites-le à Claude, il note son adresse et sa clé à la place

## Astuces

{{callout:warning|Ne collez jamais la clé dans la conversation}}
La clé se colle uniquement dans le fichier que Claude ouvre pour vous. Si vous la collez quand même dans la conversation, Claude vous demandera d'en créer une nouvelle et de supprimer celle-là.
{{/callout}}

{{callout:info|Ce qui part chez OpenAI}}
Le texte de vos fiches non privées est envoyé à OpenAI pour être transformé en nombres. Vos fiches privées ne le sont jamais.
{{/callout}}

{{callout:tip|Un coût très faible, puis presque nul}}
Quelques milliers de fiches coûtent quelques centimes au premier calcul. Ensuite, seules les fiches modifiées sont recalculées.
{{/callout}}
