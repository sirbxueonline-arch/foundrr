/**
 * Framework detection from a process command line. Pure, case-insensitive
 * substring matching against an ordered rule list — first match wins, so more
 * specific frameworks (e.g. Next.js) must precede generic fallbacks (Node).
 */

interface FrameworkRule {
  /** Lower-cased substrings; any match selects this framework. */
  readonly needles: readonly string[];
  readonly label: string;
}

/**
 * Ordered, most-specific-first. Laravel before generic PHP; uvicorn/fastapi
 * before plain python; manage.py runserver before plain python; etc.
 */
const RULES: readonly FrameworkRule[] = [
  { needles: ["next dev", "next start", "next-server", "/next/", "\\next\\"], label: "Next.js" },
  { needles: ["nuxt"], label: "Nuxt" },
  { needles: ["astro"], label: "Astro" },
  { needles: ["remix", "@remix-run"], label: "Remix" },
  { needles: ["gatsby"], label: "Gatsby" },
  { needles: ["storybook", "start-storybook"], label: "Storybook" },
  { needles: ["ng serve", "@angular", "angular"], label: "Angular" },
  { needles: ["vue-cli-service"], label: "Vue CLI" },
  { needles: ["react-scripts"], label: "CRA" },
  { needles: ["vite"], label: "Vite" },
  { needles: ["webpack"], label: "webpack" },
  { needles: ["parcel"], label: "Parcel" },
  { needles: ["nodemon"], label: "nodemon" },
  { needles: ["uvicorn", "fastapi"], label: "FastAPI" },
  { needles: ["flask"], label: "Flask" },
  { needles: ["manage.py runserver", "django"], label: "Django" },
  { needles: ["http.server"], label: "Python http.server" },
  { needles: ["artisan serve", "laravel"], label: "Laravel" },
  { needles: ["php -s", "php-s", "php "], label: "PHP" },
  { needles: ["rails", "puma", "bin/rails"], label: "Rails" },
];

const NODE_NEEDLES = ["node", "npm", "pnpm", "yarn", "bun", "deno"];
const PYTHON_NEEDLES = ["python", "python3", "py "];

/** Best-effort framework guess from a command line. Never throws. */
export function guessFramework(command: string): string {
  const haystack = command.toLowerCase();

  for (const rule of RULES) {
    if (rule.needles.some((needle) => haystack.includes(needle))) {
      return rule.label;
    }
  }

  if (NODE_NEEDLES.some((needle) => haystack.includes(needle))) {
    return "Node";
  }
  if (PYTHON_NEEDLES.some((needle) => haystack.includes(needle))) {
    return "Python";
  }
  return "Server";
}
