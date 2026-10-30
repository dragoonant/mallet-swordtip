#!/usr/bin/env -S npx tsx
// Validates every JSON file under src/data/** against the schema its path implies (the
// directory/filename convention is documented in src/data/README.md). Run: `npm run validate:data`.
//
// The classification and Ajv wiring here are also exported so tests/data/validate.test.ts can run
// the identical checks inside vitest.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import { schemas } from '../src/data/schema'
import { schemaForDataPath } from '../src/data/paths'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA_ROOT = join(__dirname, '..', 'src', 'data')

export interface FileReport {
  /** Path relative to src/data/, forward-slashed. */
  file: string
  schema: string | null
  ok: boolean
  errors: string[]
}

/** Recursively lists every `*.json` file under `root`, excluding the `schema/` directory. */
export function collectJsonFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'schema') continue // schema definitions, not data instances
        walk(join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        out.push(join(dir, entry.name))
      }
    }
  }
  if (statSync(root, { throwIfNoEntry: false })?.isDirectory()) walk(root)
  return out.sort()
}

/** Builds one Ajv instance with every schema in src/data/schema registered by its `$id`. */
export function createValidator(): InstanceType<typeof Ajv2020> {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true })
  addFormats(ajv)
  for (const schema of Object.values(schemas)) ajv.addSchema(schema)
  return ajv
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return []
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
}

export function validateDataFile(
  ajv: InstanceType<typeof Ajv2020>,
  absPath: string,
  relPath: string,
): FileReport {
  const kind = schemaForDataPath(relPath)
  if (!kind) {
    return {
      file: relPath,
      schema: null,
      ok: false,
      errors: ['no schema mapping for this path — see the layout in src/data/README.md'],
    }
  }

  const schema = schemas[kind]
  const validateFn = ajv.getSchema(schema.$id as string) as ValidateFunction | undefined
  if (!validateFn) {
    throw new Error(`schema "${kind}" is not registered under $id ${schema.$id}`)
  }

  let data: unknown
  try {
    data = JSON.parse(readFileSync(absPath, 'utf8'))
  } catch (err) {
    return { file: relPath, schema: kind, ok: false, errors: [`invalid JSON: ${(err as Error).message}`] }
  }

  const schemaOk = Boolean(validateFn(data))
  const errors = schemaOk ? [] : formatErrors(validateFn.errors)
  if (kind === 'combatPatrol') errors.push(...checkUnitChoices(data))
  return { file: relPath, schema: kind, ok: errors.length === 0, errors }
}

/** Cross-reference check for a combat patrol's unitChoices (faction spec §7.1 E1). */
export function checkUnitChoices(data: unknown): string[] {
  const d = data as { units?: { ref?: string }[]; unitChoices?: { id: string; refs: string[]; default: string }[] }
  const groups = d?.unitChoices
  if (!Array.isArray(groups)) return []
  const errors: string[] = []
  const unitRefs = new Set((d.units ?? []).map((u) => u.ref))
  const ids = new Set<string>()
  const owner = new Map<string, string>()
  for (const g of groups) {
    if (ids.has(g.id)) errors.push(`unitChoices: duplicate group id "${g.id}"`)
    ids.add(g.id)
    for (const r of g.refs ?? []) {
      if (!unitRefs.has(r)) errors.push(`unitChoices "${g.id}": ref "${r}" is not in units[].ref`)
      const prev = owner.get(r)
      if (prev !== undefined && prev !== g.id) errors.push(`unitChoices: ref "${r}" belongs to both "${prev}" and "${g.id}"`)
      owner.set(r, g.id)
    }
    if (!(g.refs ?? []).includes(g.default)) errors.push(`unitChoices "${g.id}": default "${g.default}" is not one of refs`)
  }
  return errors
}

/** Records by id across the whole data tree, for the cross-file checks below. */
export interface DataIndex {
  datasheets: Record<string, { spearhead?: boolean; composition?: { weapons?: { default?: string[]; options?: { with?: string[] }[] } }[]; abilities?: unknown[] }>
  weapons: Record<string, { wound?: number; rend?: number }>
  abilities: Record<string, unknown>
  enhancements: Record<string, unknown>
}

/** Parses every data file once and indexes the array-file kinds by id. */
export function buildDataIndex(root: string = DATA_ROOT): DataIndex {
  const idx: DataIndex = { datasheets: {}, weapons: {}, abilities: {}, enhancements: {} }
  for (const abs of collectJsonFiles(root)) {
    const kind = schemaForDataPath(relative(root, abs).split('\\').join('/'))
    const bucket = kind === 'datasheet' ? idx.datasheets : kind === 'weapon' ? idx.weapons : kind === 'ability' ? idx.abilities : kind === 'enhancement' ? idx.enhancements : null
    if (!bucket) continue
    try {
      for (const item of JSON.parse(readFileSync(abs, 'utf8')) as { id: string }[]) (bucket as Record<string, unknown>)[item.id] = item
    } catch {
      // reported by validateDataFile
    }
  }
  return idx
}

/**
 * Spearhead army rules the JSON Schema cannot express (SPH-2.1, 2.3, 2.4, 13.7): the general is one of the units, every
 * datasheet is a Spearhead warscroll with Wound / Rend on its weapons, and every referenced id resolves.
 */
export function checkSpearheadArmy(data: unknown, idx: DataIndex): string[] {
  const d = data as {
    mode?: string; warlord?: string; units?: { ref: string; datasheet: string; reserve?: { ability: string } }[]
    battleTraits?: string[]; regimentAbilities?: { id: string; default: boolean }[]; enhancements?: { id: string; default: boolean }[]
  }
  if (d?.mode !== 'spearhead') return []
  const errors: string[] = []
  const units = d.units ?? []
  const refs = units.map((u) => u.ref)
  if (new Set(refs).size !== refs.length) errors.push('spearhead: duplicate unit refs')
  if (!refs.includes(d.warlord ?? '')) errors.push(`spearhead: general "${d.warlord}" is not one of the units (SPH-2.1)`)
  if ((d.regimentAbilities ?? []).length !== 2) errors.push('spearhead: exactly 2 regiment abilities (SPH-2.3)')
  if ((d.enhancements ?? []).length !== 4) errors.push('spearhead: exactly 4 enhancements (SPH-2.4)')
  if ((d.regimentAbilities ?? []).filter((r) => r.default).length !== 1) errors.push('spearhead: exactly one default regiment ability')
  if ((d.enhancements ?? []).filter((e) => e.default).length !== 1) errors.push('spearhead: exactly one default enhancement')
  const needAbility = (id: string, where: string) => { if (!(id in idx.abilities)) errors.push(`spearhead: ${where} ability "${id}" does not exist`) }
  for (const id of d.battleTraits ?? []) needAbility(id, 'battle trait')
  for (const r of d.regimentAbilities ?? []) needAbility(r.id, 'regiment')
  for (const e of d.enhancements ?? []) if (!(e.id in idx.enhancements)) errors.push(`spearhead: enhancement "${e.id}" does not exist`)
  for (const u of units) {
    const ds = idx.datasheets[u.datasheet]
    if (!ds) { errors.push(`spearhead: unit "${u.ref}" datasheet "${u.datasheet}" does not exist`); continue }
    if (ds.spearhead !== true) errors.push(`spearhead: datasheet "${u.datasheet}" is not flagged spearhead (SPH-13.7)`)
    if (u.reserve) needAbility(u.reserve.ability, `unit "${u.ref}" reserve`)
    for (const a of ds.abilities ?? []) if (typeof a === 'string') needAbility(a, `datasheet "${u.datasheet}"`)
    for (const c of ds.composition ?? []) {
      const ids = [...(c.weapons?.default ?? []), ...(c.weapons?.options ?? []).flatMap((o) => o.with ?? [])]
      for (const w of ids) {
        const wd = idx.weapons[w]
        if (!wd) errors.push(`spearhead: weapon "${w}" does not exist`)
        else if (wd.wound === undefined || wd.rend === undefined) errors.push(`spearhead: weapon "${w}" needs wound and rend`)
      }
    }
  }
  return errors
}

/** Validates every JSON data file under `root` (default `src/data/`). Trivially empty when there is no data yet. */
export function validateAllData(root: string = DATA_ROOT): FileReport[] {
  const ajv = createValidator()
  const idx = buildDataIndex(root)
  const reports = collectJsonFiles(root).map((abs) => validateDataFile(ajv, abs, relative(root, abs).split('\\').join('/')))
  for (const r of reports) {
    if (r.schema !== 'combatPatrol' || !r.ok) continue
    const data: unknown = JSON.parse(readFileSync(join(root, r.file), 'utf8'))
    r.errors.push(...checkSpearheadArmy(data, idx))
    r.ok = r.errors.length === 0
  }
  return reports
}

function main(): void {
  const reports = validateAllData()
  let failed = 0
  for (const r of reports) {
    if (r.ok) {
      console.log(`PASS  ${r.file}  (${r.schema})`)
    } else {
      failed += 1
      console.log(`FAIL  ${r.file}${r.schema ? `  (${r.schema})` : ''}`)
      for (const e of r.errors) console.log(`      ${e}`)
    }
  }
  console.log(`\n${reports.length} file(s) checked, ${failed} failed.`)
  process.exit(failed > 0 ? 1 : 0)
}

const invokedDirectly = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url
if (invokedDirectly) main()
