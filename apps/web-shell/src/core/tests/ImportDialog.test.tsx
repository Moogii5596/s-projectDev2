// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../i18n'
import ImportDialog from '../ImportDialog'

beforeAll(() => {
  i18n.addResourceBundle(
    'mn',
    'translation',
    {
      'common.close': 'Хаах',
      'common.wait': 'Түр хүлээнэ үү…',
      'camp.common.status': 'Төлөв',
      'camp.import.mode.excel': 'Excel оруулах',
      'camp.import.mode.grid': 'Хүснэгтээр оруулах',
      'camp.import.grid_help': 'Excel-ээс хуулж оруулна.',
      'camp.import.add_rows': '+ 5 мөр',
      'camp.import.check': 'Шалгах',
      'camp.import.confirm': 'Баталгаажуулах ({n} мөр)',
      'camp.import.count.create': '{n} шинэ',
      'camp.import.count.update': '{n} шинэчилсэн',
      'camp.import.count.unchanged': '{n} өөрчлөлтгүй',
      'camp.import.count.error': '{n} алдаатай',
      'camp.import.done': 'Амжилттай: {created} шинэ, {updated} шинэчилсэн, {skipped} алгассан, {unchanged} өөрчлөлтгүй.',
      'camp.import.only_errors': 'Зөвхөн алдаатай',
      'camp.import.skip_errors': 'Алдаатай мөр алгасах',
      'camp.import.back': 'Буцах',
    },
    true,
    true,
  )
})

afterEach(cleanup)

describe('ImportDialog', () => {
  it('хүснэгтийн мөрийг callback-аар preview болгож, баталгаажуулалтын үр дүнг харуулна', async () => {
    const preview = {
      import: { id: 'import-1', createRows: 1, updateRows: 0, unchangedRows: 0, errorRows: 0 },
      rows: [
        {
          row: 1,
          op: 'create' as const,
          opLabel: 'Шинэ',
          values: { code: 'E1' },
          changes: {},
          errors: [],
        },
      ],
    }
    const uploadRows = vi.fn().mockResolvedValue(preview)
    const confirmImport = vi.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0, unchanged: 0 })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <ImportDialog
          title="Импорт"
          columns={[{ key: 'code', label: 'Код', required: true }]}
          invalidate={[]}
          templateFileName="items.xlsx"
          downloadTemplate={vi.fn()}
          uploadFile={vi.fn()}
          uploadRows={uploadRows}
          confirmImport={confirmImport}
          cancelImport={vi.fn()}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Хүснэгтээр оруулах' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Код 1' }), { target: { value: 'E1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Шалгах' }))

    await waitFor(() => expect(uploadRows).toHaveBeenCalledWith([{ code: 'E1' }]))
    expect(await screen.findByText('E1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Баталгаажуулах (1 мөр)' }))

    await waitFor(() => expect(confirmImport).toHaveBeenCalledWith('import-1', true))
    expect(await screen.findByText(/1 шинэ/)).toBeTruthy()
  })
})
