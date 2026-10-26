import { TIPOS_REGISTRO } from '../data/registros_config.js'
import { temPermissao } from '../lib/auth.js'

export default function R0TipoRegistro({ form, upd, next, onAbrirOcorrencia, onAbrirReincidencia, onAbrirOcorrenciaGenerica, usuarioLogado }) {
  // Mesma restrição por tipo usada em RegistrosOperacionais.jsx (permissão
  // `registro_tipo_<TIPO>`, por perfil) — sem nenhuma marcada, mostra todos
  // os tipos (comportamento de sempre); com pelo menos uma, só esses tipos
  // aparecem pra escolher aqui também.
  const TIPOS_TODOS = [...Object.keys(TIPOS_REGISTRO), 'OCORRENCIA', 'REINCIDENCIA', 'OCORRENCIA_GENERICA']
  const permitidos = TIPOS_TODOS.filter(t => temPermissao(usuarioLogado, `registro_tipo_${t}`))
  const tiposPermitidos = permitidos.length > 0 ? permitidos : null
  const podeMostrar = tipo => !tiposPermitidos || tiposPermitidos.includes(tipo)
  const selecionar = (tipo) => {
    upd('tipo', tipo)
    upd('motivo', '') // reset motivo — a lista de opções depende do tipo
    // DISCIPLINAR é sempre individual
    if (TIPOS_REGISTRO[tipo].apenasIndividual) {
      upd('modalidade', 'INDIVIDUAL')
    } else {
      upd('modalidade', '') // reset modalidade
    }
    next()
  }

  return (
    <div style={{ padding: '0 0 80px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>
          Qual tipo de registro?
        </h2>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Selecione o tipo de atividade a registrar
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(TIPOS_REGISTRO).filter(([key]) => podeMostrar(key)).map(([key, tipo]) => (
          <button
            key={key}
            onClick={() => selecionar(key)}
            style={{
              background: form.tipo === key ? tipo.bg : '#fff',
              border: `2px solid ${form.tipo === key ? tipo.color : '#e2e8f0'}`,
              borderRadius: 14,
              padding: '16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: tipo.bg, border: `1.5px solid ${tipo.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0,
            }}>
              {tipo.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tipo.color, marginBottom: 2 }}>
                {tipo.label}
              </p>
              <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                {tipo.descricao}
              </p>
              {tipo.apenasIndividual && (
                <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: 6, fontWeight: 700, marginTop: 4, display: 'inline-block' }}>
                  Apenas individual
                </span>
              )}
            </div>
            <div style={{ fontSize: 18, color: form.tipo === key ? tipo.color : '#cbd5e1' }}>›</div>
          </button>
        ))}

        {/* Tratamento de Retrabalho — não é um "registro" comum: em vez de
            seguir modalidade/participantes/checklist, abre um fluxo
            simplificado à parte (ver AberturaOcorrencia.jsx) e direciona
            para um fiscal tratar em Tratamento de Não Conformidades. É o
            tipo_ocorrencia 'OCORRENCIA' original, só renomeado/restilizado —
            ver seção 4.5 do CLAUDE.md. */}
        {podeMostrar('OCORRENCIA') && (
        <button
          onClick={onAbrirOcorrencia}
          style={{
            background: '#fff', border: '2px solid #c7d2fe', borderRadius: 14,
            padding: '16px', textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#eef2ff', border: '1.5px solid #c7d2fe',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            🔧
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#4338ca', marginBottom: 2 }}>
              Tratamento de Retrabalho
            </p>
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
              Relate um serviço que precisou ser refeito e direcione para o fiscal tratar
            </p>
          </div>
          <div style={{ fontSize: 18, color: '#4338ca' }}>›</div>
        </button>
        )}

        {/* Abertura de Ocorrência (genérica) — cópia preservada do fluxo
            original (com Motivo), à parte do Tratamento de Retrabalho acima
            — ver nota no CLAUDE.md, seção 4.5. Sem opção de lote/planilha:
            isso é específico do Retrabalho (extração TOA). */}
        {podeMostrar('OCORRENCIA_GENERICA') && (
        <button
          onClick={onAbrirOcorrenciaGenerica}
          style={{
            background: '#fff', border: '2px solid #c7d2fe', borderRadius: 14,
            padding: '16px', textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#eef2ff', border: '1.5px solid #c7d2fe',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            📦
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#4338ca', marginBottom: 2 }}>
              Abertura de Ocorrência
            </p>
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
              Relate um problema (ex: devolução de material não realizada) e direcione para o fiscal tratar
            </p>
          </div>
          <div style={{ fontSize: 18, color: '#4338ca' }}>›</div>
        </button>
        )}

        {/* Tratamento de Reincidência — mesma lógica de "fluxo à parte" da
            Abertura de Ocorrência acima (ver TratamentoReincidencia.jsx). */}
        {podeMostrar('REINCIDENCIA') && (
        <button
          onClick={onAbrirReincidencia}
          style={{
            background: '#fff', border: '2px solid #fed7aa', borderRadius: 14,
            padding: '16px', textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: '#fff7ed', border: '1.5px solid #fed7aa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            🔁
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#c2410c', marginBottom: 2 }}>
              Tratamento de Reincidência
            </p>
            <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
              Área com desligamentos repetidos (OE/ABRG/PDF/AL) e direcione para o fiscal tratar
            </p>
          </div>
          <div style={{ fontSize: 18, color: '#c2410c' }}>›</div>
        </button>
        )}
      </div>
    </div>
  )
}
