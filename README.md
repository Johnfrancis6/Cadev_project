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

- L'application tourne en **mode démo local** : comptes simulés et données enregistrées dans le navigateur du visiteur (`localStorage`), à partir du contenu de `seed/seed.json`. Toutes les fonctions sont utilisables, mais rien n'est partagé entre visiteurs.
- Le backend Supabase (schéma, règles d'accès RLS, fonctions) est écrit dans `supabase/migrations/` mais **pas encore appliqué ni branché** ; la passerelle IA n'est pas écrite. En mode local, l'analyse est une heuristique, signalée comme simplifiée.

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
