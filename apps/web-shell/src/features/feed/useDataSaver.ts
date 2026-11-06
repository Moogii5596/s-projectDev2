import { useCallback, useState } from 'react'

export const DATA_SAVER_KEY = 'feed.dataSaver'

/** Хадгалсан сонголт → байхгүй бол браузерын Save-Data → false */
export function readDataSaver(): boolean {
  try {
    const v = localStorage.getItem(DATA_SAVER_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    /* хувийн цонх — анхдагч руу */
  }
  const conn = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | (Navigator & { connection?: { saveData?: boolean } })
    | undefined
  return conn?.connection?.saveData === true
}

export function useDataSaver(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(readDataSaver)
  const set = useCallback((v: boolean) => {
    setValue(v)
    try {
      localStorage.setItem(DATA_SAVER_KEY, v ? '1' : '0')
    } catch {
      /* санахгүй ч ажиллана */
    }
  }, [])
  return [value, set]
}
