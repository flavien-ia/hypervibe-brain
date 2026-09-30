# Le format d'une fiche

Une fiche = un fichier markdown, un sujet. Son nom de fichier (le **slug**) est fait de mots en minuscules reliés par des tirets, unique dans tout le vault.

```markdown
---
type: idee
titre: "Un titre court et parlant"
domaines: [travail, ecriture]
statut: graine
visibilite: interne
cree: 2026-09-30
touche: 2026-09-30
source: "d'où vient ce qui est écrit ici"
---

Le corps, en quelques phrases ou quelques pages. Les liens vers d'autres fiches
s'écrivent [[slug-de-l-autre-fiche]].
```

## Les types de ce brain, et leur dossier

Choisis avec {{NAME}} à la création. Le dossier **est** le type : une fiche d'un type vit dans son dossier, et nulle part ailleurs. Un type s'ajoute en le demandant à Claude.

{{TYPES}}

## Les champs

- `domaines` : un ou deux domaines, **pris dans la liste de `hyperbrain.json`**. Jamais vide : c'est une erreur bloquante.
- `statut` : `graine` (écrite par la machine, pas encore validée), `fiable` (validée), `archive` (close).
- `visibilite` : `public`, `interne` (le défaut), `prive` (le contenu n'est jamais montré à une IA).
- `cree`, `touche` : dates `AAAA-MM-JJ` (création, dernière modification).
- `source` : d'où vient le contenu. Un chemin de fichier, une adresse web, `claude://chat/2026-09-30`... Toujours la remplir : c'est elle qui permet de vérifier.

D'autres champs peuvent s'ajouter selon les besoins du brain (une date d'événement, une adresse web...) : ils sont conservés tels quels.

## Ce qui n'est pas une fiche

Une tâche, un rappel, un état passager. La bonne question avant d'écrire : **voudra-t-on retrouver ça dans six mois ?**
