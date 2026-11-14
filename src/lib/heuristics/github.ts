/**
 * GitHub cold start: public repositories → suggested interests.
 * Uses the unauthenticated public API (60 requests/hour per visitor IP); nothing is stored.
 */
import { ApiError, type GithubImport } from '../api/contract';

const LANGUAGE_TO_SLUG: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  'jupyter notebook': 'data-ai',
  r: 'data-ai',
  java: 'java',
  kotlin: 'mobile',
  swift: 'mobile',
  dart: 'mobile',
  php: 'php',
  go: 'go',
  css: 'css',
  scss: 'css',
  html: 'css',
  shell: 'devops',
  dockerfile: 'devops',
  hcl: 'devops',
  plpgsql: 'databases',
  tsql: 'databases',
};

const TOPIC_TO_SLUG: Record<string, string> = {
  react: 'react',
  reactjs: 'react',
  nextjs: 'react',
  node: 'nodejs',
  nodejs: 'nodejs',
  express: 'nodejs',
  django: 'django',
  'machine-learning': 'data-ai',
  'deep-learning': 'data-ai',
  'data-science': 'data-ai',
  ai: 'data-ai',
  llm: 'data-ai',
  sql: 'databases',
  postgresql: 'databases',
  mongodb: 'databases',
  docker: 'devops',
  kubernetes: 'devops',
  devops: 'devops',
  'ci-cd': 'devops',
  android: 'mobile',
  ios: 'mobile',
  flutter: 'mobile',
  'react-native': 'mobile',
  security: 'security',
  testing: 'testing',
  jest: 'testing',
  git: 'git',
};

export interface GithubRepo {
  language?: string | null;
  topics?: string[] | null;
  fork?: boolean;
}

/** Evidence is locale-neutral: "7 × TypeScript". */
export function mapGithubRepos(repos: readonly GithubRepo[]): GithubImport['suggestions'] {
  const counts = new Map<string, { count: number; label: string }>();
  const bump = (slug: string | undefined, label: string) => {
    if (!slug) return;
    const entry = counts.get(slug) ?? { count: 0, label };
    entry.count += 1;
    counts.set(slug, entry);
  };
  for (const repo of repos) {
    if (repo.fork) continue;
    if (repo.language) bump(LANGUAGE_TO_SLUG[repo.language.toLowerCase()], repo.language);
    for (const topic of repo.topics ?? []) bump(TOPIC_TO_SLUG[topic.toLowerCase()], topic);
  }
  const max = Math.max(1, ...[...counts.values()].map((entry) => entry.count));
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([slug, entry]) => ({
      slug,
      weight: Math.round((0.45 + 0.4 * (entry.count / max)) * 100) / 100,
      evidence: `${entry.count} × ${entry.label}`,
    }));
}

export async function fetchGithubImport(login: string): Promise<GithubImport> {
  const clean = login.trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(clean)) throw new ApiError('validation');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.github.com/users/${clean}/repos?per_page=100&sort=pushed`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (response.status === 404) throw new ApiError('not_found');
    if (response.status === 403 || response.status === 429) throw new ApiError('rate_limited');
    if (!response.ok) throw new ApiError('network');
    const repos = (await response.json()) as GithubRepo[];
    return { login: clean, suggestions: mapGithubRepos(Array.isArray(repos) ? repos : []) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
}
