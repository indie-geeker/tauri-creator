import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNote,
  deleteNote,
  getDatabaseHealth,
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

  it('lists notes through the Tauri command', async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: 1,
        title: 'First note',
        body: 'Created from the generated app.',
        createdAt: '2026-06-30T00:00:00Z',
        updatedAt: '2026-06-30T00:00:00Z',
      },
    ])

    const notes = await listNotes()

    expect(invokeMock).toHaveBeenCalledWith('list_notes')
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('First note')
  })

  it('creates, updates, and deletes notes through Tauri commands', async () => {
    const created = {
      id: 1,
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
      updateNote({ id: 1, title: 'Published', body: 'Body' })
    ).resolves.toEqual(updated)
    await expect(deleteNote(1)).resolves.toBeUndefined()

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'create_note', {
      input: { title: 'Draft', body: 'Body' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'update_note', {
      input: { id: 1, title: 'Published', body: 'Body' },
    })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'delete_note', { id: 1 })
  })

  it('exports TanStack Query hooks for notes', () => {
    expect(typeof useNotes).toBe('function')
    expect(typeof useCreateNote).toBe('function')
    expect(typeof useUpdateNote).toBe('function')
    expect(typeof useDeleteNote).toBe('function')
  })
})
