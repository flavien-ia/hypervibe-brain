---
name: {{SKILL}}
description: Capturer une pensée, une décision ou un fait dans le second brain de {{NAME}}, classé tout de suite. Quand {{NAME}} dit « note ça dans mon brain », « /{{SKILL}} ... », ou veut garder une idée pour plus tard.
---

<!-- create-hyperbrain: managed -->

# /{{SKILL}} : capturer dans le second brain

Le brain de {{NAME}} vit dans `{{DIR}}`. Tu y écris **une fiche neuve**, classée. Cette skill marche depuis n'importe quel dossier.

## 1. Formuler, fidèlement

Une à trois phrases qui disent ce que {{NAME}} vient de penser. Tu reformules pour la clarté, jamais pour embellir : c'est sa pensée, pas la tienne. Une formule qui lui appartient se garde mot pour mot. Sans argument après un échange, capture ce qui vient d'être dit, en le disant.

## 2. Chercher ce qui existe, toujours

Avec l'outil `brain_search` (plein texte, puis `meaning: true` si les mots peuvent différer), ou :

```bash
cd "{{DIR}}" && node scripts/query.mjs search "les mots clés"
```

- Une fiche couvre déjà exactement le sujet : **ne crée rien**, propose de l'enrichir. C'est {{NAME}} qui tranche ; s'il ou elle accepte, édite le fichier devant lui ou elle et mets `updated` à la date du jour.
- Des fiches voisines existent : elles deviennent les liens de la nouvelle (deux ou trois bons, pas huit approximatifs).
- Rien n'existe : tu crées.

## 3. Classer

- `--type` : `idea` (intuition, hypothèse), `note` (fait, observation, décision prise et sa raison), `concept`, `project`, `person`, `organization`, `publication`, `event`, `source`. En cas de doute : `note`.
- `--domains` : un ou deux parmi **{{DOMAINS}}**. Jamais autre chose : le script refuse.
- `--status` : `seed` si c'est toi qui as formulé ; `trusted` seulement si {{NAME}} vient de valider le texte mot pour mot.
- `--visibility private` si {{NAME}} le demande : le contenu ne sera plus jamais montré à une IA.

## 4. Écrire

```bash
cd "{{DIR}}" && printf '%s' "<le corps>" | node scripts/capture.mjs --title "<titre court et parlant>" --type idea --domains <domaine> --links <slug-a>,<slug-b> --source "<d'où ça vient>"
```

Le script refuse un nom déjà pris, un domaine inconnu, un lien vers une fiche qui n'existe pas. Il commite la fiche (et la pousse si c'est autorisé). Tu ne commites rien toi-même.

## 5. Confirmer en une ligne

> Capturée dans `ideas/`, domaine travail, liée à [[slug-a]] et [[slug-b]].

## Ce que tu ne fais jamais

- Capturer un secret, même reformulé (clé, mot de passe, contenu de `.env`).
- Copier le corps d'un email : au plus un résumé.
- Écrire une tâche ou un rappel : le brain garde ce qu'on voudra retrouver dans six mois.
