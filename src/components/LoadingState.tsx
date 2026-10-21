import Spinner from './Spinner'

export default function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading-state">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
