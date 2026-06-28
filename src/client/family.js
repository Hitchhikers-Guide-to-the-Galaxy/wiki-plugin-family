// wiki-plugin-family — gather configurable families of related wiki sites.
//
// Augments the Present plugin: instead of only listing sister sites, the item
// text is a list of keywords choosing WHICH families of sites to gather and
// show. Each gathered site is registered as a neighbor so its pages join your
// search and lineage. Reads the in-browser neighbourhood for the client-side
// families, and a small server route for the disk-derived ones.
//
// Recognised keywords (one per line, in item.text):
//   sisters        sibling sites sharing the parent domain   (server)
//   parent         the parent-domain site itself             (server)
//   children       sub-domains of this site                  (server)
//   farm           every wiki in the farm                    (server)
//   neighbourhood  the sites currently in your neighborhood  (client)
//   snapshot       freeze the current neighborhood           (client, v0.1 == neighbourhood)
//
// Action (not a site-kind):
//   FREEZE         show a button that saves the gathered family as a roster
//                  ghost page (one roster item per kind). Read-side, no server.

const SERVER_KINDS = ['sisters', 'parent', 'children', 'farm']
const CLIENT_KINDS = ['neighbourhood', 'snapshot']
const LABEL = {
  sisters: 'Sisters',
  parent: 'Parent',
  children: 'Children',
  farm: 'Farm',
  neighbourhood: 'Neighbourhood',
  snapshot: 'Snapshot',
}

const expand = text =>
  (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')

const elapsed = ms => {
  const s = Math.floor(ms / 1000)
  const f = 1.9
  let out = 'a minute ago'
  if (s > f * 60) out = `${Math.round(s / 60)} minutes ago`
  if (s > f * 3600) out = `${Math.round(s / 3600)} hours ago`
  if (s > f * 86400) out = `${Math.round(s / 86400)} days ago`
  if (s > f * 604800) out = `${Math.round(s / 604800)} weeks ago`
  if (s > f * 2592000) out = `${Math.round(s / 2592000)} months ago`
  if (s > f * 31536000) out = `${Math.round(s / 31536000)} years ago`
  return out
}

const freshness = sitemap => {
  if (!sitemap) return ''
  const dates = sitemap.map(p => p.date).filter(d => typeof d === 'number')
  return dates.length ? elapsed(Date.now() - Math.max(...dates)) : ''
}

const portSuffix = () => ([80, '80', '', null].includes(location.port) ? '' : `:${location.port}`)

// DSL commands (UPPERCASE canonical, optional trailing colon — see the
// fedwiki-dsl convention) mapped to the internal lowercase kind key.
// A command maps to one kind, or to several (FAMILY = PARENT + SISTERS together).
const COMMANDS = {
  FAMILY: ['parent', 'sisters'],
  SISTERS: 'sisters',
  PARENT: 'parent',
  CHILDREN: 'children',
  FARM: 'farm',
  NEIGHBOURHOOD: 'neighbourhood',
  NEIGHBORHOOD: 'neighbourhood', // accept either spelling
  SNAPSHOT: 'snapshot',
}

// FREEZE is an action, not a site-kind: when present the panel shows a Freeze
// button that turns the gathered family into a saved roster ghost page (the
// panel is otherwise ephemeral). Parsed separately so it never pollutes kinds.
const parseFreeze = text =>
  (text || '').split('\n').some(raw => {
    const key = raw.trim().split(/\s+/)[0].replace(/:$/, '').toUpperCase()
    return key === 'FREEZE'
  })

// item.text -> ordered, de-duplicated list of recognised kinds (default: sisters).
// Each line: first word is the command; UPPERCASE is canonical, but input case is
// forgiven, and a single trailing colon (YAML-style) is optional.
const parseKinds = text => {
  const kinds = []
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const key = line.split(/\s+/)[0].replace(/:$/, '').toUpperCase()
    const mapped = COMMANDS[key]
    if (!mapped) continue
    for (const k of [].concat(mapped)) if (!kinds.includes(k)) kinds.push(k)
  }
  return kinds.length ? kinds : ['sisters']
}

const rowHtml = (site, pages, sitemap) => {
  const suffix = portSuffix()
  const short = site.split('.')[0]
  const img =
    `<img class=remote title="${site}${suffix}" src="//${site}${suffix}/favicon.png" ` +
    `data-site="${site}${suffix}" data-slug=welcome-visitors>`
  return (
    `<tr><td align=right>${short} ${img}` +
    `<td data-site="${site}${suffix}">${pages} pages ${freshness(sitemap)}`
  )
}

const groupHtml = (kind, rows) =>
  `<p class=caption><b>${LABEL[kind]}</b></p>` +
  `<table width=100% class=family-${kind}>${rows.join('\n')}</table>`

export const emit = (div, item) => {
  const suffix = portSuffix()
  const kinds = parseKinds(item.text)
  const freeze = parseFreeze(item.text)
  // gathered family, captured during render so the Freeze button can reuse it:
  // kind -> ordered list of full domain names
  const gathered = {}

  if (div.closest('.page').hasClass('remote')) {
    div.html(
      `<div class=family style="background-color:#eee;padding:15px"><center>${expand(item.text)}` +
      `<p class=caption>Family is only available when viewed on a page's home wiki.</p></div>`,
    )
    return
  }

  div.html(
    `<div class=family style="background-color:#eee;padding:15px"><center>${expand(item.text)}` +
    `<p class=caption>gathering…</p><div class=groups></div></div>`,
  )

  const render = serverGroups => {
    const html = []
    for (const kind of kinds) {
      if (SERVER_KINDS.includes(kind)) {
        const roll = serverGroups[kind] || []
        gathered[kind] = roll.map(r => r.site)
        const rows = roll.map(r => {
          wiki.neighborhoodObject.registerNeighbor(r.site + suffix)
          return rowHtml(r.site, r.pages, wiki.neighborhood[r.site + suffix]?.sitemap)
        })
        html.push(groupHtml(kind, rows.length ? rows : ['<tr><td><i>none</i>']))
      } else {
        // neighbourhood / snapshot — read the live in-browser neighbourhood
        const sites = Object.keys(wiki.neighborhood)
        gathered[kind] = sites
        const rows = sites.map(site => {
          const sm = wiki.neighborhood[site]?.sitemap
          return rowHtml(site, sm ? sm.length : 0, sm)
        })
        html.push(groupHtml(kind, rows.length ? rows : ['<tr><td><i>empty</i>']))
      }
    }
    div.find('.groups').html(html.join('\n'))
    div.find('.caption').first().text('just updated')

    // FREEZE — turn the gathered family into a saved roster ghost page.
    if (freeze) {
      const short = location.hostname.split('.')[0]
      const btn = $(
        '<button class=family-freeze style="margin-top:8px;padding:4px 12px;' +
        'cursor:pointer;font-size:13px">❄ Freeze</button>',
      )
      btn.on('click', () => {
        const hexId = () =>
          Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, '0')
        const story = [{ type: 'markdown', id: hexId(), text: `# ${short} Family` }]
        for (const kind of kinds) {
          const domains = gathered[kind] || []
          story.push({
            type: 'roster',
            id: hexId(),
            text: `${LABEL[kind]} Wikis\n\n${domains.join('\n') || '(none)'}`,
          })
        }
        const page = wiki.newPage({ title: `${short} Family`, story })
        wiki.showResult(page, { $page: div.parents('.page') })
      })
      div.find('.family').append(btn)
    }

    // fill page counts / freshness as neighbors finish loading their sitemaps
    $('body').on('new-neighbor-done', (e, site) => {
      const cell = div.find(`td[data-site="${site}"]`)
      if (!cell.length) return
      const sm = wiki.neighborhood[site]?.sitemap
      if (sm) cell.text(`${sm.length} pages ${freshness(sm)}`)
    })
  }

  const serverKinds = kinds.filter(k => SERVER_KINDS.includes(k))
  if (serverKinds.length === 0) {
    render({})
    return
  }

  fetch(`/plugin/family/roll?kinds=${encodeURIComponent(serverKinds.join(','))}`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then(data => render(data.groups || {}))
    .catch(() => div.find('.caption').first().text('server error'))
}

export const bind = (div, item) => {
  div.dblclick(() => wiki.textEditor(div, item))
}

if (typeof window !== 'undefined') {
  window.plugins = window.plugins || {}
  window.plugins.family = { emit, bind }
}
