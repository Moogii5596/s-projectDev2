const path = require('node:path')

const BRIDGE_TARGETS = new Map([
  ['modules/camp/api/camp-hr.bridge.ts', new Set(['hr'])],
  ['modules/camp/api/core-bridge.ts', new Set(['core'])],
  ['modules/debug/core-bridge.ts', new Set(['core'])],
  ['modules/feedback/feed-bridge.ts', new Set(['feed'])],
  ['modules/feed/module-links.bridge.ts', new Set(['camp', 'feedback', 'settings'])],
  ['modules/hr/api/camp-bridge.ts', new Set(['camp'])],
  ['modules/settings/camp-settings.bridge.ts', new Set(['camp'])],
  ['modules/settings/core-bridge.ts', new Set(['core'])],
])

function modulePath(filename) {
  const normalized = filename.replace(/\\/g, '/')
  const marker = '/modules/'
  const start = normalized.lastIndexOf(marker)
  if (start < 0) return undefined
  const [name] = normalized.slice(start + marker.length).split('/')
  return name ? { name, relativePath: normalized.slice(start + 1) } : undefined
}

function targetModule(source, filename) {
  if (source.startsWith('.')) return modulePath(path.resolve(path.dirname(filename), source))
  const normalized = source.replace(/\\/g, '/')
  const marker = 'modules/'
  const start = normalized.lastIndexOf(marker)
  if (start < 0) return undefined
  const [name] = normalized.slice(start + marker.length).split('/')
  return name ? { name } : undefined
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'prevent direct imports between frontend feature modules' },
    schema: [],
    messages: {
      crossModule: 'Feature module "{{from}}" cannot import "{{to}}" directly; expose the dependency through an explicit bridge or move shared code to core.',
      coreModule: 'The core layer cannot import feature module "{{to}}".',
    },
  },
  create(context) {
    const filename = context.getFilename()
    const sourcePath = filename.replace(/\\/g, '/')
    const from = modulePath(filename)
    const inCore = sourcePath.includes('/src/core/')
    if (!from && !inCore) return {}

    function check(sourceNode) {
      if (!sourceNode || typeof sourceNode.value !== 'string') return
      const target = targetModule(sourceNode.value, filename)
      if (!target) return
      if (inCore) {
        context.report({ node: sourceNode, messageId: 'coreModule', data: { to: target.name } })
        return
      }
      if (target.name === from.name) return
      const allowedTargets = BRIDGE_TARGETS.get(from.relativePath)
      if (allowedTargets?.has(target.name)) return
      context.report({
        node: sourceNode,
        messageId: 'crossModule',
        data: { from: from.name, to: target.name },
      })
    }

    return {
      ImportDeclaration(node) {
        check(node.source)
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source)
      },
      ExportAllDeclaration(node) {
        check(node.source)
      },
      ImportExpression(node) {
        check(node.source)
      },
      CallExpression(node) {
        if (node.callee.type === 'Import' || (node.callee.type === 'Identifier' && node.callee.name === 'require')) {
          check(node.arguments[0])
        }
      },
    }
  },
}
