import { MainWindow } from './components/layout/MainWindow'

type AppContentProps = {
  message?: string
  setMessage?: unknown
}

export function AppContent({ message = 'Ready' }: AppContentProps) {
  return <MainWindow status={message} />
}
