import { useEffect, useState } from 'react'
import { TIPOS_ACAO_SESMT } from '../../data/sesmt_config.js'
import { listarMotivosSesmt } from '../../lib/sesmt.js'

export default function SS1Identificacao({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_ACAO_SESMT[form.tipo]
  const [motivos, setMotivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [motivoOutro, setMotivoOutro] = useState(false)

  useEffect(() => {
    listarMotivosSesmt(form.tipo)
      .then(setMotivos)
      .catch(() => setMotivos([]))
      .finally(() => setLoading(false))
  }, [form.tipo])

  const onSelecionarMotivo = (v) => {
    if (v === 'OUTROS') {
      setMotivoOutro(true)
      upd('motivo', '')
    } else {
      setMotivoOutro(false)
      upd('motivo', v)
    }
  }

  const podeProsseguir = form.tema.trim() && form.motivo.trim()

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>{tipoConfig?.emoji}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: tipoConfig?.color }}>{tipoConfig?.label}</span>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 16 }}>Identificação</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Data</label>
          <input type="date" value={form.data} onChange={e => upd('data', e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Hora</label>
          <input type="time" value={form.hora} onChange={e => upd('hora', e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Tema / Pauta *</label>
        <input value={form.tema} onChange={e => upd('tema', e.target.value.toUpperCase())}
          placeholder="Ex: Uso correto de EPI em serviços com risco elétrico"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Motivo *</label>
        {loading ? (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Carregando motivos...</p>
        ) : (
          <select
            value={motivoOutro ? 'OUTROS' : form.motivo}
            onChange={e => onSelecionarMotivo(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', background: '#fff' }}
          >
            <option value="">Selecione...</option>
            {motivos.map(m => <option key={m.id} value={m.motivo}>{m.motivo}</option>)}
          </select>
        )}
        {motivoOutro && (
          <input value={form.motivo} onChange={e => upd('motivo', e.target.value.toUpperCase())}
            placeholder="Descreva o motivo"
            style={{ width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 6 }}>Observação (opcional)</label>
        <textarea value={form.observacao} onChange={e => upd('observacao', e.target.value.toUpperCase())}
          rows={3} placeholder="Detalhes adicionais, se houver"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <button onClick={next} disabled={!podeProsseguir} style={{
        width: '100%', padding: 14, borderRadius: 12, border: 'none',
        background: podeProsseguir ? '#1e3a5f' : '#e2e8f0', color: podeProsseguir ? '#fff' : '#94a3b8',
        fontSize: 15, fontWeight: 700, cursor: podeProsseguir ? 'pointer' : 'not-allowed', marginBottom: 10,
      }}>Continuar →</button>
      <button onClick={prev} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>← Voltar</button>
    </div>
  )
}
