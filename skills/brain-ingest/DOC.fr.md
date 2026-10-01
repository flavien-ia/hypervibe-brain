# /brain-ingest

Fait entrer l'un de vos écrits existants dans votre second brain : un dossier de notes, vos articles ou vos posts, des documents, la mémoire de Claude. Une seule source à la fois, trois fiches d'essai avant tout le reste, et une vérification à la fin. La source suivante ne commence que lorsque celle-ci est entrée et vérifiée.

## Quand l'utiliser

- Après `/brain-sources`, pour faire entrer le premier écrit de votre liste.
- Pour passer à l'écrit suivant, ou reprendre une grosse source commencée lors d'une séance précédente.
- Pour un écrit qui n'est pas encore dans la liste : Claude l'y ajoute d'abord, puis le fait entrer.

## Comment ça se passe

1. **Choix de la source** : par défaut, le premier écrit non coché de votre liste. Vous pouvez en choisir un autre, ou en nommer un nouveau.
2. **Le périmètre, avec vous** : quels dossiers, quelle période, quels fichiers laisser de côté. Claude regarde la source lui-même (il la parcourt, compte, ouvre deux ou trois éléments) et vous dit ce qu'il voit, par exemple « 312 notes, de 2019 à aujourd'hui, dont un tiers de listes de courses ». Vous convenez de ce qui compte.
3. **Trois fiches d'essai** : écrites à partir de trois éléments différents, puis montrées. C'est là que se règlent le format, la longueur, le ton, le type et le domaine. Claude ajuste jusqu'à ce que vous disiez « c'est ça ».
4. **Le lot** : pour chaque élément qui mérite une fiche.
  - Claude cherche d'abord dans le brain, par les mots puis par le sens. Une fiche qui couvre déjà le sujet n'est enrichie qu'avec votre accord, jamais doublée. Pour un gros lot, il vous demande une règle générale une fois pour toutes.
  - La fiche est écrite en graine, avec sa source qui renvoie à l'original (le fichier ou l'adresse web).
  - Le brain est enregistré toutes les vingt à cinquante fiches, et Claude affiche l'avancement (« 40 documents sur 120 »).
5. **La vérification** : un contrôle automatique des fiches et des liens, sans aucune erreur admise, puis cinq fiches tirées au hasard dans le lot et relues avec vous. Un défaut qui se répète (mauvais type, domaine trop large) est corrigé sur tout le lot, avec votre accord.
6. **Clôture** : la source est cochée dans la liste, le brain est enregistré, et Claude termine en une ligne : combien de fiches, quelle source vient ensuite.

## Ce que ça crée pour vous

- Des **fiches en graine**, chacune reliée à son original par sa source
- Pour vos propres écrits publiés : une fiche par texte, dans le type des publications, avec le texte ou son essentiel
- Pour vos notes : des idées ou des notes, reformulées fidèlement
- Pour les œuvres des autres (livres, articles lus) : une fiche par œuvre, avec ce que vous en retenez, jamais le texte copié
- La **source cochée** dans votre liste, ou un repère d'avancement si elle n'est pas terminée
- Si la source apporte un genre de chose sans type dans votre brain : un **nouveau type**, proposé avant le lot

## Prérequis

- Un brain déjà créé
- La source inscrite dans la liste de vos écrits (tenue par `/brain-sources`)
- Votre présence au début, pour le périmètre et les fiches d'essai, et à la fin, pour la vérification

## Astuces

{{callout:info|Pourquoi trois fiches d'essai}}
Régler le format sur trois fiches coûte quelques minutes. Le découvrir après cent fiches oblige à tout reprendre. Prenez le temps de corriger franchement les essais : tout le lot les suivra.
{{/callout}}

{{callout:tip|Une grosse source, plusieurs séances}}
Rien n'oblige à finir d'une traite. Quand vous vous arrêtez, Claude note sous la source où il en est (par exemple « fait jusqu'à juin 2022 ») et enregistre. La séance suivante reprend à cet endroit.
{{/callout}}

{{callout:warning|Emails et secrets}}
Le texte d'un email ou d'un message n'entre jamais dans le brain : au plus un résumé reformulé, et seulement si vous le voulez. Un secret (clé, mot de passe) n'entre jamais, même reformulé.
{{/callout}}
