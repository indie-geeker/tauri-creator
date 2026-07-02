import { invoke } from '@tauri-apps/api/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type DatabaseHealth = {
  status: 'ok'
  driver: 'sqlite'
  path: string
  fileBacked: boolean
}

export type Note = {
  id: number
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

export type CreateNoteInput = {
  title: string
  body: string
}

export type UpdateNoteInput = {
  id: number
  title: string
  body: string
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  return invoke<DatabaseHealth>('get_database_health')
}

export async function listNotes(): Promise<Note[]> {
  return invoke<Note[]>('list_notes')
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  return invoke<Note>('create_note', { input })
}

export async function updateNote(input: UpdateNoteInput): Promise<Note> {
  return invoke<Note>('update_note', { input })
}

export async function deleteNote(id: number): Promise<void> {
  return invoke<void>('delete_note', { id })
}

export const sqliteQueryKeys = {
  all: ['sqlite'] as const,
  health: () => [...sqliteQueryKeys.all, 'health'] as const,
  notes: () => [...sqliteQueryKeys.all, 'notes'] as const,
}

export function useDatabaseHealth() {
  return useQuery({
    queryKey: sqliteQueryKeys.health(),
    queryFn: getDatabaseHealth,
  })
}

export function useNotes() {
  return useQuery({
    queryKey: sqliteQueryKeys.notes(),
    queryFn: listNotes,
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createNote,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.notes() })
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.health() })
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateNote,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.notes() })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.notes() })
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.health() })
    },
  })
}
