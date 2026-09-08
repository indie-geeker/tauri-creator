import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNote,
  deleteNote,
  getDatabaseHealth,
  getNote,
  listNotes,
  updateNote,
  useCreateNote,
  useDeleteNote,
  useNotes,
  useUpdateNote,
} from './index'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

describe('sqlite feature', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('rejects backend string errors through generated Result commands', async () => {
    invokeMock.mockRejectedValueOnce('storage unavailable')
    await expect(listNotes()).rejects.toThrow('storage unavailable')
  })

  it('loads database health through the Tauri command', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 'ok',
      driver: 'sqlite',
      path: '/tmp/sqlite-demo/app.sqlite3',
      fileBacked: true,
    })

    const health = await getDatabaseHealth()

    expect(invokeMock).toHaveBeenCalledWith('get_database_health')
    expect(health).toEqual({
      status: 'ok',
      driver: 'sqlite',
      path: '/tmp/sqlite-demo/app.sqlite3',
      fileBacked: true,
    })
  })

  it('lists summaries with an explicit page cursor', async () => {
    const page = {
      items: [
        {
          id: '9007199254740993',
          title: 'First',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      nextCursor: { id: '9007199254740993', updatedAt: '2026-01-01' },
    }
    invokeMock.mockResolvedValueOnce(page)
    const input = {
      limit: 20,
      cursor: { id: '9007199254740994', updatedAt: '2026-01-01' },
    }
    await expect(listNotes(input)).resolves.toEqual(page)
    expect(invokeMock).toHaveBeenCalledWith('list_notes', { input })
    expect(page.items[0]).not.toHaveProperty('body')
  })

  it('fetches the body only for a selected detail', async () => {
    const detail = {
      id: '1',
      title: 'Selected',
      body: 'Body',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    invokeMock.mockResolvedValueOnce(detail)
    await expect(getNote('1')).resolves.toEqual(detail)
    expect(invokeMock).toHaveBeenCalledWith('get_note', { id: '1' })
  })

  it('creates, updates, and deletes notes through Tauri commands', async () => {
    const created = {
      id: '9007199254740993',
      title: 'Draft',
      body: 'Body',
      createdAt: '2026-06-30T00:00:00Z',
      updatedAt: '2026-06-30T00:00:00Z',
    }
    const updated = {
      ...created,
      title: 'Published',
      updatedAt: '2026-06-30T00:01:00Z',
    }
    invokeMock
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce(undefined)

    await expect(createNote({ title: 'Draft', body: 'Body' })).resolves.toEqual(
      created
    )
    await expect(
      updateNote({ id: '9007199254740993', title: 'Published', body: 'Body' })
    ).resolves.toEqual(updated)
    await expect(deleteNote('9007199254740993')).resolves.toBeUndefined()

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'create_note', {
      input: { title: 'Draft', body: 'Body' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'update_note', {
      input: { id: '9007199254740993', title: 'Published', body: 'Body' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'delete_note', {
      id: '9007199254740993',
    })
  })

  it('exports TanStack Query hooks for notes', () => {
    expect(typeof useNotes).toBe('function')
    expect(typeof useCreateNote).toBe('function')
    expect(typeof useUpdateNote).toBe('function')
    expect(typeof useDeleteNote).toBe('function')
  })
})
