# Miscellany

Loose notes from the margins of [Abyssata](https://abyssata.blog). Lives at misc.abyssata.blog.

## Posting

1. Open the `posts` folder in Obsidian (as its own vault, or add it to your garden vault).
2. Make a new note. Each note is one post.
3. Commit and push. The site rebuilds itself in a minute or two.

**When a post is dated.** Turn on Obsidian's core plugin *Unique note creator* (Settings → Core plugins). Its button makes a note named with the current time, like `202609301432`, and that becomes the post's date and time. Otherwise a post is dated when it was first committed. To set a time by hand, start the note with:

```
---
date: 2026-09-30 14:32
---
```

**Drafts.** Add `draft: true` in that same block and the note stays off the site.

**Images.** Drop them into `posts/attachments` and embed as usual: `![[photo.jpg]]`. In Obsidian, set *Files and links → Default location for new attachments* to that folder.

Also works: `**bold**` (shows in oxblood), `*italics*`, `> quotes`, lists, `#tags`, `==highlights==`, and `%% private comments %%` (never published).

## Changing the look

- `site/style.css`: the whole design
- `build.mjs`: the name, subtitle and time zone are at the top (`SITE`)

To preview on your computer: `npm install` once, then `npm run serve` and open http://localhost:8080.
