// Static server for the e2e fixture site. Serves the repo root so pages can
// load the built `dist/` and `node_modules/vanilla-cookieconsent`.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = join(import.meta.dirname, '..')
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  try {
    const body = await readFile(join(root, path))
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}).listen(4173)
