/**
 * v0.2.0 §0.7 — Unit тест монгол хэлээр (анхдагч). Node 22-ийн `navigator.languages` (en-US) хэлийг өөрчлөхгүй.
 * Тодорхой хэл хэрэгтэй тест өөрөө `setLanguage(...)` хийж, дараа нь буцаана.
 */
import { beforeEach } from 'vitest'
import i18n from '../i18n'

beforeEach(async () => {
  await i18n.changeLanguage('mn')
})
