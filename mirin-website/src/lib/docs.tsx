import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// On Vercel the prebuild script copies ../docs into ./docs (sibling to package.json).
// Locally we read ../docs directly from the monorepo. Fall back gracefully.
const localDocs = path.resolve(process.cwd(), "docs");
const siblingDocs = path.resolve(process.cwd(), "..", "docs");
const root = existsSync(localDocs) ? localDocs : siblingDocs;

export type DocItem = { slug: string[]; title: string; group: string };

function titleOf(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1] ?? "Mirin documentation";
}

export async function getDocs(): Promise<DocItem[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && !file.includes("/superpowers")) await walk(file);
      if (entry.isFile() && entry.name.endsWith(".md")) files.push(file);
    }
  }
  await walk(root);
  return Promise.all(files.map(async (file) => {
    const relative = path.relative(root, file);
    const slug = relative === "README.md" ? [] : relative.replace(/\.md$/, "").split(path.sep);
    return { slug, title: titleOf(await readFile(file, "utf8")), group: slug[0] ?? "overview" };
  }));
}

function href(slug: string[]) { return `/docs${slug.length ? `/${slug.join("/")}` : ""}`; }

function inline(text: string, current: string[]) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const target = link[2].replace(/#.*$/, "");
      const next = target.endsWith(".md")
        ? path.posix.normalize(path.posix.join(...current.slice(0, -1), target.replace(/\.md$/, ""))).replace(/^\.\//, "").split("/").filter(Boolean)
        : current;
      return <Link key={index} href={href(next)} className="text-accent hover:underline">{link[1]}</Link>;
    }
    if (part.startsWith("`")) return <code key={index} className="rounded bg-page-bg-alt px-1.5 py-0.5 text-sm">{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export async function DocContent({ slug }: { slug: string[] }) {
  const file = path.join(root, ...(slug.length ? slug : ["README"] )) + ".md";
  if (!file.startsWith(root)) notFound();
  let markdown: string;
  try { markdown = await readFile(file, "utf8"); } catch { notFound(); }
  return <article className="prose max-w-none">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      a: ({ href = "", children }) => <Link href={href.endsWith(".md") ? href.replace(/\.md$/, "").replace(/^\.\//, "") : href}>{children}</Link>,
    }}>{markdown}</ReactMarkdown>
  </article>;
}
