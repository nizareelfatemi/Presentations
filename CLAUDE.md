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
| `shareRev` | non | entier >= 0 (défaut 0). Incrémenter pour révoquer les liens de partage déjà envoyés |

4. Si le domaine n'existe pas encore, ajoute-le dans `config/domains.json` (nom → couleur hex).
5. Vérifie : `npm run check` (valide tout sans mot de passe).
6. Commit puis push sur `main` : GitHub Actions valide, chiffre et déploie.

## Export PPTX

Chaque présentation est exportée en PPTX au déploiement (bouton « Exporter en PPTX » dans la fiche, la barre de présentation et la page publique du lien de partage). Chaque slide est photographiée par Chromium en 2560×1440 : fidélité visuelle maximale. Le fichier est chiffré comme le reste, avec la clé de la présentation.

Règles pour que l'export fonctionne :
- les slides sont des éléments `.slide` (l'active porte la classe `on`) et ArrowRight passe à la suivante ;
- éléments à masquer dans l'export (barre de contrôle vidéo, indicateurs…) : classe `noexport` ;
- **vidéos** : `<video id="…">` + `window.__PPTX_VIDEOS__ = { "<id>": "<MP4 H.264 en base64>" }`. Elles sont insérées dans le PPTX comme de vraies vidéos PowerPoint (contrôles natifs) à l'emplacement exact de la vidéo. Fournir du MP4 (PowerPoint ne lit pas le WebM) ;
- en local : `npm install && npx playwright install chromium`, puis `npm run dev`. Sans cela le site est construit sans bouton d'export (`EXPORT_PPTX=0` pour le désactiver).

## Liens de partage

Chaque fiche a un bouton « Copier le lien de partage » : `…/play.html#<fichier>.<clé>`. Le lien ouvre directement la présentation en plein écran, **sans mot de passe**, et uniquement celle-ci. Rien à faire côté contenu : le build chiffre chaque présentation avec une clé propre, dérivée du mot de passe (HMAC), stable d'un déploiement à l'autre. Pour révoquer le lien d'une présentation : incrémenter `shareRev` dans son `meta.json` et redéployer (changer le mot de passe révoque tous les liens). Ne jamais écrire un lien de partage dans le repo.

## Règles

- Ne modifie pas `config/salt.txt` (changer le sel invalide les sessions mémorisées).
- Ne committe jamais de mot de passe, de `.env` ni le dossier `dist/`.
- Ne touche pas aux autres présentations sauf demande explicite.
- Le dossier `presentations/demo-bienvenue/` est un exemple : le supprimer quand l'utilisateur a ses propres présentations.

## Structure

- `presentations/<slug>/{index.html,meta.json}` — le contenu
- `site/` — l'application (HTML/CSS/JS statique, sans dépendance) ; `site/play.html` est la page de lecture des liens de partage
- `scripts/build.mjs` — validation + chiffrement → `dist/` ; `scripts/export-pptx.mjs` — export PPTX
- `.github/workflows/pages.yml` — déploiement (secret `SITE_PASSWORD`)
