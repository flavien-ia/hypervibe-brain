# /brain

Capture une pensée, une décision ou un fait dans votre second brain, sous la forme d'une fiche classée sur-le-champ. Claude cherche toujours d'abord ce qui existe déjà, pour ne jamais créer de doublon. La skill fonctionne depuis n'importe quel dossier et n'importe quelle conversation.

## Quand l'utiliser

- Quand vous dites « note ça dans mon brain », « retiens cette idée », ou `/brain` suivi de la pensée.
- Juste après un échange, avec `/brain` tout seul : Claude capture ce qui vient d'être dit, et vous le signale.
- Pour ce que vous voudrez retrouver dans six mois. Pas pour une tâche ni pour un rappel : ce n'est pas le rôle du brain.

## Comment ça se passe

1. **Vérification** : Claude regarde si un brain existe sur cet ordinateur. Sinon, il vous le dit, vous propose `/create-brain`, et s'arrête là.
2. **Formulation fidèle** : une à trois phrases qui disent ce que vous venez de penser. Claude reformule pour la clarté, jamais pour embellir : c'est votre pensée, pas la sienne. Une formule qui vous appartient est gardée mot pour mot.
3. **Recherche de l'existant** : par les mots, puis par le sens quand les mots risquent de différer.
  - Une fiche couvre déjà exactement le sujet : rien n'est créé. Claude propose de l'enrichir, vous décidez, et la modification se fait sous vos yeux.
  - Des fiches voisines existent : elles deviennent les liens de la nouvelle (deux ou trois bons liens, pas huit approximatifs).
  - Rien n'existe : Claude crée la fiche.
4. **Classement** : Claude choisit l'un des types de votre brain (dans le doute, le type des notes), un ou deux de vos domaines, et le statut de la fiche. Si vous le demandez, la fiche est marquée privée.
5. **Écriture** : la fiche est écrite et enregistrée dans l'historique du brain, puis envoyée vers votre copie en ligne si vous l'avez autorisé. Un titre déjà pris, un domaine inconnu ou un lien vers une fiche qui n'existe pas sont refusés.
6. **Confirmation** : une seule ligne, qui dit où la fiche est rangée, dans quel domaine, et à quelles fiches elle est liée. Si vous corrigez le classement, Claude l'applique tout de suite.

## Ce que ça crée pour vous

- Une **nouvelle fiche**, avec un titre court et parlant, un type, un ou deux domaines, ses liens et sa source (d'où vient la pensée)
- Le statut **graine** par défaut, puisque c'est Claude qui a formulé le texte
- Son **enregistrement** dans l'historique du brain
- Ou bien, avec votre accord, l'**enrichissement** d'une fiche existante plutôt qu'un doublon

## Prérequis

- Un brain déjà créé sur cet ordinateur (sinon, `/create-brain`)
- La fiche est écrite dans la langue que vous avez utilisée pour formuler la pensée

## Astuces

{{callout:warning|Ce qui n'entre jamais}}
Claude ne capture jamais un secret (clé, mot de passe), même reformulé, ni le texte d'un email (au plus un résumé), ni une tâche ou un rappel.
{{/callout}}

{{callout:info|Graine ou fiable}}
Une fiche formulée par Claude entre en graine : elle n'est pas encore validée. Elle n'entre en fiable que si vous venez de valider son texte mot pour mot. Une fiche privée, elle, ne sera plus jamais montrée à une IA.
{{/callout}}

{{callout:tip|Quand aucun type ne convient}}
Claude n'invente pas de type à la volée. Il range la fiche dans le type le plus proche et vous propose d'en créer un nouveau, que vous acceptez ou non.
{{/callout}}
