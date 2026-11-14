/**
 * Deterministic triage without any AI provider: the safety net behind `ai.triage` and
 * `ai.draftAnswer` (local mode, exhausted budget, providers down). Pure functions.
 *
 * Results are always flagged `provider: 'heuristic'`, `degraded: true`.
 */
import type { DraftResult, Level, Locale, TriageInput, TriageResult } from '../api/contract';
import { normalizeText } from './similarity';

type Rule = [pattern: RegExp, weight: number];

interface Hint {
  /** When set, the hint is preferred if the text matches. */
  when?: RegExp;
  fr: string;
  en: string;
}

interface Topic {
  rules: Rule[];
  /** "Likely cause area", used by the answer draft. */
  area: { fr: string; en: string };
  hints: Hint[];
}

/** Patterns run on lower-cased, accent-free text (see `normalizeText`). */
const TOPICS: Record<string, Topic> = {
  javascript: {
    rules: [[/\bjavascript\b/, 3], [/\bjs\b/, 2], [/\bpromise|\basync\b|\bawait\b/, 2], [/addeventlistener|queryselector|\bdom\b/, 2], [/settimeout|setinterval|closure|\bthis\b/, 1], [/json\.(parse|stringify)|\.foreach\(|\.map\(|\.sort\(/, 1], [/is not a function|is not defined|cannot read propert/, 2]],
    area: { fr: "l'asynchrone, la portée des variables ou la valeur de `this`", en: 'async flow, variable scope or the value of `this`' },
    hints: [
      { when: /promise|async|await|foreach/, fr: "Vérifie que chaque promesse est bien attendue (`await`, `Promise.all`) : `forEach` n'attend pas un callback async.", en: 'Check that every promise is awaited (`await`, `Promise.all`): `forEach` does not wait for an async callback.' },
      { when: /\bthis\b|undefined|nan/, fr: 'Affiche la valeur de `this` et des variables juste avant la ligne en cause : une méthode passée en callback perd son objet.', en: 'Log `this` and the variables right before the failing line: a method passed as a callback loses its object.' },
      { fr: "Ouvre la console du navigateur et lis l'erreur complète, avec le fichier et la ligne.", en: 'Open the browser console and read the full error, including file and line.' },
      { fr: 'Isole le problème dans un repro de dix lignes, sans le reste de la page.', en: 'Isolate the problem in a ten-line repro, without the rest of the page.' },
    ],
  },
  typescript: {
    rules: [[/\btypescript\b/, 3], [/\bts\d{4,5}\b/, 3], [/\btsc\b|tsconfig/, 2], [/not assignable to|possibly '?(undefined|null)|type instantiation/, 3], [/\binterface\b|\bgeneri(c|que)|\bas const\b|\bsatisfies\b|\bkeyof\b|\binfer\b/, 2], [/\btypes?\b/, 1]],
    area: { fr: "l'inférence ou le rétrécissement des types", en: 'type inference or narrowing' },
    hints: [
      { when: /not assignable|ts2345|ts2322/, fr: "Survole la valeur dans l'éditeur pour voir le type réellement inféré : un littéral est souvent élargi en `string` ou `number`.", en: 'Hover the value in your editor to see the inferred type: a literal is often widened to `string` or `number`.' },
      { when: /undefined|null|ts18048|ts2532/, fr: 'Copie la valeur dans une `const` locale avant de la tester : le rétrécissement ne survit pas dans un callback.', en: 'Copy the value into a local `const` before checking it: narrowing does not survive inside a callback.' },
      { fr: "Lis le message d'erreur jusqu'à la dernière ligne : c'est elle qui nomme la propriété incompatible.", en: 'Read the error down to its last line: that is where the incompatible property is named.' },
      { fr: 'Évite `as` et `!` pour faire taire le compilateur : cherche plutôt où le type se perd.', en: 'Avoid `as` and `!` to silence the compiler: look for where the type gets lost instead.' },
    ],
  },
  react: {
    rules: [[/\breact\b/, 3], [/use(state|effect|memo|callback|ref|context|reducer)\b/, 3], [/\bjsx\b|\btsx\b|\bhooks?\b/, 2], [/\bnextjs\b|rerender|strictmode|\bprops?\b/, 2], [/composant|component/, 1], [/zustand|redux|react query|tanstack|testing library/, 2]],
    area: { fr: 'le cycle de rendu et les hooks (dépendances des effets, état, clés)', en: 'the render cycle and hooks (effect dependencies, state, keys)' },
    hints: [
      { when: /useeffect|deux fois|twice|double/, fr: 'Vérifie le tableau de dépendances et la fonction de nettoyage de `useEffect` ; en développement, StrictMode monte les composants deux fois.', en: 'Check the dependency array and the cleanup of `useEffect`; in development, StrictMode mounts components twice.' },
      { when: /rerender|lent|slow|perf/, fr: 'Enregistre un profil avec React DevTools (« why did this render ») avant d’ajouter des `memo`.', en: 'Record a profile in React DevTools ("why did this render") before adding `memo`.' },
      { when: /usestate|setstate|state/, fr: "Une mise à jour d'état n'est visible qu'au rendu suivant : ne lis pas la nouvelle valeur juste après le setter.", en: 'A state update is only visible on the next render: do not read the new value right after the setter.' },
      { fr: 'Réduis le composant au minimum qui reproduit le problème, sans le reste de la page.', en: 'Reduce the component to the minimum that reproduces the problem.' },
    ],
  },
  nodejs: {
    rules: [[/\bnodejs\b|\bnode\b/, 3], [/\bexpress\b|\bfastify\b|\bnestjs\b/, 3], [/\bnpm\b|package\.json|node_modules/, 2], [/eaddrinuse|econnrefused|require\(|middleware|\bcors\b/, 2], [/process\.(env|memoryusage)|\bworker\b/, 1]],
    area: { fr: "la configuration du serveur, l'ordre des middlewares ou les variables d'environnement", en: 'server configuration, middleware order or environment variables' },
    hints: [
      { when: /cors|access-control/, fr: "Regarde les en-têtes de la réponse dans l'onglet Réseau : avec des cookies, l'origine doit être exacte, jamais `*`.", en: 'Look at the response headers in the Network tab: with cookies the origin must be exact, never `*`.' },
      { when: /eaddrinuse|port/, fr: 'Cherche le processus qui occupe déjà le port (`lsof -i :3000`, ou `netstat -ano` sous Windows).', en: 'Find the process already using the port (`lsof -i :3000`, or `netstat -ano` on Windows).' },
      { fr: "Vérifie l'ordre de tes middlewares : ils s'exécutent dans l'ordre où ils sont déclarés.", en: 'Check the order of your middlewares: they run in the order they are declared.' },
      { fr: 'Affiche la version de Node (`node -v`) et compare-la à celle attendue par le projet.', en: 'Print the Node version (`node -v`) and compare it with the one the project expects.' },
    ],
  },
  python: {
    rules: [[/\bpython\b/, 3], [/traceback|\bpip\b|\bvenv\b|\basyncio\b|aiohttp/, 3], [/modulenotfounderror|unboundlocalerror|indentationerror|typeerror: /, 3], [/\bdef \w+\(|\bimport \w+|\.py\b/, 2], [/fastapi|flask|pytest/, 2]],
    area: { fr: "l'environnement Python utilisé ou la portée des variables", en: 'the Python environment in use or variable scope' },
    hints: [
      { when: /modulenotfound|pip|venv|import/, fr: "Vérifie que `pip` et `python` désignent le même environnement : lance `python -m pip install …`.", en: 'Make sure `pip` and `python` point to the same environment: run `python -m pip install …`.' },
      { when: /asyncio|aiohttp|timeout/, fr: 'Limite le nombre de tâches simultanées avec un `asyncio.Semaphore` et mesure chaque étape.', en: 'Cap the number of concurrent tasks with an `asyncio.Semaphore` and time each step.' },
      { fr: 'Lis le traceback de bas en haut : la dernière ligne donne l’erreur, celles du dessus le chemin pour y arriver.', en: 'Read the traceback bottom-up: the last line is the error, the lines above are how you got there.' },
      { fr: 'Reproduis le problème dans un fichier de dix lignes, sans le reste du projet.', en: 'Reproduce the problem in a ten-line file, without the rest of the project.' },
    ],
  },
  django: {
    rules: [[/\bdjango\b/, 4], [/queryset|select_related|prefetch_related|manage\.py|makemigrations/, 3], [/csrf|\borm\b|\{% ?\w+/, 1]],
    area: { fr: "l'ORM (requêtes paresseuses), les migrations ou la configuration du projet", en: 'the ORM (lazy queries), migrations or project settings' },
    hints: [
      { when: /requete|query|lent|slow|sql/, fr: 'Compte les requêtes avec django-debug-toolbar : une boucle sur une relation en déclenche une par ligne.', en: 'Count queries with django-debug-toolbar: looping over a relation fires one query per row.' },
      { when: /migration/, fr: 'Lance `python manage.py showmigrations` pour voir ce qui est appliqué, et teste sur une copie de la base.', en: 'Run `python manage.py showmigrations` to see what is applied, and test on a copy of the database.' },
      { when: /csrf|403/, fr: 'Vérifie la présence de `{% csrf_token %}` dans le formulaire, ou de l’en-tête `X-CSRFToken` pour un appel fetch.', en: 'Check for `{% csrf_token %}` in the form, or the `X-CSRFToken` header for a fetch call.' },
      { fr: 'Passe `DEBUG = True` en local pour obtenir la page d’erreur détaillée.', en: 'Set `DEBUG = True` locally to get the detailed error page.' },
    ],
  },
  'data-ai': {
    rules: [[/\bpandas\b|\bnumpy\b|dataframe/, 3], [/scikit|sklearn|pytorch|tensorflow|keras/, 3], [/machine learning|deep learning|\bllm\b|\brag\b|embedding|\bgpt\b|prompt/, 3], [/\bmodele?\b|\bmodel\b|accuracy|dataset|jeu de donnees|entrainement|training/, 2], [/\bia\b|\bai\b|\bdata\b/, 1]],
    area: { fr: 'la préparation des données ou la façon dont le modèle est évalué', en: 'data preparation or the way the model is evaluated' },
    hints: [
      { when: /accuracy|validation|score|overfit/, fr: 'Vérifie que chaque variable est connue au moment de la prédiction, et que rien n’est ajusté avant la séparation train/test.', en: 'Check that every feature is known at prediction time and that nothing is fitted before the train/test split.' },
      { when: /pandas|dataframe|settingwithcopy/, fr: 'Utilise `.loc[lignes, colonne] = valeur` en une seule opération plutôt que deux indexations à la suite.', en: 'Use `.loc[rows, column] = value` in one operation instead of two chained indexers.' },
      { when: /embedding|rag|llm/, fr: 'Évalue sur une vingtaine de questions dont tu connais la réponse avant de changer un réglage.', en: 'Evaluate on twenty questions with known answers before changing any setting.' },
      { fr: 'Affiche la forme et quelques lignes de tes données à chaque étape (`df.shape`, `df.head()`).', en: 'Print the shape and a few rows of your data at each step (`df.shape`, `df.head()`).' },
    ],
  },
  databases: {
    rules: [[/\bsql\b|postgres|\bmysql\b|sqlite|mongodb|mariadb/, 3], [/\bselect\b.*\bfrom\b|\bjoin\b|order by|group by|explain/, 2], [/\bindex\b|transaction|deadlock|\bprisma\b|supabase|\bredis\b/, 2], [/requete|query|base de donnees|database/, 1]],
    area: { fr: 'le plan d’exécution de la requête, les index ou les jointures', en: 'the query plan, indexes or joins' },
    hints: [
      { when: /lent|slow|ms|seconde|order by|index/, fr: 'Lance `EXPLAIN ANALYZE` sur la requête et cherche les lignes « Seq Scan » ou « Rows Removed by Filter ».', en: 'Run `EXPLAIN ANALYZE` on the query and look for "Seq Scan" or "Rows Removed by Filter".' },
      { when: /join/, fr: 'Avec un LEFT JOIN, une condition sur la table de droite placée dans le WHERE supprime les lignes sans correspondance : mets-la dans le ON.', en: 'With a LEFT JOIN, a condition on the right table in WHERE drops unmatched rows: move it into ON.' },
      { fr: 'Exécute la requête seule, hors de l’application, avec les mêmes paramètres.', en: 'Run the query on its own, outside the application, with the same parameters.' },
      { fr: 'Utilise des requêtes paramétrées plutôt que de concaténer des valeurs dans le SQL.', en: 'Use parameterised queries rather than concatenating values into SQL.' },
    ],
  },
  devops: {
    rules: [[/\bdocker\b|dockerfile|docker-compose|\bcompose\b/, 3], [/kubernetes|\bk8s\b|\bpods?\b|helm/, 3], [/github actions|gitlab ci|\bci\b|pipeline|\bcd\b/, 2], [/nginx|reverse proxy|\b50[234]\b|terraform|ansible/, 2], [/deploiement|deploy|\bprod(uction)?\b|\bvps\b|conteneur|container/, 1]],
    area: { fr: "la construction de l'image, la configuration réseau ou l'environnement d'exécution", en: 'the image build, network configuration or runtime environment' },
    hints: [
      { when: /image|dockerfile|taille|size/, fr: 'Lance `docker history <image>` pour voir le poids de chaque couche, puis passe à un build multi-étapes.', en: 'Run `docker history <image>` to see the weight of each layer, then move to a multi-stage build.' },
      { when: /502|504|nginx|proxy|timeout/, fr: 'Compare les délais (keep-alive, timeout) des deux côtés du proxy : le plus court doit être côté client.', en: 'Compare the timeouts (keep-alive, request) on both sides of the proxy: the shorter one must be on the client side.' },
      { fr: 'Lis les logs du conteneur (`docker logs`) au moment exact de l’erreur.', en: 'Read the container logs (`docker logs`) at the exact time of the error.' },
      { fr: 'Vérifie les variables d’environnement réellement présentes dans l’environnement qui échoue.', en: 'Check which environment variables are actually set in the failing environment.' },
    ],
  },
  mobile: {
    rules: [[/\bflutter\b|\bdart\b|reactnative|\bexpo\b/, 3], [/\bandroid\b|\bios\b|\bkotlin\b|\bswift\b|\bapk\b/, 3], [/\bfcm\b|notifications? push|push notifications?|flatlist|setstate\(\) called/, 3], [/\bmobile\b|telephone|\bphone\b/, 1]],
    area: { fr: "le cycle de vie des écrans ou les restrictions de l'appareil", en: 'screen lifecycle or device restrictions' },
    hints: [
      { when: /setstate|dispose|mounted/, fr: 'Après chaque `await`, vérifie que l’écran existe encore (`mounted`) avant de modifier son état.', en: 'After every `await`, check the screen still exists (`mounted`) before updating its state.' },
      { when: /notification|fcm|push/, fr: 'Teste sur un appareil de la marque concernée : certaines surcouches Android arrêtent les applications fermées.', en: 'Test on a device from the affected vendor: some Android skins stop apps that were swiped away.' },
      { fr: 'Reproduis sur un vrai appareil d’entrée de gamme, pas seulement sur l’émulateur.', en: 'Reproduce on a real low-end device, not only on the emulator.' },
      { fr: 'Lis les logs de l’appareil (`adb logcat` ou la console Xcode) au moment du problème.', en: 'Read the device logs (`adb logcat` or the Xcode console) when the problem happens.' },
    ],
  },
  css: {
    rules: [[/\bcss\b|\bscss\b|\bsass\b|tailwind/, 3], [/flexbox|\bflex\b|\bgrid\b|\bsticky\b|zindex|overflow/, 3], [/position: ?(absolute|relative|fixed)|media query|responsive|\banimation\b|transform|hover/, 2], [/accessib|a11y|contrast/, 2], [/\bstyle|mise en page|layout/, 1]],
    area: { fr: "la cascade, le contexte d'empilement ou les propriétés des éléments parents", en: 'the cascade, the stacking context or properties of parent elements' },
    hints: [
      { when: /sticky|overflow/, fr: 'Remonte les parents dans l’inspecteur : un `overflow` autre que `visible` sur un ancêtre empêche `position: sticky`.', en: 'Walk up the parents in the inspector: an `overflow` other than `visible` on an ancestor breaks `position: sticky`.' },
      { when: /zindex/, fr: 'Cherche un parent qui crée un contexte d’empilement (`transform`, `opacity`, `filter`) : le z-index ne compte qu’à l’intérieur.', en: 'Look for a parent creating a stacking context (`transform`, `opacity`, `filter`): z-index only counts inside it.' },
      { fr: 'Inspecte l’élément et regarde les styles calculés : la règle que tu attends est peut-être barrée.', en: 'Inspect the element and check the computed styles: the rule you expect may be struck through.' },
      { fr: 'Reproduis avec le minimum de HTML et de CSS, puis réintroduis le reste petit à petit.', en: 'Reproduce with minimal HTML and CSS, then add the rest back step by step.' },
    ],
  },
  git: {
    rules: [[/\bgit\b|github|gitlab/, 2], [/\bgit (pull|push|merge|rebase|reset|commit|stash|checkout|log|rm)\b/, 4], [/\bcommit(e|s)?\b|\bmerge\b|\brebase\b|reflog|gitignore|\bbranche?s?\b/, 2], [/conflit|conflict|historique|history/, 1]],
    area: { fr: "l'état de l'historique ou de la branche", en: 'the state of the history or the branch' },
    hints: [
      { when: /reset|perdu|lost|supprim/, fr: 'Lance `git reflog` : presque tout ce qui a été commité reste récupérable pendant plusieurs semaines.', en: 'Run `git reflog`: almost anything that was committed stays recoverable for weeks.' },
      { when: /\.env|cle|secret|password|mot de passe/, fr: 'Si un secret a été poussé, révoque-le d’abord ; nettoyer l’historique ne suffit pas.', en: 'If a secret was pushed, revoke it first; cleaning the history is not enough.' },
      { fr: 'Commence par `git status` et `git log --oneline --graph -15` pour voir où tu en es.', en: 'Start with `git status` and `git log --oneline --graph -15` to see where you stand.' },
      { fr: 'Crée une branche de sauvegarde avant toute commande qui réécrit l’historique.', en: 'Create a backup branch before any command that rewrites history.' },
    ],
  },
  security: {
    rules: [[/securite|security|vulnerab|faille/, 3], [/\bxss\b|\bcsrf\b|injection|\bjwt\b|oauth/, 3], [/\bcors\b|access-control|httponly|samesite/, 2], [/mot de passe|password|\btoken\b|\bhash|\.env\b|cle d'api|api key|secret/, 2]],
    area: { fr: 'la gestion des identifiants, des origines autorisées ou des entrées utilisateur', en: 'handling of credentials, allowed origins or user input' },
    hints: [
      { when: /\.env|cle|secret|token|password|mot de passe/, fr: 'Considère tout secret exposé comme compromis : révoque-le et régénère-le avant toute autre action.', en: 'Treat any exposed secret as compromised: revoke and regenerate it before anything else.' },
      { when: /cors|access-control/, fr: 'CORS est appliqué par le navigateur : teste dans le navigateur, pas seulement avec curl.', en: 'CORS is enforced by the browser: test in the browser, not only with curl.' },
      { fr: 'Ne fais jamais confiance aux données venant du client : valide-les et échappe-les côté serveur.', en: 'Never trust client data: validate and escape it on the server.' },
      { fr: 'Ne colle pas de vraies clés ni de mots de passe dans ton message.', en: 'Do not paste real keys or passwords in your post.' },
    ],
  },
  testing: {
    rules: [[/\bjest\b|\bvitest\b|playwright|cypress|\bpytest\b|\bjunit\b/, 3], [/testing library|testinglibraryelementerror|\bmock|flaky|\btdd\b|coverage/, 3], [/\btests?\b|\bexpect\(|\bassert/, 2]],
    area: { fr: "l'isolation des tests ou le code asynchrone qui n'est pas attendu", en: 'test isolation or asynchronous code that is not awaited' },
    hints: [
      { when: /unable to find|findby|getby|async|await/, fr: 'Ce qui apparaît après un appel asynchrone se cherche avec `await screen.findBy…`, pas `getBy…`.', en: 'Anything that appears after async work should be queried with `await screen.findBy…`, not `getBy…`.' },
      { when: /flaky|aleatoire|random|parfois|sometimes|suite/, fr: 'Lance le test seul, puis toute la suite : s’il ne passe que seul, un état partagé ou un mock n’est pas réinitialisé.', en: 'Run the test alone, then the whole suite: if it only passes alone, shared state or a mock is not reset.' },
      { fr: 'Affiche le DOM ou la valeur réelle au moment de l’assertion (`screen.debug()`).', en: 'Print the DOM or the actual value at assertion time (`screen.debug()`).' },
      { fr: 'Vérifie que le test attend bien la fin du code asynchrone avant de se terminer.', en: 'Check that the test waits for async code to finish before it ends.' },
    ],
  },
  career: {
    rules: [[/carriere|career|entretien|interview|recrut|hiring/, 3], [/salaire|salary|\bstage\b|internship|alternance|freelance|\besn\b|startup/, 2], [/\bcv\b|resume|portfolio|junior|premier poste|first job|reconversion|live coding/, 2]],
    area: { fr: 'le contexte du poste et ce que tu veux apprendre', en: 'the context of the role and what you want to learn' },
    hints: [
      { fr: 'Précise ton contexte : niveau, ville ou pays, type d’entreprise visé.', en: 'Give your context: level, city or country, kind of company you are aiming at.' },
      { fr: 'Formule la décision à prendre et les options que tu envisages déjà.', en: 'State the decision you need to make and the options you already consider.' },
      { fr: 'Demande des retours d’expérience concrets plutôt qu’un avis général.', en: 'Ask for concrete experience rather than general opinions.' },
    ],
  },
  java: {
    rules: [[/\bjava\b/, 3], [/\bspring\b|hibernate|\bjpa\b|\bmaven\b|\bgradle\b|\bjvm\b/, 3], [/nullpointerexception|lazyinitializationexception|public static void main|system\.out/, 3], [/\bkotlin\b/, 1]],
    area: { fr: 'la différence entre références et valeurs, ou le chargement des entités', en: 'references versus values, or entity loading' },
    hints: [
      { when: /==|equals|string/, fr: 'Compare les chaînes avec `equals`, pas avec `==`, qui compare les références.', en: 'Compare strings with `equals`, not `==`, which compares references.' },
      { when: /lazy|session|hibernate|jpa/, fr: 'Charge les relations nécessaires dans la requête ou passe par un DTO, plutôt que de garder la session ouverte.', en: 'Load the needed relations in the query or use a DTO rather than keeping the session open.' },
      { fr: 'Lis la pile d’appels jusqu’à la première ligne qui appartient à ton code.', en: 'Read the stack trace down to the first line that belongs to your code.' },
      { fr: 'Reproduis le cas dans un test unitaire minimal.', en: 'Reproduce the case in a minimal unit test.' },
    ],
  },
  php: {
    rules: [[/\bphp\b|<\?php/, 4], [/laravel|symfony|composer|\bpdo\b|wordpress|artisan|doctrine/, 3], [/headers already sent|\$_(post|get|session)/, 3]],
    area: { fr: "l'ordre d'exécution du script ou la configuration de l'environnement", en: 'script execution order or environment configuration' },
    hints: [
      { when: /headers already sent|header\(/, fr: 'Le message indique où la sortie a commencé : cherche un espace ou une ligne après `?>`, ou un `echo` avant `header()`.', en: 'The message says where output started: look for whitespace after `?>` or an `echo` before `header()`.' },
      { when: /sql|pdo|requete|query/, fr: 'Utilise des requêtes préparées avec PDO plutôt que de concaténer les variables.', en: 'Use PDO prepared statements rather than concatenating variables.' },
      { fr: 'Active l’affichage des erreurs en local (`display_errors=1`, `error_reporting(E_ALL)`).', en: 'Turn on error display locally (`display_errors=1`, `error_reporting(E_ALL)`).' },
      { fr: 'Vérifie la version de PHP utilisée par le serveur avec `php -v`.', en: 'Check the PHP version the server runs with `php -v`.' },
    ],
  },
  go: {
    rules: [[/\bgolang\b/, 4], [/goroutine|\bchan\b|\bgo (run|build|mod|test|vet)\b|package main|func main\(\)/, 4], [/all goroutines are asleep|\bdeadlock\b|err != nil|\bgofmt\b|sync\.(mutex|map|waitgroup)/, 3], [/\ben go\b|\bgo\b ?:|^go\b/, 2]],
    area: { fr: 'la synchronisation entre goroutines ou la gestion des erreurs', en: 'synchronisation between goroutines or error handling' },
    hints: [
      { when: /deadlock|chan|channel|goroutine/, fr: 'Sur un channel non bufferisé, un envoi bloque tant qu’une autre goroutine ne reçoit pas : vérifie qui lit et qui écrit.', en: 'On an unbuffered channel a send blocks until another goroutine receives: check who reads and who writes.' },
      { fr: 'Lance le programme avec `go run -race .` pour détecter les accès concurrents.', en: 'Run the program with `go run -race .` to detect data races.' },
      { fr: 'Ajoute du contexte à chaque erreur renvoyée (`fmt.Errorf("…: %w", err)`).', en: 'Add context to every returned error (`fmt.Errorf("…: %w", err)`).' },
    ],
  },
};

const LANGUAGE_TO_SLUG: Record<string, string> = {
  js: 'javascript', javascript: 'javascript', mjs: 'javascript', html: 'javascript',
  jsx: 'react', tsx: 'react',
  ts: 'typescript', typescript: 'typescript',
  py: 'python', python: 'python',
  java: 'java', kotlin: 'mobile', kt: 'mobile', dart: 'mobile', swift: 'mobile',
  php: 'php', go: 'go', golang: 'go',
  sql: 'databases', pgsql: 'databases',
  css: 'css', scss: 'css', sass: 'css',
  dockerfile: 'devops', docker: 'devops', yaml: 'devops', yml: 'devops', nginx: 'devops',
};

const GENERIC_HINTS: Hint[] = [
  { when: /error|erreur|exception|traceback|warning|fatal/, fr: "Copie le message d'erreur exact dans la recherche : quelqu'un l'a peut-être déjà résolu ici.", en: 'Paste the exact error message into search: someone may have solved it here already.' },
  { fr: 'Ajoute le plus petit extrait de code qui reproduit le problème, et ce que tu attendais à la place.', en: 'Add the smallest piece of code that reproduces the problem, and what you expected instead.' },
  { fr: 'Précise les versions utilisées (langage, framework, système) et ce que tu as déjà essayé.', en: 'State the versions involved (language, framework, OS) and what you already tried.' },
];

const SENIOR_SIGNALS = /race condition|deadlock|fuite memoire|memory leak|\bheap\b|\brss\b|\bp9[59]\b|scalab|concurren|kubernetes|replication|sharding|explain analyze|profil(er|ing)|fragmentation|keepalive|sous charge|under load|en production|in production|millions? de lignes|million rows|excessively deep|circularly references|architecture|oom/g;
const BEGINNER_SIGNALS = /debutant|beginner|je debute|i'?m new|newbie|premier projet|first project|\btuto|\bcours\b|\btp\b|exercice|j'apprends|i'?m learning|je ne comprends pas|i don'?t understand|question bete|etudiant|student|alternan|is not defined|syntaxerror|indentationerror|modulenotfounderror|unboundlocalerror|headers already sent|eaddrinuse/g;

export const TRIAGE_MAX_TAGS = 3;

/** Topic scores for a text, highest first. Exposed for tests and for the answer draft. */
export function detectTopics(input: { title: string; bodyMd?: string; code?: string | null; language?: string | null }): { slug: string; score: number }[] {
  const title = normalizeText(input.title ?? '');
  const rest = normalizeText(`${input.bodyMd ?? ''}\n${input.code ?? ''}`);
  const language = (input.language ?? '').trim().toLowerCase();
  const scores: { slug: string; score: number }[] = [];
  for (const [slug, topic] of Object.entries(TOPICS)) {
    let score = 0;
    for (const [pattern, weight] of topic.rules) {
      if (pattern.test(title)) score += weight * 2;
      else if (pattern.test(rest)) score += weight;
    }
    if (language && LANGUAGE_TO_SLUG[language] === slug) score += 3;
    if (score > 0) scores.push({ slug, score });
  }
  return scores.sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : 1));
}

function pickTags(scores: { slug: string; score: number }[]): string[] {
  const top = scores[0]?.score ?? 0;
  if (top < 2) return [];
  return scores.filter((entry) => entry.score >= 2 && entry.score >= top * 0.4).slice(0, TRIAGE_MAX_TAGS).map((entry) => entry.slug);
}

function guessDifficulty(text: string, code: string | null | undefined): Level {
  const senior = (text.match(SENIOR_SIGNALS) ?? []).length;
  const beginner = (text.match(BEGINNER_SIGNALS) ?? []).length;
  if (senior >= 2 && senior > beginner) return 'senior';
  if (beginner >= 1 && beginner >= senior) return 'beginner';
  if (senior === 1 && (code?.split('\n').length ?? 0) > 40) return 'senior';
  return 'intermediate';
}

/** Markdown → plain text, without code blocks. */
function plain(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const GREETING = /^(bonjour|bonsoir|salut|hello|hi|hey|coucou)[^.!?]{0,40}[.!?,]\s*/i;

function summarize(title: string, bodyMd: string): string {
  let text = plain(bodyMd).replace(GREETING, '');
  if (text.length < 20) text = plain(title);
  const sentences = text.match(/[^.!?…]+[.!?…]+(?=\s|$)|[^.!?…]+$/g) ?? [text];
  let summary = (sentences[0] ?? text).trim();
  if (summary.length < 60 && sentences[1]) summary = `${summary} ${sentences[1].trim()}`;
  if (summary.length > 200) summary = `${summary.slice(0, 197).replace(/\s+\S*$/, '')}…`;
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function pickHints(tags: string[], text: string, locale: Locale, hasCode: boolean): string[] {
  const chosen: Hint[] = [];
  const add = (hint: Hint | undefined) => {
    if (hint && !chosen.includes(hint) && chosen.length < 3) chosen.push(hint);
  };
  // Two hints for the main topic (specific ones first), one for the second topic.
  tags.forEach((slug, index) => {
    const hints = TOPICS[slug]?.hints ?? [];
    const specific = hints.filter((hint) => hint.when?.test(text));
    const general = hints.filter((hint) => !hint.when);
    const ordered = [...specific, ...general];
    const take = index === 0 ? 2 : 1;
    for (const hint of ordered.slice(0, take)) add(hint);
  });
  const errorHint = GENERIC_HINTS[0]!;
  if (errorHint.when!.test(text)) add(errorHint);
  if (!hasCode) add(GENERIC_HINTS[1]);
  add(GENERIC_HINTS[2]);
  add(GENERIC_HINTS[1]);
  return chosen.map((hint) => hint[locale]);
}

/** No-AI triage: tags (max 3 interest slugs), difficulty, first-sentence summary, 2–3 hints. */
export function heuristicTriage(input: TriageInput): TriageResult {
  const locale: Locale = input.locale === 'en' ? 'en' : 'fr';
  const text = normalizeText(`${input.title}\n${input.bodyMd}\n${input.code ?? ''}`);
  const tags = pickTags(detectTopics(input));
  return {
    tags,
    difficulty: guessDifficulty(text, input.code),
    summary: summarize(input.title, input.bodyMd),
    hints: pickHints(tags, text, locale, Boolean(input.code?.trim())),
    provider: 'heuristic',
    cached: false,
    degraded: true,
  };
}

export interface DraftSource {
  title: string;
  bodyMd: string;
  code?: string | null;
  language?: string | null;
  /** Interest slugs of the post. */
  tags: readonly string[];
  /** Labels to show for the tags, same order (falls back to the slugs). */
  tagLabels?: readonly string[];
  aiHints?: readonly string[];
}

/**
 * No-AI answer draft: names the likely cause area from the tags, lists what to check first
 * (the post's hints, or hints computed here) and asks for what is missing. Meant to be
 * edited by a human before posting.
 */
export function heuristicDraft(post: DraftSource, locale: Locale): DraftResult {
  const lang: Locale = locale === 'en' ? 'en' : 'fr';
  const text = normalizeText(`${post.title}\n${post.bodyMd}\n${post.code ?? ''}`);
  const tags = post.tags.length > 0 ? [...post.tags] : pickTags(detectTopics(post));
  const labels = (post.tagLabels && post.tagLabels.length === post.tags.length ? [...post.tagLabels] : tags).join(', ');
  const area = tags.map((slug) => TOPICS[slug]?.area[lang]).find(Boolean);
  const hints = post.aiHints && post.aiHints.length > 0 ? [...post.aiHints].slice(0, 3) : pickHints(tags, text, lang, Boolean(post.code?.trim()));
  const hasError = /error|erreur|exception|traceback|warning|fatal/.test(text);
  const hasCode = Boolean(post.code?.trim());
  const list = hints.map((hint, index) => `${index + 1}. ${hint}`).join('\n');

  const answerMd =
    lang === 'fr'
      ? [
          '**Piste de départ** (brouillon automatique, à vérifier et à compléter avant de publier)',
          '',
          area
            ? `D'après le titre et les sujets du problème${labels ? ` (${labels})` : ''}, la cause se situe probablement du côté de ${area}.`
            : "Je n'ai pas assez d'éléments pour désigner une cause précise, mais voici par où commencer.",
          '',
          'À vérifier en premier :',
          '',
          list,
          '',
          hasError && hasCode
            ? "Si rien de tout cela ne débloque la situation, dis-nous ce que donne chaque vérification : le résultat exact aide beaucoup à réduire les hypothèses."
            : `Pour aller plus loin, il manque ${[!hasError && "le message d'erreur exact", !hasCode && 'un extrait de code minimal qui reproduit le problème'].filter(Boolean).join(' et ')}.`,
        ].join('\n')
      : [
          '**Starting point** (automatic draft: check and complete it before posting)',
          '',
          area
            ? `From the title and topics of this problem${labels ? ` (${labels})` : ''}, the cause is most likely around ${area}.`
            : 'There is not enough to point at a precise cause, but here is where to start.',
          '',
          'Check first:',
          '',
          list,
          '',
          hasError && hasCode
            ? 'If none of this unblocks you, tell us what each check gives: the exact result helps a lot to narrow things down.'
            : `To go further, we are missing ${[!hasError && 'the exact error message', !hasCode && 'a minimal piece of code that reproduces the problem'].filter(Boolean).join(' and ')}.`,
        ].join('\n');

  return { answerMd, provider: 'heuristic', degraded: true };
}
