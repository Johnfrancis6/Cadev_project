"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

const people = {
  alex: {
    name: "Alex Morgan",
    handle: "alexmorgan",
    role: "Développeur full-stack",
    avatar: "alex",
    bio: "Des idées plein la tête, un terminal toujours ouvert. Je construis des outils utiles et je partage ce que j’apprends.",
    skills: ["TypeScript", "React", "Node.js"],
    followers: 128,
  },
  sarah: {
    name: "Sarah Chen",
    handle: "sarahbuilds",
    role: "Frontend developer",
    avatar: "sarah",
    verified: true,
    bio: "Je transforme le café en interfaces. Passionnée de JavaScript, d’accessibilité et des petites choses qui font une grande différence.",
    skills: ["JavaScript", "React", "CSS"],
    followers: 1240,
  },
  yann: {
    name: "Yann Kouamé",
    handle: "yanncodes",
    role: "Indie maker · Full-stack",
    avatar: "yann",
    bio: "Je construis Pollen en public. Des outils simples, un peu de design et beaucoup de curiosité. Basé à Abidjan.",
    skills: ["Next.js", "TypeScript", "Supabase"],
    followers: 842,
  },
  lea: {
    name: "Léa Martin",
    handle: "leamartin",
    role: "Design engineer",
    avatar: "lea",
    verified: true,
    bio: "À la croisée du design et du code. J’aime les interfaces qui se font oublier et les composants bien pensés.",
    skills: ["React", "Figma", "CSS"],
    followers: 2310,
  },
  amine: {
    name: "Amine Benali",
    handle: "aminebuilds",
    role: "Backend engineer",
    avatar: "amine",
    bio: "APIs, architecture et bases de données. Toujours partant pour parler des bons compromis et déboguer à plusieurs.",
    skills: ["Node.js", "PostgreSQL", "Docker"],
    followers: 963,
  },
  idrissa: {
    name: "Idrissa Ouédraogo",
    handle: "idrissadev",
    role: "Python developer",
    avatar: "idrissa",
    bio: "De Ouaga au monde, une ligne à la fois. Python, data et open source. J’apprends en construisant.",
    skills: ["Python", "FastAPI", "Data"],
    followers: 416,
  },
  julie: {
    name: "Julie Moreau",
    handle: "juliemakes",
    role: "Creative developer",
    avatar: "julie",
    bio: "Du code créatif, des animations et des projets qui donnent le sourire. Je partage mes expérimentations ici.",
    skills: ["Three.js", "JavaScript", "WebGL"],
    followers: 1840,
  },
};

const basePosts = [
  {
    id: "p1",
    author: "sarah",
    time: "24 min",
    type: "snippet",
    title: "Un groupBy en 5 lignes, une dépendance en moins.",
    body: '<p><strong>Petit rappel : tu n’as pas toujours besoin d’une librairie.</strong> ✨</p><p>Un <code class="inline-code">groupBy</code> en 5 lignes, et une dépendance en moins dans ton package.json.</p>',
    tags: ["javascript", "clean-code"],
    file: "groupBy.js",
    language: "JavaScript",
    code: "const groupBy = (items, key) =>\n  items.reduce((groups, item) => {\n    (groups[item[key]] ??= []).push(item);\n    return groups;\n  }, {});",
    likes: 48,
    reposts: 6,
  },
  {
    id: "p2",
    author: "yann",
    time: "1 h",
    type: "project",
    title: "Pollen — mes idées ont enfin un endroit où grandir.",
    body: "<p><strong>Après 3 mois de soirées et beaucoup (trop) de cafés… Pollen est en ligne. 🌱</strong></p><p>Un outil open source pour organiser ses side-projects sans se prendre la tête. J’aimerais beaucoup avoir vos retours !</p>",
    tags: ["build-in-public", "nextjs", "typescript"],
    project: "pollen",
    likes: 124,
    reposts: 18,
  },
  {
    id: "p3",
    author: "amine",
    time: "2 h",
    type: "question",
    title: "Vous gérez comment l’auth sur vos side-projects ?",
    body: "<p><strong>Vous gérez comment l’auth sur vos side-projects en ce moment ?</strong></p><p>Je cherche quelque chose de simple, sans être enfermé dans un écosystème. Better Auth, Auth.js, du fait maison ? Je prends vos retours d’expérience. 👀</p>",
    tags: ["typescript", "backend", "architecture"],
    likes: 32,
    reposts: 3,
  },
  {
    id: "p4",
    author: "lea",
    time: "3 h",
    type: "article",
    title: "Les React Server Components, sans le mal de tête.",
    body: "<p>J’ai passé le week-end à écrire le guide que j’aurais aimé avoir en découvrant les Server Components.</p><p>Pas de jargon inutile. Juste des exemples, et surtout le <strong>pourquoi</strong> derrière le <strong>comment</strong>.</p>",
    tags: ["react", "frontend", "nextjs"],
    article: true,
    likes: 86,
    reposts: 14,
  },
  {
    id: "p5",
    author: "idrissa",
    time: "4 h",
    type: "snippet",
    title: "Un petit décorateur Python pour gagner du temps.",
    body: "<p><strong>Mon petit compagnon de debug Python. 🐍</strong></p><p>Un décorateur tout simple pour mesurer le temps d’exécution d’une fonction. Parfois, les outils les plus utiles tiennent en quelques lignes.</p>",
    tags: ["python", "productivité"],
    file: "timer.py",
    language: "Python",
    code: 'from time import perf_counter\n\ndef timer(fn):\n    def wrapper(*args, **kwargs):\n        start = perf_counter()\n        result = fn(*args, **kwargs)\n        print(f"Terminé en {perf_counter() - start:.3f}s")\n        return result\n    return wrapper',
    likes: 67,
    reposts: 9,
  },
  {
    id: "p6",
    author: "julie",
    time: "5 h",
    type: "project",
    title: "Un jardin de code qui pousse avec tes contributions.",
    body: "<p><strong>Et si ton graphe de contributions devenait un petit jardin ? 🌷</strong></p><p>J’ai bricolé Codegarden : chaque commit fait pousser quelque chose. C’est inutile, donc absolument indispensable.</p>",
    tags: ["javascript", "open-source", "build-in-public"],
    project: "codegarden",
    likes: 152,
    reposts: 24,
  },
];

const projects = [
  {
    id: "pollen",
    name: "Pollen",
    tagline: "Un peu d’ordre pour tes grandes idées.",
    description:
      "Un espace de travail léger et open source pour faire grandir tes side-projects. Un tableau kanban, des notes et juste ce qu’il faut pour te concentrer sur ce qui compte.",
    author: "yann",
    image: "assets/pollen-preview.svg",
    tags: ["Next.js", "TypeScript", "Supabase"],
    category: "Productivité",
    stars: 248,
    forks: 32,
    license: "MIT",
    status: "Open source",
  },
  {
    id: "quiet",
    name: "Quiet Mode",
    tagline: "Un peu de calme dans tes outils de tous les jours.",
    description:
      "Un thème Raycast aux couleurs douces, pensé pour les longues sessions de développement. Moins de distractions visuelles, plus de concentration.",
    author: "lea",
    image: "assets/gradient-preview.svg",
    tags: ["Design", "Raycast", "JSON"],
    category: "Design",
    stars: 186,
    forks: 18,
    license: "MIT",
    status: "Open source",
  },
  {
    id: "api-insight",
    name: "API Insight",
    tagline: "Tes requêtes, enfin lisibles.",
    description:
      "Un petit client API dans le navigateur. Organise tes collections, inspecte les réponses et partage des exemples avec ton équipe, simplement.",
    author: "amine",
    cover: "api",
    tags: ["React", "TypeScript", "Vite"],
    category: "Dev tools",
    stars: 324,
    forks: 47,
    license: "Apache 2.0",
    status: "Open source",
  },
  {
    id: "codegarden",
    name: "Codegarden",
    tagline: "Ton code fait pousser des idées.",
    description:
      "Une visualisation ludique de tes contributions : chaque commit devient une pousse, chaque projet un petit écosystème. Un projet créatif pour redécouvrir le plaisir de construire.",
    author: "julie",
    cover: "garden",
    tags: ["Three.js", "JavaScript", "WebGL"],
    category: "Créatif",
    stars: 512,
    forks: 63,
    license: "MIT",
    status: "Open source",
  },
  {
    id: "pocket-python",
    name: "Pocket Python",
    tagline: "La boîte à outils qui tient dans ta poche.",
    description:
      "Une collection de petits scripts Python utiles au quotidien. Manipuler des fichiers, automatiser une tâche, analyser des données : moins de répétition, plus de création.",
    author: "idrissa",
    cover: "api",
    tags: ["Python", "CLI", "Open source"],
    category: "Dev tools",
    stars: 97,
    forks: 12,
    license: "MIT",
    status: "En construction",
  },
];

const demoComments = {
  p1: [
    {
      author: "amine",
      text: "Propre ! Et Object.groupBy() est maintenant natif pour les navigateurs récents 👀",
      time: "18 min",
    },
    {
      author: "sarah",
      text: "Exact ! Je garde cette version pour les projets qui ciblent encore des environnements plus anciens 🙂",
      time: "12 min",
    },
    {
      author: "lea",
      text: "Le genre de petit snippet qui mérite sa place dans les favoris. Merci !",
      time: "8 min",
    },
  ],
  p2: [
    {
      author: "sarah",
      text: "C’est super doux comme interface. J’aime beaucoup les petits détails 🌱",
      time: "45 min",
    },
    {
      author: "amine",
      text: "Bravo pour le lancement ! Une API publique est prévue ?",
      time: "38 min",
    },
    {
      author: "yann",
      text: "Merci ! Oui, c’est la prochaine étape. Je partagerai l’avancement ici.",
      time: "30 min",
    },
    {
      author: "julie",
      text: "Le nom, la palette, le produit… tout est cohérent. Bien joué !",
      time: "20 min",
    },
  ],
  p3: [
    {
      author: "yann",
      text: "Better Auth sur mon dernier projet. La doc est claire et je garde la main sur les données.",
      time: "1 h",
    },
    {
      author: "sarah",
      text: "Auth.js si tu es déjà sur Next. Le plus important : ne pas réinventer la sécurité 🙂",
      time: "45 min",
    },
  ],
  p4: [
    {
      author: "yann",
      text: "Enfin un exemple qui explique vraiment la frontière client / serveur. Merci !",
      time: "2 h",
    },
  ],
  p5: [
    {
      author: "amine",
      text: "Petit ajout : functools.wraps pour garder les métadonnées de la fonction !",
      time: "3 h",
    },
  ],
  p6: [
    {
      author: "lea",
      text: "Inutile ? Moi je trouve ça nécessaire 🌼",
      time: "4 h",
    },
    {
      author: "idrissa",
      text: "Mon prochain week-end vient de trouver son projet !",
      time: "3 h",
    },
  ],
};

const defaultState = {
  liked: [],
  saved: ["p2"],
  following: ["sarah", "lea"],
  starred: [],
  posts: [],
  customProjects: [],
  comments: {},
  profile: {
    name: "Alex Morgan",
    role: "Développeur full-stack",
    bio: people.alex.bio,
    skills: "TypeScript, React, Node.js",
  },
  joined: false,
  notificationRead: false,
  messages: {},
};
let savedState = {};
try {
  savedState = JSON.parse(localStorage.getItem("devloop.frontend.v1") || "{}");
} catch (_) {}
const state = {
  ...defaultState,
  ...savedState,
  profile: { ...defaultState.profile, ...(savedState.profile || {}) },
};
let view = "feed";
let feedTab = "for-you";
let communityFilter = "all";
let languageFilter = "all";
let projectFilter = "Tous";
let helpTab = "mentors";
let composeMode = "text";
let composeTags = ["javascript"];
let composeDraft = {
  text: "",
  code: "",
  title: "",
  url: "",
  language: "JavaScript",
};
let activeConversation = "sarah";
let lastFocusedElement = null;
const expandedComments = new Set();
const runOutputs = new Set();
let showAllPosts = false;

function persist() {
  try {
    localStorage.setItem("devloop.frontend.v1", JSON.stringify(state));
  } catch (_) {}
}
function allPosts() {
  return [...state.posts, ...basePosts];
}
function projectList() {
  return [...state.customProjects, ...projects];
}
function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
}
function getPost(id) {
  return allPosts().find((post) => post.id === id);
}
function getPerson(id) {
  return id === "alex"
    ? {
        ...people.alex,
        ...state.profile,
        skills: state.profile.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }
    : people[id] || people.alex;
}
function avatar(person, cls = "") {
  return `<img class="avatar ${cls}" src="assets/${getPerson(person).avatar}.jpg" alt="" loading="lazy">`;
}
function commentsFor(id) {
  return [...(demoComments[id] || []), ...(state.comments[id] || [])];
}
function toast(message, type = "check") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${icon(type)}<span>${esc(message)}</span>`;
  $("#toastStack").append(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  }, 3300);
}
function closeSidebar() {
  $("#sidebar").classList.remove("open");
  $("#mobileShade").classList.remove("visible");
  $(".mobile-menu").setAttribute("aria-expanded", "false");
}
function navigate(next, options = {}) {
  view = next;
  if (!options.keepFilter) {
    communityFilter = "all";
    languageFilter = "all";
  }
  showAllPosts = false;
  closeSidebar();
  closeNotifications();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function render() {
  const names = {
    feed: "Le fil",
    explore: "Explorer",
    projects: "Les projets",
    help: "Entraide",
    saved: "Mes favoris",
  };
  $("#breadcrumbCurrent").textContent = names[view];
  $$(".nav-link").forEach((el) => {
    el.classList.toggle("active", el.dataset.nav === view);
    el.setAttribute("aria-current", el.dataset.nav === view ? "page" : "false");
  });
  $$(".space-link").forEach((el) =>
    el.classList.toggle("selected", communityFilter === el.dataset.community),
  );
  $("#savedCount").textContent = state.saved.length;
  $("#accountName").textContent = state.profile.name;
  $("#notificationDot").hidden = state.notificationRead;
  const pages = {
    feed: feedPage,
    explore: explorePage,
    projects: projectsPage,
    help: helpPage,
    saved: savedPage,
  };
  $("#mainContent").innerHTML = (pages[view] || feedPage)();
}
function pageHeading(
  title,
  subtitle,
  action = "compose",
  label = "Créer un post",
) {
  return `<div class="page-heading"><div><h1>${title}<span class="greeting-dot">.</span></h1><p>${subtitle}</p></div><button class="button button-primary" data-action="${action}">${icon("plus")}<span>${label}</span></button></div>`;
}
function welcomeCard() {
  return `<section class="welcome-card" aria-label="Bienvenue sur devloop"><div class="welcome-copy"><div class="welcome-eyebrow">${icon("code")} BUILD. SHARE. REPEAT.</div><h2>Moins de bruit.<br><span>Plus de code.</span></h2><p>Partage ce que tu construis.<br>Rencontre ceux qui font avancer les choses.</p><button class="text-button" data-nav="explore">Explore la communauté ${icon("arrow")}</button></div><img class="welcome-art" src="assets/hero-art.svg" alt="Un cube de code entouré d’idées et de contributions"></section>`;
}
function composer() {
  return `<div class="composer">${avatar("alex")}<button class="composer-prompt" data-action="compose">Une idée, une découverte, un bug résolu ?</button><span class="composer-divider"></span><button class="composer-option" data-action="compose" data-mode="snippet" title="Partager du code">${icon("code")}<span>Code</span></button><button class="composer-option project" data-action="compose" data-mode="project" title="Partager un projet">${icon("layers")}<span>Projet</span></button></div>`;
}
function toolbar() {
  return `<div class="feed-toolbar"><div class="feed-tabs" role="tablist" aria-label="Trier le fil"><button class="feed-tab ${feedTab === "for-you" ? "active" : ""}" data-action="feed-tab" data-tab="for-you" role="tab" aria-selected="${feedTab === "for-you"}">${icon("bolt")}Pour toi</button><button class="feed-tab ${feedTab === "following" ? "active" : ""}" data-action="feed-tab" data-tab="following" role="tab" aria-selected="${feedTab === "following"}">Abonnements</button><button class="feed-tab ${feedTab === "trending" ? "active" : ""}" data-action="feed-tab" data-tab="trending" role="tab" aria-selected="${feedTab === "trending"}">À la une</button></div><label class="language-select" aria-label="Filtrer par langage">${icon("filter")}<select id="languageFilter" aria-label="Filtrer par langage"><option value="all" ${languageFilter === "all" ? "selected" : ""}>Tous les langages</option>${["JavaScript", "TypeScript", "React", "Python"].map((lang) => `<option value="${lang.toLowerCase()}" ${languageFilter === lang.toLowerCase() ? "selected" : ""}>${lang}</option>`).join("")}</select>${icon("chevron")}</label></div>`;
}
function filterNotice() {
  return communityFilter !== "all" || languageFilter !== "all"
    ? `<div class="filter-notice"><span>Dans la boucle <strong>#${esc(communityFilter !== "all" ? communityFilter : languageFilter)}</strong></span><button data-action="clear-filter">Tout afficher ${icon("close")}</button></div>`
    : "";
}
function filteredPosts() {
  let posts = allPosts();
  if (feedTab === "following")
    posts = posts.filter(
      (p) => state.following.includes(p.author) || p.author === "alex",
    );
  if (feedTab === "trending")
    posts = [...posts].sort((a, b) => b.likes - a.likes);
  if (communityFilter !== "all")
    posts = posts.filter((p) => p.tags.includes(communityFilter));
  if (languageFilter !== "all")
    posts = posts.filter(
      (p) =>
        p.tags.includes(languageFilter) ||
        (p.language || "").toLowerCase() === languageFilter,
    );
  return posts;
}
function feedPage() {
  const posts = filteredPosts();
  return `${pageHeading("Bienvenue dans la boucle", "De belles idées. Du code utile. Et les bonnes personnes.")}<div class="content-grid"><div class="feed-column">${welcomeCard()}${composer()}${toolbar()}${filterNotice()}<div class="feed-list">${
    posts.length
      ? posts
          .slice(0, showAllPosts ? 100 : 4)
          .map(renderPost)
          .join("")
      : emptyState(
          "compass",
          "Un fil qui te ressemble",
          feedTab === "following"
            ? "Suis quelques builders pour retrouver leurs idées et leurs projets ici."
            : "Pas encore de publication avec ce filtre. Une bonne occasion de lancer la discussion.",
          "explore",
          "Découvrir les builders",
        )
  }</div>${posts.length > 4 && !showAllPosts ? `<div class="load-more"><button class="button button-secondary" data-action="load-more">Encore un peu de code ${icon("chevron")}</button></div>` : posts.length ? `<div class="feed-end">${icon("check")}Tu es à jour. Et si tu construisais quelque chose ?</div>` : ""}</div>${rightRail()}</div>`;
}
function emptyState(symbol, title, text, nav, label) {
  return `<div class="empty-state">${icon(symbol)}<h2>${title}</h2><p>${text}</p><button class="button button-primary" data-nav="${nav}">${label} ${icon("arrow")}</button></div>`;
}
function highlightCode(code) {
  const pattern =
    /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|return|if|else|new|async|await|function|from|import|def|for|in|class|True|False|None)\b|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_$][\w$]*(?=\s*\())/g;
  return code
    .split("\n")
    .map((line) => {
      let result = "",
        last = 0;
      for (const match of line.matchAll(pattern)) {
        result += esc(line.slice(last, match.index));
        const word = match[0];
        let cls = "syntax-function";
        if (word.startsWith("//") || word.startsWith("#"))
          cls = "syntax-comment";
        else if (/^["'`]/.test(word)) cls = "syntax-string";
        else if (
          /^(const|let|var|return|if|else|new|async|await|function|from|import|def|for|in|class|True|False|None)$/.test(
            word,
          )
        )
          cls = "syntax-keyword";
        else if (/^\d/.test(word)) cls = "syntax-number";
        result += `<span class="${cls}">${esc(word)}</span>`;
        last = match.index + word.length;
      }
      return `<span class="code-line">${result + esc(line.slice(last)) || " "}</span>`;
    })
    .join("");
}
function codeBlock(post) {
  return `<div class="code-block"><div class="code-header"><span class="file-dot ${post.language === "Python" ? "python" : ""}">${post.language === "Python" ? "PY" : "JS"}</span><span>${esc(post.file || "snippet.js")}</span><span class="code-language">${esc(post.language || "JavaScript")}</span><button class="icon-btn" data-action="copy-code" data-id="${post.id}" aria-label="Copier le code">${icon("copy")}</button></div><pre><code>${highlightCode(post.code)}</code></pre><div class="code-run-bar"><span>${post.language === "Python" ? "Un petit script, de grandes économies de temps." : "Moins de dépendances, plus de simplicité."}</span>${post.id === "p1" || post.id === "p5" ? `<button class="run-button" data-action="run-code" data-id="${post.id}">${icon("play")}${runOutputs.has(post.id) ? "Masquer le résultat" : post.language === "Python" ? "Voir la sortie" : "Tester l’exemple"}</button>` : "<span>À partager sans modération.</span>"}</div>${
    runOutputs.has(post.id)
      ? `<div class="code-output"><div class="code-output-label">${post.id === "p1" ? "RÉSULTAT · EXEMPLE JAVASCRIPT" : "EXEMPLE DE SORTIE · PYTHON"}</div>${
          post.id === "p1"
            ? esc(
                JSON.stringify(
                  [
                    { name: "Sarah", role: "frontend" },
                    { name: "Léa", role: "frontend" },
                    { name: "Amine", role: "backend" },
                  ].reduce((groups, item) => {
                    (groups[item.role] ??= []).push(item);
                    return groups;
                  }, {}),
                  null,
                  2,
                ),
              ).replace(/\n/g, "<br>")
            : 'Terminé en 0.024s<br><span class="muted">Le code Python est présenté en lecture seule dans ce prototype.</span>'
        }</div>`
      : ""
  }</div>`;
}
function renderPost(post) {
  const author = getPerson(post.author);
  const liked = state.liked.includes(post.id);
  const saved = state.saved.includes(post.id);
  const types = {
    snippet: ["code", "Snippet"],
    project: ["layers", "Projet"],
    question: ["help", "Question"],
    article: ["terminal", "Article"],
    text: ["message", "Discussion"],
  };
  const type = types[post.type] || types.text;
  let attachment = "";
  if (post.code) attachment = codeBlock(post);
  if (post.project) {
    const project = projectList().find((p) => p.id === post.project);
    if (project)
      attachment = `<button class="post-project-preview" data-action="project" data-id="${project.id}">${project.image ? `<img src="${project.image}" alt="Aperçu de ${esc(project.name)}" loading="lazy">` : coverMarkup(project)}<div class="project-preview-caption"><strong>${esc(project.name)} — ${esc(project.tagline)}</strong><span>Découvrir le projet</span>${icon("arrow-up-right")}</div></button>`;
  }
  if (post.article)
    attachment = `<button class="article-preview" data-action="article"><span class="react-illustration"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="50" cy="50" rx="43" ry="16"/><ellipse cx="50" cy="50" rx="43" ry="16" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="43" ry="16" transform="rotate(120 50 50)"/><circle cx="50" cy="50" r="5" fill="currentColor" stroke="none"/></svg></span><div><h3>Les Server Components,<br>sans le mal de tête.</h3><p>Un guide par Léa Martin · 6 min de lecture</p></div></button>`;
  if (post.projectTitle)
    attachment = `<div class="article-preview"><span class="react-illustration">${icon("layers")}</span><div><h3>${esc(post.projectTitle)}</h3><p>${post.projectUrl ? esc(post.projectUrl) : "Un nouveau projet de la communauté"}</p></div></div>`;
  return `<article class="post-card" id="post-${post.id}" data-post="${post.id}"><header class="post-header"><button class="post-author-button" data-action="profile" data-person="${post.author}">${avatar(post.author)}<span class="post-author"><span class="author-name">${esc(author.name)}${author.verified ? `<span class="verified" aria-label="Profil vérifié">${icon("check")}</span>` : ""}</span><span class="author-meta">${esc(author.role)}<span class="meta-dot">·</span>${post.time === "À l’instant" ? "À l’instant" : `il y a ${post.time}`}</span></span></button><span class="post-type type-${post.type}">${icon(type[0])}${type[1]}</span><button class="icon-btn post-more" data-action="post-options" data-id="${post.id}" aria-label="Options de la publication">${icon("more")}</button></header><div class="post-body">${post.isUser ? esc(post.text).replace(/\n/g, "<br>") : post.body}</div><div class="post-tags">${post.tags.map((tag) => `<button class="post-tag" data-community="${esc(tag)}">#${esc(tag)}</button>`).join("")}</div>${attachment}<footer class="post-actions"><button class="post-action ${liked ? "liked" : ""}" data-action="like" data-id="${post.id}" aria-label="${liked ? "Ne plus aimer" : "Aimer"}" aria-pressed="${liked}">${icon("heart")}<span>${post.likes + (liked ? 1 : 0)}</span></button><button class="post-action" data-action="comments" data-id="${post.id}" aria-label="Afficher les commentaires">${icon("comment")}<span>${commentsFor(post.id).length}</span></button><button class="post-action" data-action="repost" data-id="${post.id}" aria-label="Repartager cette publication">${icon("repeat")}<span>${post.reposts || 0}</span></button><span class="post-actions-spacer"></span><button class="post-action bookmark-action ${saved ? "saved" : ""}" data-action="save" data-id="${post.id}" aria-label="${saved ? "Retirer des favoris" : "Enregistrer"}" aria-pressed="${saved}">${icon("bookmark")}</button><button class="post-action share-action" data-action="share" data-id="${post.id}" aria-label="Partager le lien">${icon("share")}</button></footer>${expandedComments.has(post.id) ? renderComments(post.id) : ""}</article>`;
}
function renderComments(id) {
  return `<section class="comments-section" aria-label="Commentaires">${commentsFor(
    id,
  )
    .map(
      (comment) =>
        `<div class="comment-row">${avatar(comment.author)}<div class="comment-content"><strong>${esc(getPerson(comment.author).name)}</strong><span class="comment-time">${esc(comment.time || "À l’instant")}</span><p>${esc(comment.text)}</p></div></div>`,
    )
    .join(
      "",
    )}<form class="comment-form" data-form="comment" data-id="${id}">${avatar("alex")}<div class="comment-input-wrap"><input name="comment" placeholder="Faire avancer la discussion…" aria-label="Écrire un commentaire" required maxlength="1000" autocomplete="off"><button type="submit" class="icon-btn" aria-label="Envoyer le commentaire">${icon("send")}</button></div></form></section>`;
}
function rightRail() {
  return `<aside class="right-column" aria-label="La communauté en bref"><section class="community-pulse"><div class="section-eyebrow"><span class="online-indicator"></span>LA BOUCLE EST BIEN VIVANTE</div><h2>Des gens. Pas des algorithmes.</h2><div class="pulse-stats"><div class="pulse-stat"><strong>2 480<span>↗</span></strong><p>builders passionnés</p></div><div class="pulse-stat"><strong>128<span>•</span></strong><p>en train de construire</p></div></div><div class="pulse-members"><div class="avatar-stack">${avatar("lea")}${avatar("yann")}${avatar("sarah")}${avatar("amine")}</div><span>Ton prochain binôme<br><strong>est peut-être déjà ici.</strong></span></div></section><section class="rail-section"><div class="rail-section-heading"><h2>${icon("trend")}Dans les discussions</h2>${icon("arrow-up-right")}</div><div class="trending-list">${[
    [
      "typescript",
      "1,2 k discussions",
      "+24%",
      "4,16 10,12 16,14 22,6 29,9 37,2",
    ],
    [
      "build-in-public",
      "846 discussions",
      "+18%",
      "4,16 10,14 17,15 23,9 29,10 37,4",
    ],
    ["react", "624 discussions", "+12%", "4,17 10,14 16,14 22,10 28,12 37,7"],
    [
      "open-source",
      "412 discussions",
      "+9%",
      "4,16 11,15 17,11 23,13 30,9 37,5",
    ],
  ]
    .map(
      (tag, i) =>
        `<button class="trend-item" data-community="${tag[0]}"><span class="trend-number">0${i + 1}</span><span class="trend-copy"><strong>#${tag[0]}</strong><p>${tag[1]}</p></span><svg class="trend-chart" viewBox="0 0 42 20"><polyline points="${tag[3]}"/></svg><span class="trend-growth">${tag[2]}</span></button>`,
    )
    .join(
      "",
    )}</div></section><section class="rail-section people-section"><div class="rail-section-heading"><h2>De belles rencontres à faire</h2><button class="text-button" data-action="builders">Tout voir ${icon("arrow")}</button></div>${["amine", "julie", "yann"].map(suggestedPerson).join("")}</section><section class="pair-card"><div class="section-eyebrow">${icon("users")}PAIR PROGRAMMING</div><h2>À deux, le bug<br>semble moins grand.</h2><p>Un regard neuf, un coup de main.<br>Le prochain déclic, c’est peut-être l’autre.</p><div class="pair-card-footer"><div class="avatar-stack">${avatar("sarah")}${avatar("amine")}${avatar("idrissa")}</div><span>8 devs disponibles pour aider</span></div><button class="text-button" data-nav="help">Trouver mon binôme ${icon("arrow-up-right")}</button></section><footer class="rail-footer"><button data-action="about">À propos</button><button data-action="guidelines">La charte</button><button data-action="about">Le projet</button><p>© 2026 devloop · construit ensemble.</p></footer></aside>`;
}
function suggestedPerson(id) {
  const person = getPerson(id),
    followed = state.following.includes(id);
  return `<div class="suggested-person"><button class="person-button" data-action="profile" data-person="${id}">${avatar(id)}<span class="person-info"><strong>${esc(person.name)}</strong><span>${esc(person.role)}</span></span></button><button class="follow-button ${followed ? "following" : ""}" data-action="follow" data-person="${id}" aria-label="${followed ? "Ne plus suivre" : "Suivre"} ${esc(person.name)}" aria-pressed="${followed}">${icon(followed ? "check" : "plus")}</button></div>`;
}
function explorePage() {
  return `${pageHeading("La curiosité fait bien les choses", "Une nouvelle stack, une bonne idée, une rencontre. Suis le fil.")}<div class="content-grid"><div class="feed-column"><section class="discovery-banner"><div><div class="section-eyebrow">LA COMMUNAUTÉ, SANS LES FRONTIÈRES</div><h2 style="margin-top:12px">Trouve ta petite communauté.</h2><p>Des gens qui parlent le même langage. Littéralement.</p></div>${icon("compass")}</section><div class="topics-grid">${[
    ["javascript", "JS", "yellow", "842 builders"],
    ["typescript", "TS", "blue", "1 240 builders"],
    ["react", "⚛", "blue", "964 builders"],
    ["python", "Py", "green", "716 builders"],
    ["build-in-public", "↗", "purple", "1 486 builders"],
    ["open-source", "{ }", "yellow", "2 104 builders"],
  ]
    .map(
      ([tag, label, color, count]) =>
        `<button class="topic-card" data-community="${tag}"><span class="topic-icon ${color}">${label}</span><strong>#${tag}</strong><small>${count} ${icon("arrow-up-right")}</small></button>`,
    )
    .join(
      "",
    )}</div><div class="section-title-row"><h2>Ce qui fait parler la boucle</h2><span>Le meilleur de la communauté</span></div><div class="feed-list">${[
    ...basePosts,
  ]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3)
    .map(renderPost)
    .join("")}</div></div>${rightRail()}</div>`;
}
function coverMarkup(project) {
  if (project.image)
    return `<img class="project-cover" src="${project.image}" alt="Aperçu de ${esc(project.name)}" loading="lazy">`;
  if (project.cover === "community")
    return `<div class="garden-cover community-project-cover"><strong>${esc(project.name)}</strong><span>↗</span></div>`;
  if (project.cover === "garden")
    return `<div class="garden-cover"><strong>codegarden.</strong><span>✳</span></div>`;
  return `<div class="api-cover"><span class="mini-label">${project.id === "pocket-python" ? "POCKET PYTHON · CLI" : "API INSIGHT · DEVELOPER TOOLS"}</span><div class="mini-terminal"><span>● ● ● &nbsp; ${project.id === "pocket-python" ? "terminal" : "api-insight"}</span><p>${project.id === "pocket-python" ? "$ python make_it_simple.py<br>✓ Fichiers organisés<br>✓ Temps libre retrouvé" : 'GET &nbsp; /v1/something-great<br><span style="color:#79b898">200 OK &nbsp; • &nbsp; 124 ms</span><br>{ "status": "ready to build" }'}</p></div></div>`;
}
function projectCard(project) {
  const starred = state.starred.includes(project.id);
  return `<article class="project-card"><button class="project-cover-button" data-action="project" data-id="${project.id}" aria-label="Découvrir ${esc(project.name)}">${coverMarkup(project)}</button><div class="project-card-body"><div class="project-card-heading"><h2><button data-action="project" data-id="${project.id}" style="padding:0;text-align:left">${esc(project.name)}</button></h2><span class="pill">${esc(project.status)}</span></div><p>${esc(project.tagline)}</p><div class="project-technologies">${project.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div><footer class="project-card-footer"><button data-action="profile" data-person="${project.author}" style="padding:0">${avatar(project.author)}</button><span>${esc(getPerson(project.author).name.split(" ")[0])}</span><button class="project-star ${starred ? "starred" : ""}" data-action="star-project" data-id="${project.id}" aria-label="Ajouter une étoile à ${esc(project.name)}" aria-pressed="${starred}">${icon("star")}<span>${project.stars + (starred ? 1 : 0)}</span></button></footer></div></article>`;
}
function projectsPage() {
  const filtered =
    projectFilter === "Tous"
      ? projectList()
      : projectList().filter((p) => p.category === projectFilter);
  return `${pageHeading("Des idées qui prennent vie", "Petits outils, grandes ambitions. Découvre ce que la communauté construit.", "share-project", "Partager mon projet")}<div class="filter-chips">${["Tous", "Productivité", "Dev tools", "Design", "Créatif"].map((category) => `<button class="filter-chip ${projectFilter === category ? "active" : ""}" data-action="project-filter" data-filter="${category}">${category === "Tous" ? icon("layers") : ""}${category}</button>`).join("")}</div><div class="projects-grid">${filtered.map(projectCard).join("")}</div>${challengeBanner()}`;
}
function challengeBanner() {
  return `<section class="weekly-challenge"><div class="challenge-symbol">${icon("rocket")}</div><div><div class="section-eyebrow">LE CHALLENGE DU WEEK-END</div><h2>Une petite idée. Un vrai lancement.</h2><p>48 heures pour créer un outil qui simplifie la vie d’un développeur.</p></div><button class="button button-secondary" data-action="challenge">${state.joined ? "Mon challenge" : "Je relève le défi"} ${icon("arrow-up-right")}</button></section>`;
}
function helpPage() {
  return `${pageHeading("Un problème partagé, à moitié résolu", "Ici, poser une question est déjà une bonne contribution.", "ask-question", "Poser une question")}<div class="help-intro"><p>Un bug tenace, un choix d’architecture ou simplement l’envie d’apprendre ensemble. Il y a toujours quelqu’un dans la boucle.</p><span class="pill"><span class="online-indicator"></span>8 devs disponibles</span></div><div class="filter-chips"><button class="filter-chip ${helpTab === "mentors" ? "active" : ""}" data-action="help-tab" data-tab="mentors">${icon("users")}Trouver un binôme</button><button class="filter-chip ${helpTab === "questions" ? "active" : ""}" data-action="help-tab" data-tab="questions">${icon("help")}Les questions</button></div>${
    helpTab === "questions"
      ? `<div class="content-grid"><div class="feed-list">${allPosts()
          .filter((p) => p.type === "question")
          .map(renderPost)
          .join("")}</div>${rightRail()}</div>`
      : `<div class="mentor-grid">${["sarah", "amine", "lea", "idrissa", "julie", "yann"].map(mentorCard).join("")}</div>`
  }${challengeBanner()}`;
}
function mentorCard(id) {
  const person = getPerson(id);
  const intros = {
    sarah:
      "Un problème de CSS ou un composant React qui ne coopère pas ? On regarde ça ensemble.",
    amine:
      "Auth, architecture ou requête SQL un peu trop lente : je peux t’aider à y voir plus clair.",
    lea: "Un regard neuf sur ton interface, ton design system ou l’accessibilité de ton projet.",
    idrissa:
      "Python, une première API ou un script qui te résiste ? On débloque ça tranquillement.",
    julie:
      "Envie d’ajouter de la vie à ton projet ? Parlons animations, Three.js et code créatif.",
    yann: "Du prototype au lancement : je partage volontiers ce que j’apprends en construisant.",
  };
  return `<article class="mentor-card"><div class="mentor-top">${avatar(id)}<span class="pill"><span class="online-indicator"></span>Disponible</span></div><h2>${person.name}</h2><p class="mentor-role">${person.role}</p><p>${intros[id]}</p><div class="project-technologies">${person.skills.map((skill) => `<span>${skill}</span>`).join("")}</div><button class="button button-secondary" data-action="pair" data-person="${id}">${icon("message")}Proposer un échange</button><span class="mentor-availability">${icon("clock")}Un coup de main de 30 minutes</span></article>`;
}
function savedPage() {
  const posts = allPosts().filter((post) => state.saved.includes(post.id));
  return `${pageHeading("Les idées à garder sous le coude", `${posts.length} publication${posts.length > 1 ? "s" : ""} de côté, pour ton prochain déclic.`)}<div class="content-grid"><div class="feed-column"><div class="feed-list">${posts.length ? posts.map(renderPost).join("") : emptyState("bookmark", "Les bonnes idées méritent de rester", "Enregistre les snippets, projets et discussions qui t’inspirent. Tu les retrouveras tous ici.", "feed", "Retourner dans la boucle")}</div></div>${rightRail()}</div>`;
}

// The prototype is entirely client-side. Personal actions are saved locally when storage is available.
function updatePost(id) {
  const post = getPost(id);
  if (!post) return;
  $$(`[data-post="${id}"]`).forEach((card) => {
    const holder = document.createElement("div");
    holder.innerHTML = renderPost(post);
    card.replaceWith(holder.firstElementChild);
  });
}
function toggleIn(array, value) {
  const index = array.indexOf(value);
  if (index > -1) {
    array.splice(index, 1);
    return false;
  }
  array.push(value);
  return true;
}
function toggleLike(id) {
  toggleIn(state.liked, id);
  persist();
  updatePost(id);
}
function toggleSave(id) {
  const saved = toggleIn(state.saved, id);
  persist();
  $("#savedCount").textContent = state.saved.length;
  if (view === "saved" && !saved) render();
  else updatePost(id);
  toast(
    saved
      ? "Une bonne idée de plus dans tes favoris."
      : "Publication retirée de tes favoris.",
    "bookmark",
  );
}
function toggleFollow(id) {
  const followed = toggleIn(state.following, id);
  persist();
  $$(`[data-action="follow"][data-person="${id}"]`).forEach((button) => {
    if (button.classList.contains("follow-button")) {
      button.classList.toggle("following", followed);
      button.innerHTML = icon(followed ? "check" : "plus");
    } else
      button.innerHTML = `${icon(followed ? "check" : "plus")}${followed ? "Abonné·e" : "Suivre"}`;
    button.setAttribute("aria-pressed", followed);
    button.setAttribute(
      "aria-label",
      `${followed ? "Ne plus suivre" : "Suivre"} ${getPerson(id).name}`,
    );
  });
  toast(
    followed
      ? `${getPerson(id).name.split(" ")[0]} fait maintenant partie de ta boucle.`
      : `Tu ne suis plus ${getPerson(id).name.split(" ")[0]}.`,
  );
}
async function copyText(text, message) {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (_) {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.cssText = "position:fixed;opacity:0;left:-9999px";
    document.body.append(field);
    field.select();
    try {
      copied = document.execCommand("copy");
    } catch (_) {}
    field.remove();
  }
  if (copied) toast(message, "copy");
  else
    openModal(
      "À copier et partager",
      `<textarea class="form-field compose-code" readonly>${esc(text)}</textarea><p class="form-hint">Sélectionne le texte pour le copier. Ton navigateur limite l’accès au presse-papiers.</p>`,
    );
}

function openModal(title, body, footer = "", extraClass = "") {
  closeNotifications();
  if (!$("#overlayRoot").firstElementChild)
    lastFocusedElement = document.activeElement;
  $("#overlayRoot").innerHTML =
    `<div class="modal-backdrop" data-backdrop><section class="modal ${extraClass}" role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabindex="-1"><header class="modal-header"><h2 id="modalTitle">${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Fermer">${icon("close")}</button></header>${body ? `<div class="modal-content">${body}</div>` : ""}${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}</section></div>`;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const focusable =
      $(".modal [autofocus]") ||
      $(".modal textarea") ||
      $(".modal input") ||
      $(".modal");
    focusable?.focus();
  });
}
function closeModal() {
  $("#overlayRoot").innerHTML = "";
  document.body.style.overflow = "";
  if (lastFocusedElement?.isConnected)
    lastFocusedElement.focus({ preventScroll: true });
  lastFocusedElement = null;
}
function openCompose(mode = "text", preserve = false) {
  if (!preserve) {
    composeDraft = {
      text: "",
      code: "",
      title: "",
      url: "",
      language: "JavaScript",
    };
    composeTags = [
      mode === "project"
        ? "build-in-public"
        : mode === "question"
          ? "architecture"
          : "javascript",
    ];
  }
  composeMode = mode;
  const codeFields =
    mode === "snippet"
      ? `<div class="form-row"><div class="form-group"><label class="form-label" for="composeLanguage">Langage</label><select class="form-field" id="composeLanguage" name="language"><option>JavaScript</option><option ${composeDraft.language === "TypeScript" ? "selected" : ""}>TypeScript</option><option ${composeDraft.language === "Python" ? "selected" : ""}>Python</option><option ${composeDraft.language === "CSS" ? "selected" : ""}>CSS</option></select></div><div class="form-group"><label class="form-label" for="composeFile">Nom du fichier</label><input class="form-field" id="composeFile" name="filename" value="${composeDraft.language === "Python" ? "snippet.py" : "snippet.js"}" maxlength="80"></div></div><div class="form-group"><label class="form-label" for="composeCode">Ton code</label><textarea id="composeCode" class="form-field compose-code" name="code" placeholder="// Le petit bout de code qui fait la différence" spellcheck="false" maxlength="12000">${esc(composeDraft.code)}</textarea></div>`
      : mode === "project"
        ? `<div class="form-row"><div class="form-group"><label class="form-label" for="projectTitle">Nom du projet</label><input class="form-field" id="projectTitle" name="title" placeholder="La prochaine bonne idée" value="${esc(composeDraft.title)}" maxlength="80"></div><div class="form-group"><label class="form-label" for="projectUrl">Lien du projet (facultatif)</label><input class="form-field" id="projectUrl" name="url" placeholder="https://mon-projet.dev" type="url" value="${esc(composeDraft.url)}"></div></div>`
        : "";
  openModal(
    "À toi de faire avancer la boucle",
    `<form id="composeForm" data-form="compose"><div class="compose-author">${avatar("alex")}<div><strong>${esc(state.profile.name)}</strong><span>${icon("globe")}Visible par la communauté</span></div></div><div class="compose-tabs">${[
      ["text", "message", "Discussion"],
      ["snippet", "code", "Snippet"],
      ["project", "layers", "Projet"],
      ["question", "help", "Question"],
    ]
      .map(
        ([value, symbol, label]) =>
          `<button type="button" class="compose-tab ${mode === value ? "active" : ""}" data-action="compose-mode" data-mode="${value}">${icon(symbol)}${label}</button>`,
      )
      .join(
        "",
      )}</div><textarea class="form-field compose-textarea" name="text" id="composeText" maxlength="2500" placeholder="${mode === "question" ? "Qu’est-ce qui te bloque ? Donne-nous un peu de contexte…" : mode === "project" ? "Raconte-nous ce que tu construis, et pourquoi…" : "Une découverte, un apprentissage, une idée qui mérite de sortir du terminal…"}" autofocus required>${esc(composeDraft.text)}</textarea><div class="compose-char-count"><span id="charCount">${composeDraft.text.length}</span> / 2 500</div>${codeFields}<label class="form-label">Ajoute ta publication à une communauté</label><div class="compose-tags">${["javascript", "typescript", "react", "python", "build-in-public", "open-source", "architecture"].map((tag) => `<button type="button" class="compose-tag ${composeTags.includes(tag) ? "selected" : ""}" data-action="compose-tag" data-tag="${tag}">#${tag}</button>`).join("")}</div></form>`,
    `<span class="footnote">${icon("globe")}Une idée utile vaut mieux qu’un post parfait.</span><button class="button button-primary" id="publishButton" type="submit" form="composeForm" ${!composeDraft.text.trim() ? "disabled" : ""}>Publier ${icon("arrow")}</button>`,
  );
}
function captureComposeDraft() {
  const form = $("#composeForm");
  if (!form) return;
  composeDraft.text = form.elements.text.value;
  if (form.elements.code) composeDraft.code = form.elements.code.value;
  if (form.elements.title) composeDraft.title = form.elements.title.value;
  if (form.elements.url) composeDraft.url = form.elements.url.value;
  if (form.elements.language)
    composeDraft.language = form.elements.language.value;
}
function publish(form) {
  const values = new FormData(form);
  const text = String(values.get("text") || "").trim();
  if (!text) return;
  if (composeMode === "snippet" && !String(values.get("code") || "").trim()) {
    $("#composeCode").focus();
    toast("Ajoute ton snippet avant de le partager.", "code");
    return;
  }
  if (composeMode === "project" && !String(values.get("title") || "").trim()) {
    $("#projectTitle").focus();
    toast("Ton projet mérite un nom.", "layers");
    return;
  }
  const post = {
    id: `u${Date.now()}`,
    author: "alex",
    time: "À l’instant",
    type: composeMode,
    title: text.slice(0, 90),
    text,
    isUser: true,
    tags: [...composeTags],
    likes: 0,
    reposts: 0,
  };
  if (composeMode === "snippet") {
    post.code = String(values.get("code"));
    post.language = String(values.get("language"));
    post.file = String(values.get("filename") || "snippet.js");
  }
  if (composeMode === "project") {
    const url = String(values.get("url") || "").trim();
    if (url && !safeWebUrl(url)) {
      $("#projectUrl").focus();
      toast("Ajoute un lien qui commence par https:// ou http://.", "globe");
      return;
    }
    const project = {
      id: `project${Date.now()}`,
      name: String(values.get("title")).trim(),
      tagline: text.length > 110 ? `${text.slice(0, 107)}…` : text,
      description: text,
      author: "alex",
      cover: "community",
      tags: [...composeTags],
      category: "Productivité",
      stars: 0,
      forks: 0,
      license: "À préciser",
      status: "En construction",
      isCustom: true,
      url: safeWebUrl(url),
      postId: post.id,
    };
    state.customProjects.unshift(project);
    post.project = project.id;
  }
  state.posts.unshift(post);
  persist();
  closeModal();
  feedTab = "for-you";
  navigate("feed");
  setTimeout(() => {
    const card = $(`#post-${post.id}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.classList.add("highlight");
    setTimeout(() => card?.classList.remove("highlight"), 2000);
  }, 70);
  toast("C’est partagé. Bienvenue dans la conversation !");
}
function openProfile(id = "alex") {
  const person = getPerson(id),
    own = id === "alex",
    followed = state.following.includes(id);
  openModal(
    own ? "Ton petit coin de la boucle" : "Dans la boucle",
    `<div class="profile-cover">${icon("code")}</div><div class="profile-body">${avatar(id, "profile-avatar")}<div class="profile-name-row"><div><h3>${esc(person.name)}</h3><p class="profile-handle">@${person.handle}</p></div>${own ? `<button class="button button-secondary button-small" data-action="edit-profile">${icon("settings")}Modifier</button>` : `<button class="button ${followed ? "button-secondary" : "button-primary"} button-small" data-action="follow" data-person="${id}" aria-pressed="${followed}">${icon(followed ? "check" : "plus")}${followed ? "Abonné·e" : "Suivre"}</button>`}</div><p class="profile-bio">${esc(person.bio)}</p><div class="profile-stats"><div><strong>${own ? state.posts.length : allPosts().filter((p) => p.author === id).length}</strong><span>publications</span></div><div><strong>${person.followers.toLocaleString("fr-FR")}</strong><span>dans sa boucle</span></div><div><strong>${own ? state.following.length : 82}</strong><span>abonnements</span></div></div><div class="profile-section-title">SES OUTILS POUR CONSTRUIRE</div><div class="profile-stack">${person.skills.map((skill) => `<span>${esc(skill)}</span>`).join("")}</div></div>`,
    own
      ? `<span class="footnote">Ton profil est enregistré dans ce navigateur.</span><button class="button button-secondary button-small" data-action="close-modal">Retour dans la boucle</button>`
      : `<button class="button button-secondary" data-action="pair" data-person="${id}">${icon("message")}Engager la conversation</button>`,
    "profile-modal",
  );
  const content = $(".profile-modal>.modal-content");
  if (content) content.style.padding = "0";
}
function editProfile() {
  openModal(
    "Un profil qui te ressemble",
    `<form id="profileForm" data-form="profile"><div class="compose-author">${avatar("alex")}<div><strong>Les bonnes rencontres commencent ici.</strong><span>Quelques mots suffisent.</span></div></div><div class="form-row"><div class="form-group"><label class="form-label" for="profileName">Ton nom</label><input id="profileName" class="form-field" name="name" value="${esc(state.profile.name)}" required maxlength="40"></div><div class="form-group"><label class="form-label" for="profileRole">Ce que tu fais</label><input id="profileRole" class="form-field" name="role" value="${esc(state.profile.role)}" required maxlength="50"></div></div><div class="form-group"><label class="form-label" for="profileBio">Quelques mots sur toi</label><textarea class="form-field" id="profileBio" name="bio" rows="4" maxlength="400">${esc(state.profile.bio)}</textarea></div><div class="form-group"><label class="form-label" for="profileSkills">Ta stack</label><input class="form-field" id="profileSkills" name="skills" value="${esc(state.profile.skills)}" maxlength="120"><p class="form-hint">Sépare tes outils par une virgule.</p></div></form>`,
    `<button class="button button-secondary" data-action="my-profile">Annuler</button><button class="button button-primary" type="submit" form="profileForm">Enregistrer ${icon("check")}</button>`,
  );
}
function openProject(id) {
  const project = projectList().find((p) => p.id === id);
  if (!project) return;
  openModal(
    project.name,
    `${project.image ? `<img class="project-modal-image" src="${project.image}" alt="Aperçu de ${esc(project.name)}">` : coverMarkup(project)}<div class="project-modal-info"><div class="project-modal-top">${avatar(project.author)}<span>Un projet de ${esc(getPerson(project.author).name)}</span><span class="pill">${esc(project.status)}</span></div><h3>${esc(project.tagline)}</h3><p>${esc(project.description)}</p><div class="project-technologies">${project.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div><div class="project-modal-meta"><span>${icon("star")}${project.stars} étoiles</span><span>${icon("branch")}${project.forks} forks</span><span>${icon("github")}Licence ${esc(project.license)}</span></div><div class="project-modal-buttons">${project.isCustom ? (project.url ? `<a class="button button-primary" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">${icon("globe")}Visiter le projet ${icon("arrow-up-right")}</a>` : `<button class="button button-primary" data-action="open-post" data-id="${project.postId}">${icon("comment")}Voir la discussion</button>`) : `<button class="button button-primary" data-action="project-demo" data-id="${id}">${icon("play")}Essayer la démo</button>`}<button class="button button-secondary" data-action="star-project" data-id="${id}">${icon("star")}${state.starred.includes(id) ? "Étoile ajoutée" : "Soutenir le projet"}</button><button class="button button-secondary" data-action="${project.author === "alex" ? "my-profile" : "pair"}" data-person="${project.author}" aria-label="${project.author === "alex" ? "Voir mon profil" : "Contacter le créateur"}">${icon("message")}</button></div></div>`,
    "",
    "modal-project project-detail",
  );
}
function openProjectDemo(id) {
  const project = projectList().find((p) => p.id === id);
  if (id === "pollen") {
    openModal(
      "Pollen · un petit espace pour tes idées",
      `<p class="modal-lead">Les projets avancent une petite tâche à la fois. Clique sur une carte pour la faire passer à l’étape suivante.</p><div class="demo-board"><div class="demo-column" data-stage="0"><h3>À FAIRE</h3><button class="demo-task" data-action="move-task">Une belle landing page<small>Design · À ton rythme</small></button><button class="demo-task" data-action="move-task">Écrire la documentation<small>Un peu de clarté</small></button></div><div class="demo-column" data-stage="1"><h3>EN COURS</h3><button class="demo-task" data-action="move-task">Partager mon projet<small>Build in public</small></button></div><div class="demo-column" data-stage="2"><h3>TERMINÉ</h3><button class="demo-task" data-action="move-task">Dire hello à la boucle 🌱<small>Un premier pas</small></button></div></div><p class="demo-note">Aperçu interactif intégré à devloop. Les cartes de cette démo ne sont pas sauvegardées.</p>`,
      `<button class="button button-secondary" data-action="project" data-id="pollen">${icon("arrow")}Retour au projet</button>`,
      "modal-project",
    );
  } else if (id === "quiet") {
    openModal(
      "Quiet Mode · choisis ton ambiance",
      `<p class="modal-lead">Un thème qui donne envie d’ouvrir son terminal. Essaie une palette.</p><div id="quietPreview" style="background:#302938;border:1px solid #665771;border-radius:10px;padding:26px;transition:background .3s"><p class="mono" style="color:#cbb7ec;font-size:13px;line-height:2">$ focus --on<br><span style="color:#e2e6d8">✓ Notifications en pause<br>✓ Une bonne idée à portée de main</span><br>→ Let’s build something.</p></div><div class="filter-chips" style="margin:20px 0 0">${[
        ["Lavande", "#302938"],
        ["Forêt", "#22381d"],
        ["Océan", "#1c3342"],
      ]
        .map(
          ([name, color]) =>
            `<button class="filter-chip" data-action="quiet-color" data-color="${color}">${name}</button>`,
        )
        .join(
          "",
        )}</div><p class="demo-note">Aperçu interactif du thème. Aucune extension n’est installée.</p>`,
      `<button class="button button-secondary" data-action="project" data-id="quiet">Retour au projet</button>`,
    );
  } else if (id === "api-insight") {
    openModal(
      "API Insight · une requête, juste pour voir",
      `<p class="modal-lead">Inspecte une réponse de démonstration. Aucune requête ne quitte ton navigateur.</p><div class="form-row" style="grid-template-columns:85px 1fr"><select class="form-field" aria-label="Méthode HTTP"><option>GET</option></select><input class="form-field" value="/v1/builders" aria-label="Endpoint" readonly></div><button class="button button-primary" style="margin-top:15px" data-action="api-request">${icon("send")}Envoyer</button><div id="apiResult"></div>`,
      `<button class="button button-secondary" data-action="project" data-id="${id}">Retour au projet</button>`,
    );
  } else if (id === "codegarden") {
    openModal(
      "Codegarden · chaque commit compte",
      `<p class="modal-lead">Même les petites contributions font pousser quelque chose. Ajoute un commit à ton jardin.</p><div id="gardenPlot" style="min-height:165px;background:#d5ddbc;border:1px solid #9cad81;border-radius:10px;padding:22px;display:flex;align-items:flex-end;justify-content:center;gap:8px;flex-wrap:wrap;font-size:38px">🌱 🌿 🌷 🌱</div><p id="gardenCount" class="form-hint" style="text-align:center;margin-top:13px">4 petites contributions, un jardin qui grandit.</p>`,
      `<button class="button button-primary" data-action="garden-commit">${icon("plus")}Un commit de plus</button><button class="button button-secondary" data-action="project" data-id="${id}">Retour</button>`,
    );
  } else {
    openModal(
      `${project.name} · la petite boîte à outils`,
      `<p class="modal-lead">Un exemple de script de la collection : compter les fichiers par extension. Sélectionne un exemple pour lire le code.</p><pre class="form-field compose-code" style="white-space:pre-wrap">from pathlib import Path\nfrom collections import Counter\n\nfiles = Path(".").rglob("*")\ncounts = Counter(f.suffix for f in files if f.is_file())\n\nfor extension, count in counts.items():\n    print(f"{extension or '(sans extension)'} : {count}")</pre><p class="demo-note">Code en lecture seule. Python n’est pas exécuté dans le navigateur.</p>`,
      `<button class="button button-secondary" data-action="project" data-id="${id}">Retour au projet</button>`,
    );
  }
}
function openPair(id) {
  const person = getPerson(id);
  openModal(
    `Un échange avec ${person.name.split(" ")[0]}`,
    `<div class="compose-author">${avatar(id)}<div><strong>${person.name}</strong><span><span class="online-indicator"></span>Disponible pour un coup de main</span></div></div><p class="modal-lead">Un peu de contexte aide à bien commencer. Présente ton projet ou le problème que tu aimerais débloquer.</p><form id="pairForm" data-form="pair" data-person="${id}"><div class="form-group"><label class="form-label" for="pairTopic">De quoi aimerais-tu parler ?</label><input id="pairTopic" class="form-field" name="topic" placeholder="Un bug React, un avis sur mon API…" required maxlength="100"></div><div class="form-group"><label class="form-label" for="pairMessage">Ton message</label><textarea id="pairMessage" class="form-field" name="message" rows="4" placeholder="Salut ${person.name.split(" ")[0]} ! Je travaille sur…" required maxlength="1500"></textarea></div></form>`,
    `<span class="footnote">${icon("message")}Une conversation, pas une candidature.</span><button class="button button-primary" type="submit" form="pairForm">Envoyer ${icon("send")}</button>`,
  );
}
function defaultMessages(id) {
  if (id === "sarah")
    return [
      {
        text: `Hello ${state.profile.name.split(" ")[0]} ! Bienvenue dans la boucle 👋 Tu travailles sur quoi en ce moment ?`,
        mine: false,
        time: "10:24",
      },
    ];
  if (id === "yann")
    return [
      {
        text: "Merci d’avoir enregistré Pollen ! Si tu as des idées pour l’améliorer, je suis tout ouïe 🌱",
        mine: false,
        time: "09:42",
      },
    ];
  return [
    {
      text: `Hello Alex ! ${getPerson(id).name.split(" ")[0]} ici. Raconte-moi ce que tu construis 🙂`,
      mine: false,
      time: "À l’instant",
    },
  ];
}
function chatMessages(id) {
  return state.messages[id] || defaultMessages(id);
}
function openMessages(id) {
  if (id) activeConversation = id;
  const ids = [
    ...new Set([
      "sarah",
      "yann",
      ...Object.keys(state.messages),
      activeConversation,
    ]),
  ];
  const person = getPerson(activeConversation);
  openModal("Les conversations qui font avancer", "", "", "messages-modal");
  $(".messages-modal").insertAdjacentHTML(
    "beforeend",
    `<div class="messages-layout"><aside class="conversation-list">${ids
      .map((personId) => {
        const p = getPerson(personId),
          msgs = chatMessages(personId);
        return `<button class="conversation-item ${personId === activeConversation ? "active" : ""}" data-action="conversation" data-person="${personId}">${avatar(personId)}<div><strong>${esc(p.name)}</strong><p>${esc(msgs.at(-1)?.text)}</p></div></button>`;
      })
      .join(
        "",
      )}</aside><div class="chat-panel"><div class="chat-heading">${esc(person.name)}<span><span class="online-indicator"></span>En ligne</span></div><div class="chat-bubbles" id="chatBubbles"><span class="chat-date">AUJOURD’HUI · CONVERSATION DE DÉMONSTRATION</span>${chatMessages(activeConversation).map(chatBubble).join("")}</div><form class="chat-form" data-form="chat" data-person="${activeConversation}"><input name="message" placeholder="Une idée, un petit bonjour…" aria-label="Écrire un message" required maxlength="1500" autocomplete="off"><button class="icon-btn" type="submit" aria-label="Envoyer">${icon("send")}</button></form></div></div>`,
  );
  requestAnimationFrame(() => {
    const bubbles = $("#chatBubbles");
    if (bubbles) bubbles.scrollTop = bubbles.scrollHeight;
  });
}
function chatBubble(message) {
  return `<div class="chat-bubble ${message.mine ? "mine" : ""}">${esc(message.text)}<small>${esc(message.time || "À l’instant")}${message.mine ? " · ✓" : ""}</small></div>`;
}
function addChatMessage(id, text) {
  if (!state.messages[id]) state.messages[id] = [...defaultMessages(id)];
  state.messages[id].push({
    text,
    mine: true,
    time: new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  persist();
  const bubbleArea = $("#chatBubbles");
  if (bubbleArea && activeConversation === id) {
    bubbleArea.insertAdjacentHTML(
      "beforeend",
      chatBubble(state.messages[id].at(-1)),
    );
    bubbleArea.scrollTop = bubbleArea.scrollHeight;
  }
  setTimeout(() => {
    const reply = {
      text: "Merci pour ton message ! Ici c’est une conversation de démonstration, mais ton message reste bien enregistré dans ce navigateur. À nous de construire la suite 🙂",
      mine: false,
      time: "À l’instant",
    };
    state.messages[id].push(reply);
    persist();
    const area = $("#chatBubbles");
    if (area && activeConversation === id) {
      area.insertAdjacentHTML("beforeend", chatBubble(reply));
      area.scrollTop = area.scrollHeight;
    }
  }, 1100);
}
function closeNotifications() {
  $("#notificationPopover").hidden = true;
}
function toggleNotifications() {
  const popover = $("#notificationPopover");
  if (!popover.hidden) {
    closeNotifications();
    return;
  }
  popover.innerHTML = `<div class="popover-heading"><h2>Du nouveau dans ta boucle</h2><button data-action="read-notifications">Tout marquer comme lu</button></div><button class="notification-item" data-action="open-post" data-id="p1">${avatar("sarah")}<div><strong>Sarah Chen</strong> a partagé un snippet qui pourrait te plaire.<small>Il y a 24 min · JavaScript</small></div></button><button class="notification-item" data-action="open-post" data-id="p2">${avatar("yann")}<div><strong>Pollen est en ligne.</strong> Le projet de Yann attend ton regard neuf.<small>Il y a 1 h · Build in public</small></div></button><button class="notification-item" data-action="challenge"><span class="notification-symbol">${icon("rocket")}</span><div><strong>Prêt pour un petit défi ?</strong> Le challenge du week-end est ouvert.<small>48 h pour construire quelque chose d’utile</small></div></button><div class="notification-footer">Voilà, tu es dans la boucle.</div>`;
  popover.hidden = false;
}
function openSearch() {
  closeNotifications();
  if (!$("#overlayRoot").firstElementChild)
    lastFocusedElement = document.activeElement;
  $("#overlayRoot").innerHTML =
    `<div class="modal-backdrop" data-backdrop><section class="modal search-modal" role="dialog" aria-modal="true" aria-label="Rechercher dans devloop" tabindex="-1"><div class="modal-header">${icon("search")}<input class="global-search-input" id="globalSearchInput" placeholder="Une idée, un langage, quelqu’un…" aria-label="Rechercher" autocomplete="off" autofocus><button class="esc-key" data-action="close-modal">ESC</button></div><div class="search-results" id="searchResults"></div><div class="search-footer"><span>Des projets, du code et des gens à découvrir.</span><span>Entrée pour explorer ↵</span></div></section></div>`;
  document.body.style.overflow = "hidden";
  searchResults("");
  requestAnimationFrame(() => $("#globalSearchInput").focus());
}
function searchResults(query) {
  const q = query.toLocaleLowerCase("fr").trim();
  let results = "";
  if (!q)
    results = `<p class="search-result-label">UN PETIT RACCOURCI VERS…</p>${[
      [
        "projects",
        "layers",
        "Des projets qui donnent envie",
        "Ce que la communauté construit",
      ],
      ["help", "users", "Un nouveau binôme", "Un coup de main, un déclic"],
      [
        "saved",
        "bookmark",
        "Tes bonnes idées de côté",
        "Les retrouver, les réutiliser",
      ],
    ]
      .map(
        ([nav, symbol, title, sub]) =>
          `<button class="search-result" data-action="search-nav" data-view="${nav}">${icon(symbol)}<span class="search-result-copy"><strong>${title}</strong><span>${sub}</span></span>${icon("arrow-up-right", "result-arrow")}</button>`,
      )
      .join(
        "",
      )}<p class="search-result-label">LES LANGAGES DU MOMENT</p>${["javascript", "typescript", "react"].map((tag) => `<button class="search-result" data-community="${tag}">${icon("code")}<span class="search-result-copy"><strong>#${tag}</strong><span>Rejoindre la discussion</span></span>${icon("arrow-up-right", "result-arrow")}</button>`).join("")}`;
  else {
    const matchedPeople = Object.entries(people)
      .filter(([id]) => {
        const p = getPerson(id);
        return `${p.name} ${p.role} ${p.skills.join(" ")}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 3);
    const matchedProjects = projectList()
      .filter((p) =>
        `${p.name} ${p.description} ${p.tags.join(" ")}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 3);
    const matchedPosts = allPosts()
      .filter((p) =>
        `${p.title} ${p.text || p.body} ${p.tags.join(" ")} ${p.code || ""}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 4);
    if (matchedPeople.length)
      results += `<p class="search-result-label">LES GENS</p>${matchedPeople.map(([id]) => `<button class="search-result" data-action="profile" data-person="${id}">${avatar(id)}<span class="search-result-copy"><strong>${esc(getPerson(id).name)}</strong><span>${esc(getPerson(id).role)}</span></span>${icon("arrow-up-right", "result-arrow")}</button>`).join("")}`;
    if (matchedProjects.length)
      results += `<p class="search-result-label">LES PROJETS</p>${matchedProjects.map((p) => `<button class="search-result" data-action="project" data-id="${p.id}">${icon("layers")}<span class="search-result-copy"><strong>${esc(p.name)}</strong><span>${esc(p.tagline)}</span></span>${icon("arrow-up-right", "result-arrow")}</button>`).join("")}`;
    if (matchedPosts.length)
      results += `<p class="search-result-label">DANS LES PUBLICATIONS</p>${matchedPosts.map((p) => `<button class="search-result" data-action="open-post" data-id="${p.id}">${icon("message")}<span class="search-result-copy"><strong>${esc(p.title)}</strong><span>Par ${esc(getPerson(p.author).name)} · ${p.tags.map((t) => `#${esc(t)}`).join(" ")}</span></span>${icon("arrow-up-right", "result-arrow")}</button>`).join("")}`;
    if (!results)
      results = `<div class="empty-state" style="border:0;padding:35px 15px">${icon("search")}<h2>Pas encore dans la boucle.</h2><p>Essaie un autre nom, un langage ou un mot-clé.</p></div>`;
  }
  $("#searchResults").innerHTML = results;
}
function openPost(id) {
  const post = getPost(id);
  if (!post) return;
  expandedComments.add(id);
  closeNotifications();
  openModal("Une idée, une discussion", renderPost(post), "", "modal-post");
}
function openChallenge() {
  openModal(
    "Petit projet, grand premier pas",
    `<div class="challenge-details"><div class="section-eyebrow" style="margin-bottom:12px">CHALLENGE DU WEEK-END · 48 HEURES</div><h3>Construis l’outil que tu aurais aimé avoir.</h3><p>Pas besoin de réinventer la roue. Un convertisseur, un générateur, un petit raccourci qui fait gagner du temps : choisis une idée et donne-lui vie.</p><ul><li>Un outil utile à au moins un développeur.</li><li>Du code ouvert, pour apprendre ensemble.</li><li>Une petite démo à partager dans la boucle.</li></ul></div><p class="modal-lead" style="margin:0">${state.joined ? "Tu es dans l’aventure ! Partage ton avancement avec #build-in-public, puis ton projet quand tu es prêt·e. Le plus important, c’est de commencer." : "32 builders ont déjà dit oui. Pas de classement, pas de pression : le seul objectif, c’est de construire quelque chose ensemble."}</p>`,
    `<button class="button button-secondary" data-action="close-modal">Je garde l’idée</button><button class="button button-primary" data-action="${state.joined ? "share-project" : "join-challenge"}">${state.joined ? "Partager mon projet" : "Je suis de la partie"} ${icon("rocket")}</button>`,
  );
}
function openCommunities() {
  openModal(
    "Chacun son langage, une même boucle",
    `<p class="modal-lead">Trouve les gens qui partagent tes sujets préférés. Clique sur une communauté pour entrer dans la discussion.</p><div class="community-modal-grid">${[
      ["javascript", "yellow", "842 builders"],
      ["typescript", "blue", "1 240 builders"],
      ["react", "blue", "964 builders"],
      ["python", "green", "716 builders"],
      ["build-in-public", "purple", "1 486 builders"],
      ["open-source", "yellow", "2 104 builders"],
      ["backend", "green", "528 builders"],
      ["architecture", "purple", "396 builders"],
    ]
      .map(
        ([tag, color, count]) =>
          `<button class="community-choice" data-community="${tag}"><span class="space-hash ${color}">#</span><span><strong>${tag}</strong><small>${count}</small></span></button>`,
      )
      .join("")}</div>`,
  );
}
function openBuilders() {
  openModal(
    "Ta prochaine belle rencontre",
    `<p class="modal-lead">Des personnes qui construisent, partagent et aiment apprendre à plusieurs. Fais un peu de place dans ta boucle.</p>${["sarah", "lea", "amine", "julie", "yann", "idrissa"].map(suggestedPerson).join("")}`,
  );
}
function about() {
  openModal(
    "Fait pour ceux qui font",
    `<div class="about-brand">devloop<span>.</span></div><p class="modal-lead">Un réseau social pour les développeurs, pensé autour d’une idée simple : moins de bruit, plus de code et de partage authentique.</p><div class="about-features"><div class="about-feature">${icon("code")}Du code qu’on peut comprendre, enregistrer et réutiliser.</div><div class="about-feature">${icon("layers")}Des projets qu’on construit en public, pas des CV qu’on embellit.</div><div class="about-feature">${icon("users")}Des gens pour apprendre et avancer ensemble.</div></div><p class="about-version">PROTOTYPE FRONTEND · V0.1.0<br><br>Données fictives. Aucun compte requis, aucun serveur.<br>Tes posts, favoris et échanges restent dans ce navigateur.</p>`,
  );
}
function guidelines() {
  openModal(
    "Le bon code commence par le respect",
    `<div class="article-content"><h3>On construit un endroit où l’on a envie de revenir.</h3><p><strong>Partage ce qui est utile.</strong> Une question sincère, un retour d’expérience, un petit snippet : pas besoin d’être expert pour contribuer.</p><p><strong>Critique les idées, jamais les personnes.</strong> Le code s’améliore avec des retours constructifs. Les gens aussi.</p><p><strong>Donne du crédit.</strong> Cite tes sources, respecte les licences et sois transparent sur l’aide que tu as reçue.</p><p><strong>Garde les secrets dans le .env.</strong> Ne partage jamais de clés, de données personnelles ou de code confidentiel.</p><p><strong>Pas de bruit gratuit.</strong> Ni spam, ni harcèlement, ni autopromotion sans valeur ajoutée. Ici, on préfère construire.</p></div>`,
  );
}
function article() {
  openModal(
    "Un peu de lecture, beaucoup de clarté",
    `<div class="article-content"><div class="compose-author">${avatar("lea")}<div><strong>Léa Martin</strong><span>6 min de lecture · React, Next.js</span></div></div><h3>Les Server Components, sans le mal de tête.</h3><p>Le principe tient en une phrase : chaque composant n’a pas besoin d’être envoyé au navigateur.</p><p>Un composant serveur s’exécute côté serveur. Il peut lire une base de données, appeler une API privée et préparer du HTML, sans ajouter son JavaScript au bundle client.</p><h3>Et quand faut-il un composant client ?</h3><p>Dès que tu as besoin d’interactivité : un état local, un événement au clic, un effet ou une API du navigateur. La directive <code class="inline-code">'use client'</code> marque cette frontière.</p><pre>'use client';\n\nimport { useState } from 'react';\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    &lt;button onClick={() => setCount(count + 1)}&gt;\n      {count} petits pas\n    &lt;/button&gt;\n  );\n}</pre><h3>La bonne question</h3><p>Ne te demande pas « comment passer tout en Server Components ? », mais « quelle est la plus petite partie de mon interface qui a réellement besoin d’interactivité ? ».</p><p>Garde la récupération des données sur le serveur et place la frontière client au plus près des interactions. Un changement de perspective, pas une nouvelle religion.</p><p class="form-hint">Extrait d’article fictif, créé pour ce prototype.</p></div>`,
    `<button class="button button-secondary" data-action="open-post" data-id="p4">${icon("comment")}En discuter dans la boucle</button>`,
    "modal-project",
  );
}

// Delegated interactions keep every dynamically rendered view interactive.
document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    closeModal();
    navigate(nav.dataset.nav);
    return;
  }
  const community = event.target.closest("[data-community]");
  if (community) {
    closeModal();
    communityFilter = community.dataset.community;
    languageFilter = "all";
    feedTab = "for-you";
    navigate("feed", { keepFilter: true });
    return;
  }
  if (event.target.matches("[data-backdrop]")) {
    closeModal();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) {
    if (!event.target.closest(".notification-anchor")) closeNotifications();
    return;
  }
  const { action, id, person } = button.dataset;
  switch (action) {
    case "toggle-sidebar":
      $("#sidebar").classList.toggle("open");
      $("#mobileShade").classList.toggle("visible");
      $(".mobile-menu").setAttribute(
        "aria-expanded",
        $("#sidebar").classList.contains("open"),
      );
      break;
    case "compose":
      openCompose(button.dataset.mode || "text");
      break;
    case "share-project":
      openCompose("project");
      break;
    case "ask-question":
      openCompose("question");
      break;
    case "compose-mode":
      captureComposeDraft();
      openCompose(button.dataset.mode, true);
      break;
    case "compose-tag": {
      const selected = toggleIn(composeTags, button.dataset.tag);
      button.classList.toggle("selected", selected);
      break;
    }
    case "close-modal":
      closeModal();
      break;
    case "feed-tab": {
      feedTab = button.dataset.tab;
      const pos = window.scrollY;
      render();
      window.scrollTo({ top: pos, behavior: "instant" });
      break;
    }
    case "clear-filter":
      communityFilter = "all";
      languageFilter = "all";
      render();
      break;
    case "load-more": {
      const y = window.scrollY;
      showAllPosts = true;
      render();
      window.scrollTo({ top: y, behavior: "instant" });
      break;
    }
    case "like":
      toggleLike(id);
      break;
    case "save":
      toggleSave(id);
      break;
    case "comments":
      if (expandedComments.has(id)) expandedComments.delete(id);
      else expandedComments.add(id);
      updatePost(id);
      if (expandedComments.has(id))
        setTimeout(
          () =>
            $(
              `[data-post="${id}"] .comment-form input`,
              $(".modal") || document,
            )?.focus({ preventScroll: true }),
          20,
        );
      break;
    case "copy-code":
      copyText(
        getPost(id)?.code || "",
        "Snippet copié. À toi de construire la suite !",
      );
      break;
    case "run-code":
      if (runOutputs.has(id)) runOutputs.delete(id);
      else runOutputs.add(id);
      updatePost(id);
      break;
    case "share": {
      const base = location.href.split("#")[0];
      copyText(
        `${base}#post=${id}`,
        "Lien copié. Les bonnes idées se partagent.",
      );
      break;
    }
    case "repost":
      openModal(
        "Fais passer la bonne idée",
        `<p class="modal-lead">Ajoute un mot à cette publication pour la partager avec ta boucle.</p><form id="repostForm" data-form="repost" data-id="${id}"><textarea class="form-field" name="text" rows="4" placeholder="Pourquoi ce post t’a donné envie de le partager…" maxlength="1000" required></textarea><div style="margin-top:18px;border:1px solid #3e512e;border-radius:7px;padding:15px"><p style="font-size:11px;color:#a5bf8e">${esc(getPost(id).title)}</p><p class="form-hint">Par ${esc(getPerson(getPost(id).author).name)}</p></div></form>`,
        `<button class="button button-primary" type="submit" form="repostForm">Partager dans ma boucle ${icon("repeat")}</button>`,
      );
      break;
    case "post-options": {
      const post = getPost(id);
      openModal(
        "Une bonne publication, ça se partage",
        `<p class="modal-lead">${esc(post.title)}</p><div style="display:grid;gap:10px"><button class="button button-secondary" data-action="save" data-id="${id}">${icon("bookmark")}${state.saved.includes(id) ? "Retirer de mes favoris" : "Garder dans mes favoris"}</button><button class="button button-secondary" data-action="share" data-id="${id}">${icon("share")}Copier le lien de la publication</button><button class="button button-secondary" data-action="report" data-id="${id}">${icon("flag")}Signaler à la communauté</button>${post.author === "alex" ? `<button class="button button-secondary" data-action="delete-post" data-id="${id}">${icon("close")}Supprimer ma publication</button>` : ""}</div>`,
      );
      break;
    }
    case "report":
      openModal(
        "Prendre soin de la boucle",
        `<p class="modal-lead">Qu’est-ce qui pose problème dans cette publication ?</p><form id="reportForm" data-form="report"><div class="form-group"><label class="form-label" for="reportReason">Motif</label><select class="form-field" id="reportReason" name="reason"><option>Spam ou publicité abusive</option><option>Contenu irrespectueux</option><option>Information trompeuse</option><option>Données sensibles exposées</option><option>Autre problème</option></select></div><textarea class="form-field" name="details" rows="3" placeholder="Un peu de contexte, si tu le souhaites…"></textarea><p class="form-hint">Prototype local : aucun signalement n’est transmis à un service de modération.</p></form>`,
        `<button class="button button-primary" type="submit" form="reportForm">Enregistrer le signalement</button>`,
      );
      break;
    case "delete-post":
      state.customProjects = state.customProjects.filter(
        (p) => p.postId !== id,
      );
      state.posts = state.posts.filter((p) => p.id !== id);
      state.saved = state.saved.filter((x) => x !== id);
      persist();
      closeModal();
      render();
      toast("Ta publication a été supprimée.");
      break;
    case "follow":
      toggleFollow(person);
      break;
    case "profile":
      openProfile(person);
      break;
    case "my-profile":
      openProfile("alex");
      break;
    case "edit-profile":
      editProfile();
      break;
    case "project":
      openProject(id);
      break;
    case "project-demo":
      openProjectDemo(id);
      break;
    case "project-filter":
      projectFilter = button.dataset.filter;
      render();
      break;
    case "star-project": {
      const added = toggleIn(state.starred, id);
      persist();
      const project = projectList().find((p) => p.id === id);
      $$(`[data-action="star-project"][data-id="${id}"]`).forEach((el) => {
        if (el.classList.contains("project-star")) {
          el.classList.toggle("starred", added);
          el.innerHTML = `${icon("star")}<span>${project.stars + (added ? 1 : 0)}</span>`;
        } else
          el.innerHTML = `${icon("star")}${added ? "Étoile ajoutée" : "Soutenir le projet"}`;
        el.setAttribute("aria-pressed", added);
      });
      toast(
        added
          ? `Un petit soutien pour ${project.name}. Ça compte !`
          : "Étoile retirée.",
        "star",
      );
      break;
    }
    case "move-task": {
      const col = button.closest(".demo-column");
      const stage = Number(col.dataset.stage);
      $(`.demo-column[data-stage="${(stage + 1) % 3}"]`).append(button);
      toast(
        stage === 1
          ? "Une petite victoire de plus. Bien joué !"
          : "Un petit pas, et le projet avance.",
      );
      break;
    }
    case "quiet-color":
      $("#quietPreview").style.background = button.dataset.color;
      $$(".modal .filter-chip").forEach((el) =>
        el.classList.toggle("active", el === button),
      );
      break;
    case "api-request":
      $("#apiResult").innerHTML =
        `<div class="code-output" style="margin-top:18px;border:1px solid #48643a;border-radius:6px"><div class="code-output-label">200 OK · RÉPONSE LOCALE DE DÉMONSTRATION</div><pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(
          JSON.stringify(
            {
              data: [
                { name: "Sarah", stack: "JavaScript", building: true },
                { name: "Yann", stack: "Next.js", building: true },
              ],
              community: "devloop",
              message: "Ready to build.",
            },
            null,
            2,
          ),
        )}</pre></div>`;
      break;
    case "garden-commit": {
      const plot = $("#gardenPlot");
      const flowers = ["🌱", "🌿", "🌷", "🌼", "🌻", "🪴"];
      const flower = document.createElement("span");
      flower.textContent = flowers[Math.floor(Math.random() * flowers.length)];
      flower.style.animation = "modalIn .3s";
      plot.append(flower);
      const count = 4 + plot.children.length;
      $("#gardenCount").textContent =
        `${count} petites contributions, un jardin qui grandit.`;
      if (plot.children.length > 30) toast("Ton jardin est bien fleuri ! 🌷");
      break;
    }
    case "help-tab":
      helpTab = button.dataset.tab;
      render();
      break;
    case "pair":
      openPair(person);
      break;
    case "messages":
      openMessages();
      break;
    case "conversation":
      openMessages(person);
      break;
    case "notifications":
      toggleNotifications();
      break;
    case "read-notifications":
      state.notificationRead = true;
      persist();
      $("#notificationDot").hidden = true;
      closeNotifications();
      toast("Tu es à jour avec ta boucle.");
      break;
    case "search":
      openSearch();
      break;
    case "search-nav":
      closeModal();
      navigate(button.dataset.view);
      break;
    case "open-post":
      openPost(id);
      break;
    case "challenge":
      openChallenge();
      break;
    case "join-challenge":
      state.joined = true;
      persist();
      openChallenge();
      toast("C’est parti ! Un petit projet peut mener très loin.", "rocket");
      break;
    case "communities":
      openCommunities();
      break;
    case "builders":
      openBuilders();
      break;
    case "about":
      about();
      break;
    case "guidelines":
      guidelines();
      break;
    case "article":
      article();
      break;
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "composeText") {
    $("#charCount").textContent = event.target.value.length;
    $("#publishButton").disabled = !event.target.value.trim();
  }
  if (event.target.id === "globalSearchInput")
    searchResults(event.target.value);
});
document.addEventListener("change", (event) => {
  if (event.target.id === "languageFilter") {
    languageFilter = event.target.value;
    communityFilter = "all";
    const y = window.scrollY;
    render();
    window.scrollTo({ top: y, behavior: "instant" });
  }
  if (event.target.id === "composeLanguage") {
    const extensions = {
      JavaScript: "js",
      TypeScript: "ts",
      Python: "py",
      CSS: "css",
    };
    $("#composeFile").value =
      `snippet.${extensions[event.target.value] || "txt"}`;
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = new FormData(form);
  switch (form.dataset.form) {
    case "compose":
      publish(form);
      break;
    case "comment": {
      const text = String(values.get("comment") || "").trim();
      if (!text) return;
      const id = form.dataset.id;
      (state.comments[id] ??= []).push({
        author: "alex",
        text,
        time: "À l’instant",
      });
      persist();
      updatePost(id);
      toast("Ta voix fait avancer la discussion.");
      break;
    }
    case "profile": {
      state.profile = {
        name: String(values.get("name")).trim() || "Alex Morgan",
        role: String(values.get("role")).trim() || "Développeur",
        bio: String(values.get("bio")).trim(),
        skills: String(values.get("skills")).trim(),
      };
      persist();
      render();
      openProfile("alex");
      toast("Voilà, c’est encore un peu plus toi.");
      break;
    }
    case "pair": {
      const text = `${values.get("topic")} — ${values.get("message")}`;
      const id = form.dataset.person;
      openMessages(id);
      addChatMessage(id, text);
      toast("Le premier pas est fait. La conversation est lancée !");
      break;
    }
    case "chat": {
      const text = String(values.get("message") || "").trim();
      if (!text) return;
      addChatMessage(form.dataset.person, text);
      form.elements.message.value = "";
      form.elements.message.focus();
      break;
    }
    case "repost": {
      const original = getPost(form.dataset.id);
      const text = `${String(values.get("text") || "").trim()}\n\n↗ ${getPerson(original.author).name} : ${original.title}`;
      state.posts.unshift({
        id: `u${Date.now()}`,
        author: "alex",
        time: "À l’instant",
        type: "text",
        title: text.slice(0, 90),
        text,
        isUser: true,
        tags: [...original.tags],
        likes: 0,
        reposts: 0,
      });
      persist();
      closeModal();
      feedTab = "for-you";
      navigate("feed");
      toast("Une bonne idée de plus dans ta boucle.", "repeat");
      break;
    }
    case "report":
      closeModal();
      toast("Signalement enregistré dans cette session de démo.", "flag");
      break;
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.key === "Escape") {
    if ($("#overlayRoot").firstElementChild) closeModal();
    else {
      closeNotifications();
      closeSidebar();
    }
    return;
  }
  if (event.target.id === "globalSearchInput" && event.key === "Enter") {
    event.preventDefault();
    $("#searchResults .search-result")?.click();
  }
  if (event.key === "Tab" && $(".modal")) {
    const focusable = $$(
      'button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]',
      $(".modal"),
    ).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("hashchange", () => {
  const match = location.hash.match(/^#post=(.+)$/);
  if (match && getPost(match[1])) openPost(match[1]);
});
render();
const deepLink = location.hash.match(/^#post=(.+)$/);
if (deepLink && getPost(deepLink[1]))
  setTimeout(() => openPost(deepLink[1]), 100);
