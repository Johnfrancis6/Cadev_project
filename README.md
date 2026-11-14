# devloop

**Moins de bruit. Plus de code.** — un réseau social où les développeurs posent leurs problèmes et se débloquent entre eux.

## Ce qui le distingue

1. **Un fil explicable et réglable.** Chaque carte indique pourquoi elle est là ; on règle le poids de chaque sujet ou on dit « moins de ça ». Le fil optimise les problèmes débloqués, pas le temps passé.
2. **« Peut-être déjà résolu ».** Pendant la saisie d'un problème, les problèmes proches déjà résolus s'affichent.
3. **Repro exécutable, fork & fix.** Un problème peut embarquer un mini exemple HTML/CSS/JS qui tourne dans un bac à sable isolé ; une réponse peut joindre la version corrigée.

Aussi : analyse automatique (sujets, niveau, résumé, pistes) toujours signalée et jamais appliquée sans l'auteur, import des centres d'intérêt depuis un pseudo GitHub, cercles avec discussion, mode clair/sombre, français/anglais.

## Lancer

```bash
npm install
npm run dev
```

Autres commandes : `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`.

## État actuel

- **Mode en ligne (Supabase)** : vrais comptes (invité en un clic, e-mail + mot de passe), données partagées entre visiteurs, discussion des cercles en temps réel, règles d'accès ligne par ligne (RLS). Le schéma, les fonctions et les règles sont dans `supabase/migrations/` ; `scripts/supabase-admin.mjs test` rejoue 139 contrôles de sécurité sur la base.
- **Mode démo local** : si Supabase n'est pas configuré ou ne répond pas au démarrage, l'application bascule sur des données enregistrées dans le navigateur (`seed/seed.json`) et l'indique par un bandeau.
- **Pas encore fait** : la passerelle IA et la recherche sémantique. L'analyse d'un problème et le brouillon de réponse sont des heuristiques locales, signalées comme simplifiées ; « déjà résolu » s'appuie sur la recherche plein texte. La connexion GitHub demande d'activer le fournisseur dans Supabase.

`.env.production` contient l'adresse du projet et sa clé publique (conçue pour le navigateur ; la sécurité repose sur les RLS, pas sur le secret de cette clé).

## Architecture

| Dossier | Rôle |
|---|---|
| `src/lib/api/contract.ts` | Contrat de données unique utilisé par toute l'interface |
| `src/lib/api/local/` | Implémentation dans le navigateur (mode démo) |
| `src/lib/feed/` | Classement du fil, apprentissage, raisons (testé) |
| `src/lib/heuristics/` | Similarité, analyse simplifiée, import GitHub |
| `src/features/` | Pages par fonctionnalité, avec leurs textes FR/EN |
| `src/components/`, `src/app/` | Composants partagés, coquille, thème, routes |
| `supabase/`, `scripts/` | Schéma Postgres, RLS, scripts d'administration |
| `docs/SPEC.md` | Spécification détaillée |

Pile : Vite, React 19, TypeScript, Tailwind CSS v4, composants shadcn/ui (Radix), Motion, TanStack Query.

## Sécurité

- En-têtes stricts dans `public/_headers` (CSP sans script en ligne, pas d'intégration en iframe).
- Le code des repros ne s'exécute que dans `public/sandbox.html`, chargé dans une iframe `sandbox="allow-scripts"` : origine opaque, aucun accès au stockage de l'app, réseau fermé.
- Le markdown des utilisateurs est assaini, sans HTML brut ; liens externes en `nofollow noopener`.

Polices DM Sans et JetBrains Mono (SIL Open Font License). Les noms et rôles de démonstration sont fictifs.
