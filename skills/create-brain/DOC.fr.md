# /create-brain

La construction guidée de votre second brain, une étape à la fois : les décisions, la création et les premières fiches, les sources qui le nourrissent, puis les modules que vous voulez. Chaque étape se termine par une vérification avant de passer à la suivante, et le parcours reprend là où vous vous étiez arrêté. Le brain est à vous : Claude propose et explique, vous décidez.

## Quand l'utiliser

- Après `/start-hyperbrain`, pour créer votre brain.
- Pour reprendre une construction interrompue : Claude dit où en est le brain en deux phrases et reprend à l'étape suivante, sans rien refaire.
- Quand vous avez déjà un dossier de brain (restauré, ou venu d'un autre ordinateur) qui n'est pas encore actif ici : Claude le rattache, puis reprend.

## Comment ça se passe

1. **Point de départ** : Claude vérifie que l'ordinateur est prêt (sinon il passe d'abord par `/start-hyperbrain`), puis présente le parcours en cinq lignes.
2. **Les décisions** : l'étape la plus importante, une dizaine de minutes de questions posées une à une.
  - Pourquoi ce brain : ce que vous en attendez, en une ou deux phrases.
  - Vos domaines : les 3 à 8 grands pans de votre vie et de votre travail. Chaque fiche en portera un ou deux.
  - Vos types de fiches : 5 à 12 types proposés d'après votre ordinateur, avec votre accord (Claude ne lit que des noms de dossiers et compte des fichiers, il n'en ouvre aucun). Vous retirez, renommez, ajoutez.
  - Ce qui n'entre jamais, et ce qui reste privé.
  - Où vit le brain sur votre ordinateur.
  - Claude résume vos réponses et vous validez le résumé.
3. **Création et premières fiches** : Claude crée le brain et rédige son document fondateur, qu'il vous montre. Puis il vous pose trois ou quatre questions ouvertes (vos projets en cours, trois idées qui vous tiennent à cœur, cinq personnes qui comptent, une décision récente), vous montre la liste des titres avec leur type et leur domaine, et écrit les fiches une fois la liste corrigée. Une recherche retrouve ensuite l'une d'elles : c'est la première fois que votre brain vous répond.
4. **Les sources** : Claude lance `/brain-sources` pour choisir ce qui nourrit le brain, vous propose l'annuaire des contacts (`/brain-contacts`), et de faire entrer un premier écrit (`/brain-ingest`), maintenant ou plus tard.
5. **Claude le lit partout** : rien à régler. Vous ouvrez une nouvelle conversation, vous y posez une question sur vous, et vous revenez dire si Claude a répondu à partir de vos fiches. Ce test, c'est vous qui le faites.
6. **Les modules** : présentés par famille, chacun en une phrase. Vous choisissez, Claude lance les skills retenues l'une après l'autre.
  - Protéger : `/add-backup`.
  - Faire vivre : `/add-routines`, après une première revue faite ensemble avec `/brain-review`.
  - Mieux l'utiliser : `/add-meaning` et `/brain-viz`.
  - Étendre : `/add-second-computer` et `/add-cloud`.

## Ce que ça crée pour vous

- Le **dossier de votre brain**, à l'endroit choisi, avec son historique
- Son **document fondateur** : à quoi il sert, ses domaines, ce qui reste privé, puis les sources et modules en place
- Vos **domaines** et vos **types de fiches**, chacun décrit en une phrase
- Une vingtaine de **premières fiches**, fiables puisque vous venez d'en valider le contenu, et liées entre elles
- Vos **sources** choisies, et la liste de vos écrits à faire entrer
- Les **modules** que vous avez retenus (les autres s'ajoutent quand vous voulez, chacun par sa skill)

## Prérequis

- Un ordinateur prêt : `/start-hyperbrain` s'en charge
- Dix à quinze minutes devant vous pour les décisions
- Un emplacement qui n'est pas dans un dossier synchronisé (voir ci-dessous)

## Astuces

{{callout:warning|Jamais dans un dossier synchronisé}}
Dropbox, OneDrive, Google Drive ou iCloud Drive abîment l'historique et l'index de recherche du brain : la création refuse un tel dossier. Attention, Windows range souvent Documents et Bureau dans OneDrive sans le dire, et un Mac peut stocker Bureau et Documents dans iCloud. Par défaut, le brain vit dans un dossier à part, dans votre dossier personnel.
{{/callout}}

{{callout:info|Deux niveaux de confidentialité}}
Une fiche privée existe dans le brain, mais son contenu n'est jamais montré à une IA, ni par la recherche ni à Claude. Un dossier « zone dangereuse » n'est même pas lu, ni sauvegardé : c'est le dernier recours.
{{/callout}}

{{callout:tip|Moins, mais qui tourne}}
Vingt fiches justes et un brain qui répond valent mieux qu'un plan ambitieux arrêté à la deuxième étape. Vous pouvez vous interrompre à tout moment : relancez `/create-brain` et le parcours reprend. Et dès que le brain est construit, le réflexe à garder est `/brain` pour chaque pensée à retenir.
{{/callout}}
