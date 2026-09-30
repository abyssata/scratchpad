// ─────────────────────────────────────────────────────────────────────
// SCRATCHPAD · builds the site from the notes in posts/
//
// Every .md file in posts/ is one post. Newest first. A post's time comes
// from (in order): a `date:` line in its frontmatter, a timestamp at the
// start of its file name (Obsidian's "Unique note creator" makes names
// like 202609301432), or the moment it was first committed to git.
//
// Frontmatter is optional. `draft: true` keeps a post off the site.
//
//   npm run build   → writes the site to public/
//   npm run serve   → builds, then previews at http://localhost:8080
// ─────────────────────────────────────────────────────────────────────

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { marked } from "marked"

const SITE = {
  name: "MISCELLANY",
  // shown beneath the name; HTML is fine
  subtitle: 'Loose notes from the margins of <a href="https://abyssata.blog">Abyssata</a>.',
  description: "Loose notes from the margins of Abyssata.",
  url: "https://misc.abyssata.blog",
  timeZone: "America/New_York",
}

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const POSTS = path.join(ROOT, "posts")
const OUT = path.join(ROOT, "public")

// a fingerprint of the stylesheet, added to its address so browsers fetch the
// new one as soon as it changes instead of reusing an old saved copy
const CSS_VERSION = createHash("sha1").update(fs.readFileSync(path.join(ROOT, "site", "style.css"))).digest("hex").slice(0, 8)

marked.use({ breaks: true, gfm: true })

// ── Reading posts ───────────────────────────────────────────────────

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, body: src }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) data[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim()
  }
  return { data, body: src.slice(m[0].length) }
}

// The offset of the site's time zone from UTC at a given moment, in ms
function zoneOffset(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SITE.timeZone,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - utcMs
}

// A wall-clock time in the site's time zone → a real Date
function localTime(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return new Date(guess - zoneOffset(guess - zoneOffset(guess)))
}

function parseStamp(s) {
  const m = String(s).match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[ T_-]?(\d{2}):?(\d{2}))?/)
  return m ? localTime(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : null
}

function firstCommitted(file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--follow", "--format=%cI", "--", file], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const last = out.split("\n").filter(Boolean).pop()
    return last ? new Date(last) : null
  } catch {
    return null
  }
}

function postDate(file, data) {
  if (data.date) {
    const explicit = /[zZ]|[+-]\d{2}:?\d{2}$/.test(data.date) ? new Date(data.date) : parseStamp(data.date)
    if (explicit && !isNaN(explicit)) return explicit
  }
  return parseStamp(path.basename(file)) ?? firstCommitted(file) ?? fs.statSync(file).mtime
}

const slugify = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "post"

// Every file under posts/ that isn't a note, by name, so ![[image.png]] finds it
function indexAttachments() {
  const found = new Map()
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (!e.name.endsWith(".md")) found.set(e.name, path.relative(POSTS, p))
    }
  }
  walk(POSTS)
  return found
}

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Obsidian's own syntax, turned into plain Markdown/HTML before rendering
function obsidianToMarkdown(body, attachments) {
  // leave code alone
  return body.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((chunk, i) => {
    if (i % 2) return chunk
    return chunk
      // ![[image.png]] or ![[image.png|300]]
      .replace(/!\[\[([^\]|]+?)(?:\|(\d+)(?:x(\d+))?)?\]\]/g, (_, name, w) => {
        const rel = attachments.get(name.trim()) ?? name.trim()
        const src = "/" + rel.split(path.sep).map(encodeURIComponent).join("/")
        return `<img src="${src}" alt=""${w ? ` width="${w}"` : ""} loading="lazy">`
      })
      // [[note|shown text]] and [[note]] become plain text
      .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target)
      // #tags
      .replace(/(^|\s)#([\p{L}\p{N}_\-/]*\p{L}[\p{L}\p{N}_\-/]*)/gu, (_, pre, tag) => `${pre}<span class="tag">#${tag}</span>`)
      // ==highlight==
      .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
      // %% comments %% stay private
      .replace(/%%[\s\S]*?%%/g, "")
  }).join("")
}

function readPosts() {
  if (!fs.existsSync(POSTS)) return []
  const attachments = indexAttachments()
  const seen = new Set()
  return fs.readdirSync(POSTS)
    .filter((f) => f.endsWith(".md") && !f.startsWith("."))
    .map((f) => {
      const file = path.join(POSTS, f)
      const { data, body } = parseFrontmatter(fs.readFileSync(file, "utf8"))
      if (String(data.draft).toLowerCase() === "true") return null
      if (!body.trim()) return null
      const date = postDate(file, data)
      let slug = slugify(data.slug ?? f.replace(/\.md$/, ""))
      while (seen.has(slug)) slug += "-2"
      seen.add(slug)
      return { slug, date, html: marked.parse(obsidianToMarkdown(body, attachments)), text: body }
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date)
}

// ── Writing the site ────────────────────────────────────────────────

const fmt = (d, opts) => new Intl.DateTimeFormat("en-US", { timeZone: SITE.timeZone, ...opts }).format(d)
const dayOf = (d) => fmt(d, { month: "short", day: "numeric", year: "numeric" })
const timeOf = (d) => fmt(d, { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase()
const dayKey = (d) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" })
const yearOf = (d) => fmt(d, { year: "numeric" })
// "Wednesday" and "30 September" (with the year when asked)
function dayLabel(d, withYear) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: SITE.timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  )
  return { weekday: parts.weekday, date: `${parts.day} ${parts.month}${withYear ? ` ${parts.year}` : ""}` }
}

// the circumpunct from the garden, as the tab icon
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 112 112"><circle cx="50" cy="50" r="44" fill="none" stroke="#5c2229" stroke-width="8"/><circle cx="50" cy="50" r="9" fill="#5c2229"/></svg>',
  )

function page({ title, body, canonical, description = SITE.description }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${SITE.url}${canonical}">
<link rel="icon" href="${ICON}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.name)}" href="/feed.xml">
<link rel="stylesheet" href="/style.css?v=${CSS_VERSION}">
</head>
<body>
<header class="masthead">
  <h1 class="name"><a href="/">${escapeHtml(SITE.name)}</a></h1>
  <p class="subtitle">${SITE.subtitle}</p>
</header>
<main>
${body}
</main>
<footer>
  <a href="/feed.xml">RSS</a>
</footer>
</body>
</html>
`
}

// one note, its time beneath it, linking to the note's own page
function postHtml(p, { linked = true } = {}) {
  const time = `<time datetime="${p.date.toISOString()}">${timeOf(p.date)}</time>`
  return `<article class="post" id="${p.slug}">
  <div class="body">
${p.html}  </div>
  ${linked ? `<a class="when" href="/p/${p.slug}/">${time}</a>` : `<p class="when">${time}</p>`}
</article>`
}

// a day: its name as a heading, then its notes, newest first
function dayHtml(notes, { withYear = false, linked = true } = {}) {
  const { weekday, date } = dayLabel(notes[0].date, withYear)
  return `<section class="day">
<h2 class="dayname">${weekday}<span class="date">${date}</span></h2>
${notes.map((p) => postHtml(p, { linked })).join("\n")}
</section>`
}

function byDay(posts) {
  const days = []
  for (const p of posts) {
    const last = days[days.length - 1]
    if (last && dayKey(last[0].date) === dayKey(p.date)) last.push(p)
    else days.push([p])
  }
  return days
}

const excerpt = (p) => p.text.replace(/[#*_>`\[\]!=%]/g, "").replace(/\s+/g, " ").trim().slice(0, 150)

function write(rel, content) {
  const f = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, content)
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue
    const a = path.join(from, e.name), b = path.join(to, e.name)
    if (e.isDirectory()) copyDir(a, b)
    else if (!e.name.endsWith(".md")) {
      fs.mkdirSync(to, { recursive: true })
      fs.copyFileSync(a, b)
    }
  }
}

function build() {
  const posts = readPosts()
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  // the feed
  write("index.html", page({
    title: SITE.name,
    canonical: "/",
    // the year appears only on days from a year other than the newest note's
    body: posts.length
      ? byDay(posts).map((d) => dayHtml(d, { withYear: yearOf(d[0].date) !== yearOf(posts[0].date) })).join("\n")
      : `<p class="empty">Nothing here yet.</p>`,
  }))

  // one page per post
  for (const p of posts) {
    write(`p/${p.slug}/index.html`, page({
      title: `${dayOf(p.date)} · ${SITE.name}`,
      canonical: `/p/${p.slug}/`,
      description: excerpt(p),
      body: dayHtml([p], { withYear: true, linked: false }) + `\n<p class="back"><a href="/">All notes</a></p>`,
    }))
  }

  // RSS
  write("feed.xml", `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
<channel>
<title>${escapeHtml(SITE.name)}</title>
<link>${SITE.url}/</link>
<description>${escapeHtml(SITE.description)}</description>
${posts.slice(0, 50).map((p) => `<item>
  <title>${escapeHtml(excerpt(p).slice(0, 80) || dayOf(p.date))}</title>
  <link>${SITE.url}/p/${p.slug}/</link>
  <guid>${SITE.url}/p/${p.slug}/</guid>
  <pubDate>${p.date.toUTCString()}</pubDate>
  <description>${escapeHtml(p.html)}</description>
</item>`).join("\n")}
</channel>
</rss>
`)

  write("404.html", page({ title: `Not found · ${SITE.name}`, canonical: "/404.html", body: `<p class="empty">Nothing here. <a href="/">Back to the notes</a>.</p>` }))

  copyDir(path.join(ROOT, "site"), OUT) // style.css, fonts, CNAME
  copyDir(POSTS, OUT) // images and other attachments, at the same paths
  console.log(`Built ${posts.length} post${posts.length === 1 ? "" : "s"} → public/`)
}

build()
