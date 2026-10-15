# Salle des présentations — instructions pour Claude

Ce repo est une bibliothèque de présentations HTML publiée sur GitHub Pages. Le site est protégé par mot de passe : le build **chiffre** chaque présentation avant le déploiement. Tu n'as jamais besoin du mot de passe et tu ne dois jamais le demander, l'écrire ou le committer.

## Ajouter une présentation (ta tâche principale)

1. Choisis un identifiant (slug) : minuscules, chiffres et tirets (`budget-2027`, `ia-generative-comex`).
2. Crée `presentations/<slug>/index.html` : **un seul fichier autonome**.
   - CSS et JS embarqués dans le fichier.
   - Images, polices et médias en `data:` URI. Aucune référence à un fichier local (`./img.png`, `style.css`…).
   - Les bibliothèques sur CDN (https://…) sont autorisées, mais préfère embarquer pour que ça marche hors ligne.
   - Navigation au clavier (← → espace) et plein écran 16:9 adaptatif. La présentation s'affiche dans une iframe plein écran.
   - Ne dépend ni de `localStorage` ni de cookies (l'iframe est isolée).
3. Crée `presentations/<slug>/meta.json` :

```json
{
  "title": "Titre affiché",
  "summary": "Une phrase de résumé.",
  "domain": "Tech",
  "audience": "Direction",
  "duration": 30,
  "level": "Débutant",
  "language": "fr",
  "date": "2026-10-15",
  "tags": ["IA", "stratégie"],
  "slides": 24,
  "outline": ["Contexte", "Cas d'usage", "Roadmap"]
}
```

| Champ | Obligatoire | Règle |
|---|---|---|
| `title`, `summary`, `audience` | oui | texte non vide |
| `domain` | oui | une clé de `config/domains.json` (sinon le build échoue) |
| `duration` | oui | minutes, nombre > 0 |
| `date` | oui | `AAAA-MM-JJ`, date d'ajout |
| `level` | non | ex. Débutant, Intermédiaire, Avancé |
| `language` | non | défaut `fr` |
| `tags`, `outline` | non | listes de textes |
| `slides` | non | entier > 0 |

4. Si le domaine n'existe pas encore, ajoute-le dans `config/domains.json` (nom → couleur hex).
5. Vérifie : `npm run check` (valide tout sans mot de passe).
6. Commit puis push sur `main` : GitHub Actions valide, chiffre et déploie.

## Règles

- Ne modifie pas `config/salt.txt` (changer le sel invalide les sessions mémorisées).
- Ne committe jamais de mot de passe, de `.env` ni le dossier `dist/`.
- Ne touche pas aux autres présentations sauf demande explicite.
- Le dossier `presentations/demo-bienvenue/` est un exemple : le supprimer quand l'utilisateur a ses propres présentations.

## Structure

- `presentations/<slug>/{index.html,meta.json}` — le contenu
- `site/` — l'application (HTML/CSS/JS statique, sans dépendance)
- `scripts/build.mjs` — validation + chiffrement → `dist/`
- `.github/workflows/pages.yml` — déploiement (secret `SITE_PASSWORD`)
