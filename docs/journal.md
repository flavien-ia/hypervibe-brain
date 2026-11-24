# Les journaux du brain

Tout ce qui arrive au brain laisse une ligne quelque part : une fiche lue, une fiche écrite, une source qui tourne, un juge qui passe. Cette page dit où vont ces lignes, combien de temps elles restent, et qui les lit.

## Les quatre journaux

| Journal | Où il vit | Ce qu'il contient | Durée |
|---|---|---|---|
| **Le fichier vivant** | `~/.hypervibe-brain/events.jsonl`, sur l'ordinateur | Chaque événement, à l'instant où il arrive | 30 jours |
| **Le journal du brain** | `journal/<ordinateur>-<AAAA-MM>.jsonl`, dans le brain | Les événements qui racontent quelque chose | Pour toujours |
| **Le journal de travail** | `~/.hypervibe-brain/journal.jsonl`, puis le journal du brain | Dans quel projet la personne travaille avec Claude, une ligne par session | Pour toujours, une fois replié |
| **Les lectures** | `~/.hypervibe-brain/usage.jsonl`, sur l'ordinateur | Ce que le brain coûte en lectures, avec le texte des questions | Sur l'ordinateur seulement |

Le texte d'une question posée au brain n'entre jamais dans le journal du brain : seulement les fiches qu'elle a trouvées.

## Une ligne

Une ligne est un objet JSON :

```json
{ "at": "2026-11-18T08:03:12.401Z", "id": "5a1c09e2b7", "act": "write", "who": "ai:jugement", "note": "hypervibe", "what": "fact" }
```

- `act` : `read` (une lecture), `write` (une écriture), `run` (un passage), `signal` (tout le reste : une session, un fichier qui bouge, une alerte).
- `who` : `source:<nom>`, `ai:<conversation ou juge>`, `person`, `hand` (une modification à la main que la sauvegarde a vue), `save`, `hub`.

## Le trajet d'une ligne

1. **Elle est écrite dans le fichier vivant**, hors du brain. Le dossier du brain ne serait jamais au repos si chaque lecture y écrivait.
2. **À chaque sauvegarde, elle est repliée dans le journal du brain**, dans le fichier du mois de sa date. Une marque (`events-folded.json`) retient jusqu'où le pliage est allé, pour ne jamais replier deux fois.
3. **Le fichier vivant garde 30 jours.** Ce qui est plus ancien en sort : c'est déjà dans le brain. On ne le regarde qu'une fois par jour au plus (`events-pruned` en garde la date), et seulement si sa première ligne a plus de 30 jours.

Un fichier du journal du brain n'est écrit que par un seul ordinateur. Deux ordinateurs ne se marchent donc jamais dessus, et la synchronisation apporte à chacun le journal de l'autre.

## Plier sans rien perdre

Jusqu'au 21 novembre 2026, le pliage relisait le fichier vivant puis l'écrivait de nouveau sans ses vieilles lignes. Une ligne ajoutée par un autre programme entre les deux était effacée : un fait, une fiche créée, sans plus aucune trace, donc ni annulable ni dans la lettre. Et deux sauvegardes au même instant (celle du hub, celle d'après une capture, celle du soir) lisaient la même marque et pliaient deux fois les mêmes lignes : le coût d'un juge était compté deux fois.

Depuis :

- **Un seul pliage à la fois sur l'ordinateur.** Un verrou (`events-fold.lock`, un fichier créé en exclusivité, qui porte le numéro du processus) est tenu pendant tout le pliage. La seconde sauvegarde attend cinq secondes au plus, puis laisse le pliage à la première : ses lignes entreront à la sauvegarde suivante. Un verrou dont le processus n'existe plus, ou vieux de plus de cinq minutes, est repris.
- **Ceux qui écrivent ne prennent aucun verrou** : un événement n'attend jamais. Le fichier vivant n'est donc jamais réécrit sur place. Pour en retirer les vieilles lignes, ce qui reste est écrit à côté, le fichier vivant est renommé, ce qui reste prend son nom sans jamais remplacer un fichier (s'il en est apparu un entre-temps, il est renommé à son tour), et tout ce qui a été ajouté aux fichiers renommés pendant ce temps est remis à la fin. Chaque ligne écrite se retrouve à un seul endroit.
- **Un pliage interrompu** (l'ordinateur éteint entre le journal du brain et la marque) laisse un mot derrière lui (`events-folding.json`). Le pliage suivant regarde alors ce que le journal du brain contient déjà, et n'ajoute aucune ligne deux fois. Il fait de même quand la marque a disparu ou ne se lit pas.
- **Un fichier vivant renommé et jamais remis** (interruption à cet instant) est retrouvé par le pliage suivant et rejoint le fichier vivant, chaque ligne une fois.
- **Une ligne datée juste avant la marque et écrite juste après** (celui qui écrit date sa ligne, puis l'écrit) est rattrapée : chaque pliage regarde dix secondes en arrière, et les identifiants pliés dans ces dix secondes sont gardés (`events-folded-recent.json`) pour la distinguer d'une ligne déjà dans le brain.
- **À la lecture, chaque événement compte une fois**, même s'il a été plié deux fois avant ce correctif.

Le fichier vivant n'est relu qu'une fois par commande : ce qui a été lu est gardé deux secondes, et si le fichier a seulement grandi, seule la fin est lue.

## Un fichier par mois

Le journal du brain était un seul fichier par ordinateur, sans fin. Sur un vrai brain il pesait 4,2 Mo au bout de cinq semaines, il était réécrit dans git à chaque sauvegarde et relu en entier à chaque question.

Depuis le 18 novembre 2026, il tient en un fichier par ordinateur et par mois :

```
journal/
  bureau-2026-10.jsonl
  bureau-2026-11.jsonl
  portable-2026-11.jsonl
```

- Seul le fichier du mois en cours change encore. Les mois passés ne bougent plus, git ne les réécrit plus.
- Une question qui porte sur les derniers jours n'ouvre que les mois que sa date atteint. Une question sans date (retrouver une écriture ancienne pour l'annuler) les ouvre tous.

## Les lignes silencieuses

La moitié de l'ancien journal disait qu'une source avait tourné sans rien trouver. Ces lignes n'entrent plus dans le brain. Elles restent dans le fichier vivant, lisibles 30 jours sur l'ordinateur qui les a écrites, puis elles partent.

Est silencieuse :

- une source ou une étape qui a tourné sans erreur et n'a rien changé ;
- un battement du hub qui n'a rien écrit ;
- le signal « tel passage démarre », qui ne sert qu'à animer la vue en direct.

N'est jamais silencieux :

- une écriture, une lecture ;
- un échec ;
- le passage d'un juge, parce que son coût fait partie de l'histoire ;
- la ligne qu'une sauvegarde écrit sur elle-même ;
- tout passage qui a créé ou modifié quelque chose.

Conséquence à connaître : un autre ordinateur ne voit pas les passages silencieux de celui-ci. Il voit ses écritures, ses échecs et ses juges.

## Le journal d'avant

Un brain créé avant le 18 novembre 2026 a un fichier `journal/<ordinateur>.jsonl`. L'ordinateur qui l'a écrit le découpe par mois à sa sauvegarde suivante, en laissant de côté les lignes silencieuses, puis le supprime. La sauvegarde commite le tout.

- Une ligne déjà présente dans son mois n'est pas ajoutée deux fois (un découpage interrompu, un vieux fichier ramené par une synchronisation).
- Le fichier d'un autre ordinateur est lu tel quel tant que cet ordinateur ne l'a pas découpé lui-même.

## Qui lit quoi

| Qui | Ce qu'il lit | Pourquoi |
|---|---|---|
| Le hub, à chaque battement | La fin du fichier vivant | Savoir ce qu'un juge a dépensé aujourd'hui |
| La revue de la semaine | Le journal du brain et le fichier vivant, sur 7 jours | Ce qui a été écrit, ce qui a tourné, ce que les juges ont coûté |
| L'annulation | Le journal du brain, tous les mois | Retrouver l'écriture à annuler |
| La vue en direct | Le journal du brain et le fichier vivant | L'historique d'un outil, les fiches écrites récemment, l'activité des juges |

Un événement présent à la fois dans le journal du brain et dans le fichier vivant n'est compté qu'une fois, par son identifiant.

## Ce qui est gardé pour annuler

À côté des journaux, le plugin garde 60 jours, sur l'ordinateur (`~/.hypervibe-brain/undo/`), le texte d'une fiche avant et après chaque modification faite par la machine. C'est ce qui permet d'annuler une écriture et elle seule. Ce n'est pas un journal : l'histoire d'une fiche est dans git.

- Une fiche dont on annule la création y est gardée entière avant d'être supprimée (`<identifiant>-removed.json`) : une graine d'un juge peut attendre une heure son commit, et git n'en avait alors rien.
- La validation d'une fiche (`scripts/promote.mjs`, une ou plusieurs à la fois) est une écriture comme les autres : chaque fiche validée a sa ligne (`what: "validated"`, ou `"unvalidated"` quand elle redevient graine) et s'annule seule.

## Dans le code

- `scripts/journal.mjs` : l'écriture (`logEvent`), le pliage (`foldEvents`, `foldJournal`), la lecture (`readEvents`, `recentEvents`, `journalFiles`), la règle des lignes silencieuses (`quiet`), le découpage du journal d'avant.
- `scripts/save.mjs` : le pliage à chaque sauvegarde, et le commit des fichiers touchés.
- `scripts/before.mjs` : ce qui est gardé pour annuler.
- `scripts/lib.mjs` : le verrou (`withFileLock`) et l'écriture d'un fichier entier ou rien (`writeFileAtomic`).
- `live/journal.mjs` : la lecture côté vue en direct.
- Les vérifications : scènes `cold-copy` et `work-journal` du banc (`node tests/banc.mjs --only cold-copy`), le banc de synchronisation (`node tests/banc-sync.mjs`), et `node tests/zones/ecritures.mjs` (des écritures pendant trois pliages simultanés, un pliage interrompu, une marque perdue).
