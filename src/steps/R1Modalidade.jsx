import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'

export default function R1Modalidade({ form, upd, next, prev }) {
  const tipoConfig = TIPOS_REGISTRO[form.tipo]

  // DISCIPLINAR pula essa etapa (sempre INDIVIDUAL)
  if (tipoConfig?.apenasIndividual) {
    next()
    return null
  }

  const selecionar = (modalidade) => {
    upd('modalidade', modalidade)
    next()
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          background: tipoConfig?.bg, border: `1.5px solid ${tipoConfig?.border}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>{tipoConfig?.emoji}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: tipoConfig?.color }}>
            {tipoConfig?.label}
          </span>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
          Qual a modalidade?
        </h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Quantos eletricistas participarão do registro?
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(MODALIDADES).map(([key, mod]) => (
          <button
            key={key}
            onClick={() => selecionar(key)}
            style={{
              background: form.modalidade === key ? '#eff6ff' : '#fff',
              border: `2px solid ${form.modalidade === key ? '#2563eb' : '#e2e8f0'}`,
              borderRadius: 14,
              padding: '20px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: form.modalidade === key ? '#dbeafe' : '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, flexShrink: 0,
            }}>
              {mod.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: form.modalidade === key ? '#1d4ed8' : '#1e293b', marginBottom: 2 }}>
                {mod.label}
              </p>
              <p style={{ fontSize: 13, color: '#64748b' }}>{mod.descricao}</p>
            </div>
            <div style={{ fontSize: 20, color: form.modalidade === key ? '#2563eb' : '#cbd5e1' }}>›</div>
          </button>
        ))}
      </div>

      <button onClick={prev} style={{
        marginTop: 20, width: '100%', padding: 13, borderRadius: 10,
        border: '1px solid #e2e8f0', background: '#f8fafc',
        color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>← Voltar</button>
    </div>
  )
}
