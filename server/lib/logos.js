/* Logo asset store: image files under `<dataDir>/logos`, served at `/logos/<file>`.
 * Filenames are sanitized by the router (sanitizeLogoFilename) before reaching
 * here. This is the binary counterpart to the profile store — the forcing function
 * for having a server at all (a JSON blob can't hold uploads). */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { contentTypeForFile } from './validation.js'

export function createLogoStore(dataDir) {
  const dir = path.join(dataDir, 'logos')
  const fileFor = (name) => path.join(dir, name)

  return {
    dir,

    /** Sorted list of `{ name, url, size }` for every stored image. */
    async list() {
      let entries
      try {
        entries = await fs.readdir(dir)
      } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
      }
      const images = entries.filter((f) => contentTypeForFile(f) != null).sort()
      return Promise.all(
        images.map(async (name) => ({
          name,
          url: `/logos/${name}`,
          size: (await fs.stat(fileFor(name))).size,
        })),
      )
    },

    /** Write image bytes, creating the dir on first upload. */
    async save(name, buffer) {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(fileFor(name), buffer)
      return { name, url: `/logos/${name}` }
    },

    /** Read image bytes + its Content-Type, or null if absent. */
    async read(name) {
      try {
        const data = await fs.readFile(fileFor(name))
        return { data, contentType: contentTypeForFile(name) || 'application/octet-stream' }
      } catch (err) {
        if (err.code === 'ENOENT') return null
        throw err
      }
    },

    /** Delete an image. Returns false if it did not exist. */
    async remove(name) {
      try {
        await fs.unlink(fileFor(name))
        return true
      } catch (err) {
        if (err.code === 'ENOENT') return false
        throw err
      }
    },
  }
}
