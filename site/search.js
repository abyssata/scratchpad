// ─────────────────────────────────────────────────────────────────────
// The search line at the foot of every page. Typing shows every note
// (not just this page's) that contains the words, grouped by day, with
// the words tinted. Clearing it, or pressing Esc, brings the page back.
// The notes come from /search.json, which build.mjs writes.
// ─────────────────────────────────────────────────────────────────────
;(() => {
  const input = document.getElementById("search")
  const main = document.querySelector("main")
  const pager = document.getElementById("pager")
  if (!input || !main || !pager) return

  const original = { main: main.innerHTML, pager: pager.innerHTML, single: document.body.classList.contains("single") }
  let notes = null
  let loading = null
  const load = () =>
    (loading ??= fetch("/search.json")
      .then((r) => r.json())
      .then((d) => (notes = d))
      .catch(() => (loading = null)))

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

  // tint the words wherever they appear in a note's text (never inside its tags)
  function tint(html, q) {
    const t = document.createElement("template")
    t.innerHTML = html
    const walk = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT)
    const texts = []
    while (walk.nextNode()) texts.push(walk.currentNode)
    const needle = q.toLowerCase()
    for (const node of texts) {
      const s = node.nodeValue
      const low = s.toLowerCase()
      let i = low.indexOf(needle)
      if (i < 0) continue
      const frag = document.createDocumentFragment()
      let last = 0
      while (i >= 0) {
        frag.append(s.slice(last, i))
        const mark = document.createElement("mark")
        mark.className = "hit"
        mark.textContent = s.slice(i, i + needle.length)
        frag.append(mark)
        last = i + needle.length
        i = low.indexOf(needle, last)
      }
      frag.append(s.slice(last))
      node.replaceWith(frag)
    }
    return t.innerHTML
  }

  function restore() {
    main.innerHTML = original.main
    pager.innerHTML = original.pager
    document.body.classList.toggle("single", original.single)
  }

  function show() {
    const q = input.value.trim()
    if (!q) return restore()
    if (!notes) return
    const hits = notes.filter((n) => n.text.toLowerCase().includes(q.toLowerCase()))
    let out = `<p class="found">${
      hits.length ? `${hits.length} note${hits.length === 1 ? "" : "s"} with “${esc(q)}”` : `Nothing with “${esc(q)}”.`
    }</p>`
    let day = null
    for (const n of hits) {
      if (n.day !== day) {
        if (day !== null) out += "</section>"
        out += `<section class="day">${n.heading}`
        day = n.day
      }
      out += `<article class="post${n.status ? " status" : ""}"><div class="body">${tint(n.body, q)}</div>${n.when}</article>`
    }
    if (day !== null) out += "</section>"
    main.innerHTML = out
    pager.innerHTML = `<a href="/">All notes</a>`
    document.body.classList.remove("single")
  }

  input.addEventListener("focus", load)
  input.addEventListener("input", () => (notes ? show() : load().then(show)))
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = ""
      restore()
    }
  })
})()
