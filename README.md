# Salle des présentations

Bibliothèque de présentations HTML, publiée sur GitHub Pages, protégée par mot de passe, sans backend ni base de données.

## Comment ça marche

- Chaque présentation est un dossier `presentations/<slug>/` avec `index.html` (autonome) et `meta.json` (titre, domaine, audience, durée…).
- À chaque `git push` sur `main`, GitHub Actions valide les `meta.json`, **chiffre** toutes les présentations et l'index (AES-256-GCM) avec une clé dérivée du mot de passe (PBKDF2-SHA256, 600 000 itérations), puis déploie `dist/` sur Pages.
- Le navigateur demande le mot de passe, dérive la clé, déchiffre l'index et affiche la bibliothèque. Les présentations sont déchiffrées à la demande et jouées dans une iframe isolée (sandbox, sans accès à la clé).
- Ce qui est publié sur Pages : des fichiers `.bin` illisibles, des noms de fichiers hachés, un `robots.txt` qui interdit l'indexation. Titres, domaines et contenus ne sont lisibles qu'avec le mot de passe.
- Claude ajoute des présentations en suivant `CLAUDE.md`. Il n'a jamais besoin du mot de passe.

## Mise en ligne

1. **Crée un repo privé** sur GitHub, par exemple `salle-des-presentations`, puis pousse ce dossier :
   ```bash
   git remote add origin git@github.com:<ton-user>/salle-des-presentations.git
   git push -u origin main
   ```
2. **Ajoute le mot de passe** : repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*.
   Nom : `SITE_PASSWORD`. Valeur : une phrase de passe longue (12 caractères minimum, 5 mots au hasard recommandés).
3. **Active Pages** : repo → *Settings* → *Pages* → *Build and deployment* → *Source* : **GitHub Actions**.
4. **Lance le déploiement** : onglet *Actions* → *Déployer sur GitHub Pages* → *Run workflow* (ou fais un push).
5. L'adresse du site apparaît à la fin du job : `https://<ton-user>.github.io/salle-des-presentations/`.

Au quotidien : Claude ajoute un dossier, tu fais `git push`, le site se met à jour en environ une minute.

## Limites de la protection (à lire)

- **Repo privé et plan GitHub.** Sur GitHub Free, Pages ne fonctionne qu'avec un repo **public**. Dans ce cas, les fichiers sources (`presentations/*/index.html`) sont lisibles par tout le monde sur GitHub et le chiffrement ne protège que le site déployé. Pour un vrai secret, utilise un repo privé : il faut GitHub Pro, Team ou Enterprise (Pages sur repo privé).
- **Même avec un repo privé, l'URL du site est publique.** Seul le contenu est protégé : n'importe qui peut télécharger les `.bin`, donc la solidité repose sur le mot de passe. Choisis une phrase de passe longue et unique.
- **Changer le mot de passe** : modifie le secret `SITE_PASSWORD` et relance le déploiement. Les appareils qui ont coché « Rester connecté » devront se reconnecter.
- Une personne qui a déjà vu le mot de passe garde accès aux anciennes versions qu'elle a téléchargées. Pour révoquer, change le mot de passe et le sel (`config/salt.txt`) puis redéploie.
- Une présentation jouée est déchiffrée dans la mémoire du navigateur de la personne qui la regarde. C'est voulu.

## Tester en local

```bash
export SITE_PASSWORD='une phrase de passe de test'
npm run dev        # build + http://localhost:8080
npm run check      # valide les présentations sans mot de passe
```

Aucune dépendance à installer (Node 20 ou plus).

## Structure

```
presentations/<slug>/{index.html,meta.json}   contenu
config/domains.json                           domaines autorisés et couleurs
config/salt.txt                               sel PBKDF2 (public, ne pas changer sans raison)
site/                                         l'application statique
scripts/build.mjs                             validation + chiffrement
.github/workflows/pages.yml                   déploiement
CLAUDE.md                                     consignes pour Claude
```
