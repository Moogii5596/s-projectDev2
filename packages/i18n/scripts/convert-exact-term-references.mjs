import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const langs = ['mn', 'en', 'zh']

async function loadJson(file) {
  const source = await readFile(path.join(root, file), 'utf8')
  if (file.startsWith('terms.')) {
    const seen = new Set()
    for (const [, key] of source.matchAll(/^\s*"([^"\\]+)"\s*:/gm)) {
      if (seen.has(key)) throw new Error(`Duplicate term key in ${file}: ${key}`)
      seen.add(key)
    }
  }
  return JSON.parse(source)
}

function termReferences(text) {
  return [...text.matchAll(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g)].map((match) => match[1])
}

function findOccurrences(text, term) {
  const indexes = []
  let from = 0
  while (true) {
    const index = text.indexOf(term, from)
    if (index < 0) return indexes
    const hasHan = /\p{Script=Han}/u.test(term)
    const isWord = (char) => char !== '' && /[\p{L}\p{N}_]/u.test(char)
    const before = text[index - 1] ?? ''
    const after = text[index + term.length] ?? ''
    if (hasHan || (!isWord(before) && !isWord(after))) indexes.push(index)
    from = index + term.length
  }
}

function overlaps(index, term, spans) {
  const end = index + term.length
  return spans.some(([start, spanEnd]) => index < spanEnd && start < end)
}

function resolveTerms(text, terms) {
  return text.replace(/\$t\((term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/g, (match, key) => terms[key] ?? match)
}

function maskTermReferences(text) {
  return text.replace(/\$t\(term\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\)/g, (match) => '\0'.repeat(match.length))
}

const web = Object.fromEntries(await Promise.all(langs.map(async (lang) => [
  lang,
  await loadJson(`web.${lang}.json`),
])))
const terms = Object.fromEntries(await Promise.all(langs.map(async (lang) => [
  lang,
  await loadJson(`terms.${lang}.json`),
])))

const webKeys = Object.keys(web.mn).sort()
for (const lang of langs) {
  if (Object.keys(web[lang]).sort().join('\n') !== webKeys.join('\n')) {
    throw new Error(`Web translation keys do not match for ${lang}`)
  }
  if (Object.keys(terms[lang]).sort().join('\n') !== Object.keys(terms.mn).sort().join('\n')) {
    throw new Error(`Term keys do not match for ${lang}`)
  }
}

const converted = Object.fromEntries(langs.map((lang) => [lang, { ...web[lang] }]))
let convertedKeys = 0
let convertedReferences = 0
const conversionSummary = []
const entities = [...new Set(Object.keys(terms.mn).map((key) => key.split('.')[1]))]

for (const key of webKeys) {
  for (const lang of langs) {
    if (typeof web[lang][key] !== 'string') continue
    const unresolved = termReferences(web[lang][key]).filter((reference) => !(reference in terms[lang]))
    if (unresolved.length > 0) throw new Error(`Unknown term reference in ${lang}:${key}: ${unresolved.join(', ')}`)
  }
  const originals = Object.fromEntries(langs.map((lang) => [
    lang,
    typeof web[lang][key] === 'string' ? resolveTerms(web[lang][key], terms[lang]) : web[lang][key],
  ]))
  const searchable = Object.fromEntries(langs.map((lang) => [
    lang,
    typeof web[lang][key] === 'string' ? maskTermReferences(web[lang][key]) : '',
  ]))
  const convertibleLangs = langs.filter((lang) => typeof web[lang][key] === 'string')
  const replacements = Object.fromEntries(langs.map((lang) => [lang, []]))

  if (convertibleLangs.length > 0) {
    const spans = Object.fromEntries(langs.map((lang) => [lang, []]))
    const candidateEntities = entities.map((entity) => {
      const candidates = Object.fromEntries(langs.map((lang) => [
        lang,
        Object.keys(terms[lang])
          .filter((termKey) => termKey.startsWith(`term.${entity}.`))
          .flatMap((termKey) => findOccurrences(searchable[lang], terms[lang][termKey]).map((index) => ({
            index,
            text: terms[lang][termKey],
            reference: termKey,
            form: termKey.slice(`term.${entity}.`.length),
          })))
          .sort((a, b) => b.text.length - a.text.length || (a.form === 'nom' ? -1 : b.form === 'nom' ? 1 : a.reference.localeCompare(b.reference))),
      ]))
      return { entity, candidates }
    }).filter(({ candidates }) => convertibleLangs.some((lang) => candidates[lang].length > 0))

    candidateEntities.sort((a, b) => {
      const length = (candidate) =>
        Math.min(...convertibleLangs.filter((lang) => candidate.candidates[lang].length > 0).map((lang) => candidate.candidates[lang][0].text.length))
      return length(b) - length(a) || a.entity.localeCompare(b.entity)
    })

    for (const { candidates } of candidateEntities) {
      for (const lang of convertibleLangs) {
        for (const candidate of candidates[lang]) {
          if (overlaps(candidate.index, candidate.text, spans[lang])) continue
          spans[lang].push([candidate.index, candidate.index + candidate.text.length])
          replacements[lang].push(candidate)
        }
      }
    }

    for (const lang of convertibleLangs) {
      let result = web[lang][key]
      for (const replacement of replacements[lang].sort((a, b) => b.index - a.index)) {
        result = `${result.slice(0, replacement.index)}$t(${replacement.reference})${result.slice(replacement.index + replacement.text.length)}`
      }
      converted[lang][key] = result
      if (result !== web[lang][key]) convertedReferences += replacements[lang].length
    }
  }

  if (langs.some((lang) => converted[lang][key] !== web[lang][key])) {
    convertedKeys++
    conversionSummary.push(`${key}: ${[...new Set(langs.flatMap((lang) => replacements[lang].map((item) => item.reference)))].join(', ')}`)
  }
  for (const lang of langs) {
    const after = typeof converted[lang][key] === 'string' ? resolveTerms(converted[lang][key], terms[lang]) : converted[lang][key]
    if (JSON.stringify(after) !== JSON.stringify(originals[lang])) {
      throw new Error(`Default text changed during conversion: ${lang}:${key}`)
    }
  }
}

const linkedKeys = new Set()
let linkedReferences = 0
for (const lang of langs) {
  for (const [key, value] of Object.entries(converted[lang])) {
    if (typeof value !== 'string') continue
    const references = termReferences(value)
    if (references.length > 0) linkedKeys.add(key)
    linkedReferences += references.length
  }
}
console.log(`Output-preserving conversion candidates: ${convertedKeys} keys, ${convertedReferences} references`)
console.log(`Term references present after conversion: ${linkedKeys.size} keys, ${linkedReferences} references`)
console.log(`Verified resolved text before and after conversion for ${webKeys.length * langs.length} locale values`)
for (const item of conversionSummary) console.log(item)
if (process.argv.includes('--write')) {
  await Promise.all(langs.map((lang) =>
    writeFile(path.join(root, `web.${lang}.json`), `${JSON.stringify(converted[lang], null, 2)}\n`),
  ))
  console.log('Updated web.mn.json, web.en.json, and web.zh.json')
} else {
  console.log('Dry run only. Pass --write to apply after reviewing the diff.')
}
