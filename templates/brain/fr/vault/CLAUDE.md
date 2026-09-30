# Le format d'une fiche

Une fiche = un fichier markdown, un sujet. Son nom de fichier (le **slug**) est fait de mots en minuscules reliés par des tirets, unique dans tout le vault.

Les noms des champs et leurs valeurs (`type`, `status: seed`...) restent en anglais : c'est un format technique, le même pour tous les brains, que les outils lisent. Le titre et le corps sont dans votre langue.

```markdown
---
type: idea
title: "Un titre court et parlant"
domains: [travail, ecriture]
status: seed
visibility: internal
created: 2026-09-30
updated: 2026-09-30
source: "d'où vient ce qui est écrit ici"
---

Le corps, en quelques phrases ou quelques pages. Les liens vers d'autres fiches
s'écrivent [[slug-de-l-autre-fiche]].
```

## Les neuf types, et leur dossier

Le dossier **est** le type : une fiche `idea` vit dans `vault/ideas/`, et nulle part ailleurs.

| type | dossier | pour |
|---|---|---|
| `idea` | `ideas/` | une intuition, une hypothèse, quelque chose à creuser |
| `concept` | `concepts/` | une notion qu'on définit et qu'on réutilise |
| `note` | `notes/` | un fait, une observation, une décision et sa raison |
| `project` | `projects/` | un projet, en cours ou fini |
| `person` | `people/` | quelqu'un qui compte |
| `organization` | `organizations/` | une entreprise, une institution, un collectif |
| `publication` | `publications/` | ce qui a été publié (article, post, livre, vidéo) |
| `event` | `events/` | une conférence, une rencontre, un moment daté |
| `source` | `sources/` | une œuvre ou une lecture qui nourrit la pensée |

## Les champs

- `domains` : un ou deux domaines, **pris dans la liste de `hyperbrain.json`**. Jamais vide : c'est une erreur bloquante.
- `status` : `seed` (graine : écrite par la machine, pas encore validée), `trusted` (fiable : validée), `archived` (close).
- `visibility` : `public`, `internal` (le défaut), `private` (le contenu n'est jamais montré à une IA).
- `created`, `updated` : dates `AAAA-MM-JJ`.
- `source` : d'où vient le contenu. Un chemin de fichier, une adresse web, `claude://chat/2026-09-30`... Toujours la remplir : c'est elle qui permet de vérifier.

## Ce qui n'est pas une fiche

Une tâche, un rappel, un état passager. La bonne question avant d'écrire : **voudra-t-on retrouver ça dans six mois ?**
