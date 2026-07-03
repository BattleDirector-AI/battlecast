/* Profile store: one JSON file per named profile under `<dataDir>/profiles`. No
 * database — files are inspectable, diffable, and git-committable for the static
 * deploy path (mirrors rF2's file-based config ethos). Names are validated by the
 * router (assertProfileName) before reaching here, so they can't traverse. */

import { promises as fs } from 'node:fs'
import path from 'node:path'

export function createProfileStore(dataDir) {
  const dir = path.join(dataDir, 'profiles')
  const fileFor = (name) => path.join(dir, `${name}.json`)

  return {
    dir,

    /** Sorted list of profile names (without the `.json`). */
    async list() {
      try {
        const entries = await fs.readdir(dir)
        return entries
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length))
          .sort()
      } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
      }
    },

    /** Parsed profile JSON, or null if it does not exist. */
    async read(name) {
      try {
        return JSON.parse(await fs.readFile(fileFor(name), 'utf8'))
      } catch (err) {
        if (err.code === 'ENOENT') return null
        throw err
      }
    },

    /** Persist a profile, creating the dir on first write. Returns true if the
     *  profile already existed (so the caller can answer 200 vs 201). */
    async write(name, obj) {
      await fs.mkdir(dir, { recursive: true })
      let existed = true
      try {
        await fs.access(fileFor(name))
      } catch {
        existed = false
      }
      await fs.writeFile(fileFor(name), `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
      return existed
    },

    /** Delete a profile. Returns true if it existed, false if there was nothing
     *  to delete (so the caller can answer 200 vs 404). */
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
