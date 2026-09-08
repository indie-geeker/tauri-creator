import { commands } from '@/lib/tauri-bindings'
import { unwrapCommandResult } from '@/lib/command-result'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type {
  DatabaseHealth,
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  ListNotesInput,
  NotePage,
  NoteSummary,
  NoteCursor,
} from '@/lib/tauri-bindings'
import type {
  DatabaseHealth,
  Note,
  CreateNoteInput,
  UpdateNoteInput,
  ListNotesInput,
  NotePage,
} from '@/lib/tauri-bindings'

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  return unwrapCommandResult(commands.getDatabaseHealth())
}

export async function listNotes(input: ListNotesInput = {}): Promise<NotePage> {
  return unwrapCommandResult(commands.listNotes(input))
}

export async function getNote(id: string): Promise<Note> {
  return unwrapCommandResult(commands.getNote(id))
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  return unwrapCommandResult(commands.createNote(input))
}

export async function updateNote(input: UpdateNoteInput): Promise<Note> {
  return unwrapCommandResult(commands.updateNote(input))
}

export async function deleteNote(id: string): Promise<void> {
  await unwrapCommandResult(commands.deleteNote(id))
}

export const sqliteQueryKeys = {
  all: ['sqlite'] as const,
  health: () => [...sqliteQueryKeys.all, 'health'] as const,
  notes: () => [...sqliteQueryKeys.all, 'notes'] as const,
  page: (input: ListNotesInput) => [...sqliteQueryKeys.notes(), input] as const,
  note: (id: string) => [...sqliteQueryKeys.all, 'note', id] as const,
}

export function useDatabaseHealth() {
  return useQuery({
    queryKey: sqliteQueryKeys.health(),
    queryFn: getDatabaseHealth,
  })
}

export function useNotes(input: ListNotesInput = {}) {
  return useQuery({
    queryKey: sqliteQueryKeys.page(input),
    queryFn: () => listNotes(input),
  })
}

export function useNote(id: string) {
  return useQuery({
    queryKey: sqliteQueryKeys.note(id),
    queryFn: () => getNote(id),
    enabled: id.length > 0,
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
    onSuccess: note => {
      queryClient.setQueryData(sqliteQueryKeys.note(note.id), note)
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.notes() })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteNote,
    onSuccess: (_, id) => {
      queryClient.removeQueries({
        queryKey: sqliteQueryKeys.note(id),
        exact: true,
      })
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.notes() })
      void queryClient.invalidateQueries({ queryKey: sqliteQueryKeys.health() })
    },
  })
}
