/** Токен, нууц үг, имэйл, утас — Debug-ийн лог дээр нууцлах (QA-20 / D-1) */
export function maskSecrets(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1***')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '***jwt***')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)("?)[^\s",;]+/gi, '$1$2***')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1***@')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => `${m[0]}***@${m.split('@')[1]}`)
    .replace(/\b(\d{2})\d{4}(\d{2})\b/g, '$1****$2');
}
