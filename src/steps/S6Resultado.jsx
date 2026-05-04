import { CHECKLISTS, CAT_META, calcNota, getStatus, FORM_INICIAL } from '../data/checklists.js'
import { InfoRow, StatCard } from '../components/Shared.jsx'

export default function S6Resultado({ form, setForm, setStep }) {
  const nota = calcNota(form)
  const st = getStatus(nota)
  const tipo = form.produtivo ? 'PRODUTIVO' : 'IMPRODUTIVO'
  const cl = CHECKLISTS[form.tipoServico]?.[tipo]
  const items = cl?.items || []
  const sim = items.filter(i => form.respostas[i.id] === true).length
  const nao = items.filter(i => form.respostas[i.id] === false).length
  const ncItems = items.filter(i => form.respostas[i.id] === false)

  // Stats por categoria
  const cats = ['COMPORTAMENTO', 'QUALIDADE', 'DESEMPENHO']
  const catStats = cats.map(cat => {
    const catItems = items.filter(i => i.cat === cat)
    const catSim = catItems.filter(i => form.respostas[i.id] === true).length
    const pct = catItems.length > 0 ? Math.round(catSim / catItems.length * 100) : 0
    return { cat, total: catItems.length, sim: catSim, pct }
  }).filter(c => c.total > 0)

  const nova = () => {
    setForm(FORM_INICIAL())
    setStep(0)
  }

  const catBarColor = pct => pct >= 90 ? '#16a34a' : pct >= 80 ? '#d97706' : '#dc2626'

  return (
    <div className="print-area">
      {/* STATUS PRINCIPAL */}
      <div
        className="result-card"
        style={{ background: st.bg, borderColor: st.border }}
      >
        <div style={{ fontSize: 50, marginBottom: 8 }}>{st.icon}</div>
        <div className="result-score" style={{ color: st.color }}>{nota.toFixed(0)}</div>
        <div style={{ fontSize: 13, color: st.color, fontWeight: 500 }}>pontos</div>
        <div className="result-label" style={{ color: st.color }}>{st.label}</div>
        <div style={{ fontSize: 12, color: st.color, marginTop: 6, opacity: 0.8 }}>
          {CHECKLISTS[form.tipoServico]?.label} — {form.produtivo ? 'Produtivo' : 'Improdutivo'}
        </div>
      </div>

      {/* CONTADORES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        <StatCard label="Conformes"   value={sim} color="#16a34a" />
        <StatCard label="Não conf."   value={nao} color="#dc2626" />
        <StatCard label="Total itens" value={items.length} color="#2563eb" />
      </div>

      {/* POR CATEGORIA */}
      <div className="card">
        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Por Categoria</p>
        {catStats.map(c => (
          <div key={c.cat} className="cat-bar">
            <div className="cat-bar-header">
              <span className={`badge ${CAT_META[c.cat].cls}`}>{CAT_META[c.cat].label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                {c.sim}/{c.total} — {c.pct}%
              </span>
            </div>
            <div className="cat-bar-track">
              <div
                className="cat-bar-fill"
                style={{ width: `${c.pct}%`, background: catBarColor(c.pct) }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* DADOS DA AUDITORIA */}
      <div className="card">
        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Dados da Auditoria</p>
        <InfoRow label="Fiscal"      value={form.fiscal} />
        <InfoRow label="Matrícula"   value={form.matricula} />
        <InfoRow label="Equipe"      value={form.prefixo} />
        <InfoRow label="OS"          value={form.os} />
        <InfoRow label="UC"          value={form.uc} />
        <InfoRow label="Endereço"    value={form.endereco} />
        <InfoRow label="Data / Hora" value={`${form.data} às ${form.hora}`} />
        {form.lat && <InfoRow label="GPS" value={`${form.lat}, ${form.lng}`} />}
        {form.nomeEletricista && <InfoRow label="Eletricista" value={form.nomeEletricista} />}
      </div>

      {/* NÃO CONFORMIDADES */}
      {ncItems.length > 0 && (
        <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>
            ❌ Itens Não Conformes ({ncItems.length})
          </p>
          {ncItems.map((item, i) => (
            <div
              key={item.id}
              style={{
                fontSize: 12, color: '#991b1b', padding: '5px 0',
                borderBottom: i < ncItems.length - 1 ? '1px solid #fecaca' : 'none',
                lineHeight: 1.5,
              }}
            >
              <strong>{i + 1}.</strong> {item.p}
            </div>
          ))}
        </div>
      )}

      {/* FEEDBACK / OBSERVAÇÕES */}
      {(form.feedback || form.observacoes) && (
        <div className="card">
          {form.feedback && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                FEEDBACK DO FISCAL:
              </p>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: form.observacoes ? 12 : 0 }}>
                {form.feedback}
              </p>
            </>
          )}
          {form.observacoes && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                OBSERVAÇÕES:
              </p>
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                {form.observacoes}
              </p>
            </>
          )}
        </div>
      )}

      {/* FOTOS */}
      {form.fotos.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Registro Fotográfico ({form.fotos.length})
          </p>
          <div className="photo-grid">
            {form.fotos.map((foto, i) => (
              <div key={i} className="photo-thumb">
                <img src={foto.url} alt={`Foto ${i + 1}`} />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  fontSize: 9, padding: '2px 4px', textAlign: 'center',
                }}>
                  Foto {i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ASSINATURA */}
      {form.assinatura && (
        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Assinatura — {form.nomeEletricista || 'Eletricista'}
          </p>
          <img
            src={form.assinatura}
            alt="Assinatura"
            style={{ width: '100%', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafafa' }}
          />
          <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
            Registrado em {form.data} às {form.hora}
          </p>
        </div>
      )}

      {/* RODAPÉ */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginBottom: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#94a3b8' }}>DPL Construções — Contrato Equatorial Energia 1021/2024</p>
        <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
          Gerado em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}
        </p>
      </div>

      {/* AÇÕES */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <button className="btn-primary" onClick={() => window.print()}
          style={{ background: '#1e3a5f' }}>
          🖨️ Imprimir
        </button>
        <button className="btn-primary" onClick={nova}
          style={{ background: '#15803d' }}>
          + Nova Auditoria
        </button>
      </div>
      <button
        className="btn-secondary no-print"
        onClick={() => setStep(3)}
        style={{ marginBottom: 40 }}
      >
        ← Voltar ao Checklist
      </button>
    </div>
  )
}
