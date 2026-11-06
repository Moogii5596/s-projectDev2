// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../../api/client'
import { feedbackApi } from '../api'

vi.mock('../../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('feedback attachments API', () => {
  it('images талбарт multipart файлуудыг 120 секундийн timeout-тай илгээнэ', async () => {
    const files = [new File(['one'], 'one.png', { type: 'image/png' }), new File(['two'], 'two.png', { type: 'image/png' })]
    vi.mocked(apiClient.post).mockResolvedValue({ data: [] } as never)

    await feedbackApi.addAttachments('feedback-id', files)

    const [url, form, config] = vi.mocked(apiClient.post).mock.calls[0]!
    expect(url).toBe('/api/v1/core/feedback/feedback-id/attachments')
    expect((form as FormData).getAll('images')).toEqual(files)
    expect(config).toMatchObject({ timeout: 120000, headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('attachment устгах endpoint-д 204 хүсэлт явуулна', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ status: 204 } as never)

    await feedbackApi.removeAttachment('attachment-id')

    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/core/feedback/attachments/attachment-id')
  })
})
