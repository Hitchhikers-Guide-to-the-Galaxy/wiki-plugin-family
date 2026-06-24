// family plugin — server-side component.
//
// Gathers families of related sites *within the farm*, derived from the
// REQUESTING site (origin), fixing the Present plugin's farm-mode limitation
// where peers were computed from the farm root rather than per-site.
//
// Started on the `running-serv` event with { argv, app }.

import fs from 'node:fs/promises'
import path from 'node:path'

const startServer = ({ argv, app }) => {
  // argv.status = {farmRoot}/{thisDomain}/status
  const farmRoot = path.dirname(path.dirname(argv.status))
  const origin = path.basename(path.dirname(argv.status)) // e.g. demoscene.localhost
  const parentDomain = origin.split('.').slice(1).join('.') // e.g. localhost
  const domainOf = name => name.split('.').slice(1).join('.')

  // name -> boolean, for each recognised family
  const selectors = {
    sisters: name => name !== origin && domainOf(name) === parentDomain,
    parent: name => parentDomain !== '' && name === parentDomain,
    children: name => name !== origin && name.endsWith('.' + origin),
    farm: name => name !== origin,
  }

  const isWiki = name =>
    fs
      .access(path.join(farmRoot, name, 'status', 'sitemap.json'), fs.constants.R_OK)
      .then(() => true)
      .catch(() => false)

  const pageCount = name =>
    fs
      .readdir(path.join(farmRoot, name, 'pages'))
      .then(entries => entries.length)
      .catch(() => 0)

  app.get('/plugin/family/roll', async (req, res) => {
    const kinds = String(req.query.kinds || 'sisters')
      .split(',')
      .map(k => k.trim())
      .filter(k => selectors[k])

    let entries
    try {
      entries = await fs.readdir(farmRoot, { withFileTypes: true })
    } catch {
      return res.json({ origin, parentDomain, groups: {} })
    }

    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name)
    const flags = await Promise.all(dirs.map(isWiki))
    const wikis = dirs.filter((_, i) => flags[i])

    const groups = {}
    for (const kind of kinds) {
      const names = wikis.filter(selectors[kind])
      const roll = await Promise.all(
        names.map(async name => ({ site: name, pages: await pageCount(name) })),
      )
      roll.sort((a, b) => a.site.localeCompare(b.site))
      groups[kind] = roll
    }

    res.json({ origin, parentDomain, groups })
  })
}

export { startServer }
