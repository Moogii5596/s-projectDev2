import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateMR } from '../hooks/useMR'
import type { CreateMrItemDto } from '../types/mr.types'

interface ItemRow {
  description: string     // backend: description
  quantity: string        // string → number on submit
  unitOfMeasure: string   // backend: unitOfMeasure
  notes: string
}

const emptyItem = (): ItemRow => ({
  description: '',
  quantity: '',
  unitOfMeasure: 'EA',
  notes: '',
})

export default function MRCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateMR()

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])
  const [error, setError] = useState<string | null>(null)

  const updateItem = (idx: number, field: keyof ItemRow, value: string) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)))
  }

  const addItem = () => setItems((prev) => [...prev, emptyItem()])

  const removeItem = (idx: number) => {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!title.trim()) {
      setError('Гарчиг оруулна уу')
      return
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.description.trim()) {
        setError(`${i + 1} дүгээр мөрийн нэр хоосон байна`)
        return
      }
      const qty = parseFloat(item.quantity)
      if (isNaN(qty) || qty <= 0) {
        setError(`${i + 1} дүгээр мөрийн тоо хэмжээ буруу байна`)
        return
      }
    }

    const dtoItems: CreateMrItemDto[] = items.map((row) => ({
      description: row.description.trim(),
      quantity: parseFloat(row.quantity),
      unitOfMeasure: row.unitOfMeasure.trim() || 'EA',
      notes: row.notes.trim() || undefined,
    }))

    try {
      const created = await createMutation.mutateAsync({
        title: title.trim(),
        notes: notes.trim() || undefined,
        items: dtoItems,
      })
      navigate(`/requisitions/${created.id}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Үүсгэхэд алдаа гарлаа'))
    }
  }

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/requisitions')}
        className="text-gray-400 hover:text-gray-600 text-sm mb-4 block"
      >
        ← Жагсаалт руу буцах
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-6">Шинэ материал хүсэх хуудас</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label htmlFor="mr-title" className="block text-sm font-medium text-gray-700 mb-1">
              Гарчиг <span className="text-red-500">*</span>
            </label>
            <input
              id="mr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ж.нь: Оффисийн тоног төхөөрөмж"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тайлбар</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Нэмэлт мэдээлэл (заавал биш)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Материалын жагсаалт</h2>
            <button
              type="button"
              onClick={addItem}
              className="text-blue-600 text-sm hover:underline"
            >
              + Мөр нэмэх
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {items.map((item, idx) => (
              <div key={idx} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">{idx + 1}-р мөр</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Устгах
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      Нэр <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="Материалын нэр"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Нэгж</label>
                    <input
                      type="text"
                      value={item.unitOfMeasure}
                      onChange={(e) => updateItem(idx, 'unitOfMeasure', e.target.value)}
                      placeholder="EA"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Тоо <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      placeholder="0"
                      min="0.0001"
                      step="any"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Тайлбар</label>
                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                      placeholder="Нэмэлт тайлбар (заавал биш)"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? 'Үүсгэж байна...' : '✅ MR үүсгэх'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/requisitions')}
            className="text-gray-600 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition-colors"
          >
            Болих
          </button>
        </div>
      </form>
    </div>
  )
}
