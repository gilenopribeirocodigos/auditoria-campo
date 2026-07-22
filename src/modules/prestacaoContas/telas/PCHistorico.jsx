import { useEffect, useState } from 'react'
import { listarHistorico, obterNomeUsuario } from '../lib/prestacaoContas.js'

const CONFIG_TIPO = {
  ENVIO:     { icone: '📤', label: 'Enviado',   cor: '#1d4ed8' },
  APROVACAO: { icone: '✅', label: 'Aprovado',  cor: '#15803d' },
  REJEICAO:  { icone: '↩️', label: 'Rejeitado', cor: '#b91c1c' },
}

export default function PCHistorico({ prestacaoId }) {
  const [carregando, setCarregando] = useState(true)
  const [eventos, setEventos] = useState([])

  useEffect(() => {
    (async () => {
      try {
        const lista = await listarHistorico(prestacaoId)
        const nomesCache = {}
        const comNomes = []
        for (const ev of lista) {
          if (!nomesCache[ev.usuario_id]) {
            nomesCache[ev.usuario_id] = await obterNomeUsuario(ev.usuario_id).catch(() => '—')
          }
          comNomes.push({ ...ev, usuarioNome: nomesCache[ev.usuario_id] })
        }
        setEventos(comNomes)
      } catch {
        setEventos([])
      } finally {
        setCarregando(false)
      }
    })()
  }, [prestacaoId])

  if (carregando) return <p style={{ fontSize: 11, color: '#94a3b8' }}>Carregando histórico...</p>
  if (eventos.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {eventos.map(ev => {
        const cfg = CONFIG_TIPO[ev.tipo] || { icone: '•', label: ev.tipo, cor: '#64748b' }
        return (
          <div key={ev.id} style={{ borderLeft: `3px solid ${cfg.cor}`, paddingLeft: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: cfg.cor }}>
              {cfg.icone} {cfg.label} — {ev.rodada}ª rodada
            </p>
            <p style={{ fontSize: 11, color: '#64748b' }}>
              {ev.usuarioNome} · {new Date(ev.criado_em).toLocaleString('pt-BR')}
            </p>
            {ev.motivo && (
              <p style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>"{ev.motivo}"</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
