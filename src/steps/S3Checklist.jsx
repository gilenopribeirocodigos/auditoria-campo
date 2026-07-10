import { CHECKLISTS, CAT_META, isDisqualified, isItemConforme, getChecklist, getItemsAtivos, getItemsParaCalculo } from '../data/checklists.js'
import { NavBar, Textarea } from '../components/Shared.jsx'

export default function S3Checklist({ form, upd, setForm, next, prev }) {
  const cl = getChecklist(form.tipoServico, form.tipoAuditoria, form.produtivo)
  if (!cl) return null

  // Verifica se este checklist tem o grupo condicional "débito"
  const temDebito = cl.items.some(i => i.conditionalGroup === 'debito')

  // Itens ativos consideram a resposta do "débito pago"
  const items = getItemsAtivos(cl.items, form)

  const respondidas = items.filter(i => form.respostas[i.id] !== undefined).length

  // Itens "Não se aplica" saem do cálculo — a prévia da nota já reflete isso,
  // igual ao resultado final (ver calcNota em checklists.js)
  const itemsCalculo = getItemsParaCalculo(items, form.respostas)
  const conformes   = itemsCalculo.filter(i => isItemConforme(i, itemsCalculo, form.respostas)).length
  const notaParcial = itemsCalculo.length > 0 ? Math.round(conformes / itemsCalculo.length * 100) : 0

  // Para prosseguir: todas as perguntas ativas respondidas E (se tem débito) o check respondido
  const debitoOk  = !temDebito || form.debitoPago !== null && form.debitoPago !== undefined
  const completo  = respondidas === items.length && debitoOk
  const eliminado = isDisqualified(form)

  const responder = (id, val) =>
    setForm(f => ({ ...f, respostas: { ...f.respostas, [id]: val } }))

  // Ao mudar o "débito pago":
  // - NÃO → limpa respostas dos itens 'debito' (10, 11)
  // - SIM → limpa respostas dos itens 'nao_debito' (4, 5, 6, 9)
  const responderDebito = (val) => {
    setForm(f => {
      const novasRespostas = { ...f.respostas }
      if (val === false) {
        // limpa 'debito' (10,11) e 'so_debito' (14) — não se aplicam quando NÃO
        cl.items.filter(i => i.conditionalGroup === 'debito' || i.conditionalGroup === 'so_debito').forEach(i => {
          delete novasRespostas[i.id]
        })
      } else if (val === true) {
        cl.items.filter(i => i.conditionalGroup === 'nao_debito').forEach(i => {
          delete novasRespostas[i.id]
        })
      }
      return { ...f, debitoPago: val, respostas: novasRespostas }
    })
  }

  const msgEliminado = form.tipoServico === 'CORTE'
    ? 'A equipe não executou o corte.'
    : 'A equipe não executou a atividade.'

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: '12px 14px', marginBottom: 12,
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{CHECKLISTS[form.tipoServico].label}</p>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{cl.label} · {respondidas}/{items.length} respondidas</p>
        </div>
        {respondidas > 0 && (
          <div style={{
            background: '#f0f9ff', border: '1px solid #bae6fd',
            borderRadius: 10, padding: '6px 12px', textAlign: 'center', minWidth: 60,
          }}>
            <p style={{ fontSize: 10, color: '#0369a1', fontWeight: 700 }}>PARCIAL</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#0284c7', lineHeight: 1.1 }}>{notaParcial}</p>
          </div>
        )}
      </div>

      {/* Banner eliminação */}
      {eliminado && (
        <div style={{
          background: '#450a0a', border: '2px solid #dc2626', borderRadius: 12,
          padding: '14px 16px', marginBottom: 14, textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🚫</div>
          <p style={{ color: '#fca5a5', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
            AUDITORIA — NÃO ATENDE
          </p>
          <p style={{ color: '#fecaca', fontSize: 12, lineHeight: 1.5 }}>
            {msgEliminado}<br />
            O resultado é automaticamente <strong>NÃO ATENDE</strong> independente das demais respostas.
          </p>
        </div>
      )}

      {/* Barra de progresso */}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${items.length > 0 ? respondidas / items.length * 100 : 0}%` }} />
      </div>

      {/* ── CHECK CONDICIONAL: Foi débito pago? ── */}
      {temDebito && (
        <div style={{
          background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: 12,
          padding: '14px 16px', marginBottom: 14,
        }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#1e40af', marginBottom: 4 }}>
            💰 Foi débito pago?
          </p>
          <p style={{ fontSize: 12, color: '#1e3a8a', marginBottom: 12, lineHeight: 1.5 }}>
            Se <strong>SIM</strong>, serão avaliadas as perguntas sobre comprovante e confirmação de pagamento (13 itens no total).
            Se <strong>NÃO</strong>, essas perguntas não se aplicam (11 itens no total).
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => responderDebito(true)}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 800,
                border: `2px solid ${form.debitoPago === true ? '#16a34a' : '#cbd5e1'}`,
                background: form.debitoPago === true ? '#16a34a' : '#fff',
                color: form.debitoPago === true ? '#fff' : '#64748b',
              }}>✓ SIM</button>
            <button
              onClick={() => responderDebito(false)}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 800,
                border: `2px solid ${form.debitoPago === false ? '#dc2626' : '#cbd5e1'}`,
                background: form.debitoPago === false ? '#dc2626' : '#fff',
                color: form.debitoPago === false ? '#fff' : '#64748b',
              }}>✗ NÃO</button>
          </div>
          {form.debitoPago === null && (
            <p style={{ fontSize: 11, color: '#dc2626', marginTop: 10, fontWeight: 700 }}>
              ⚠️ Responda essa pergunta para liberar o checklist completo.
            </p>
          )}
        </div>
      )}

      {/* Itens — só mostra após responder o débito (quando há débito) */}
      {(!temDebito || form.debitoPago !== null) && items.map((item, idx) => {
        const r          = form.respostas[item.id]
        const meta       = CAT_META[item.cat]
        const isElim     = item.disqualify
        const isInverted = item.inverted
        const isCond     = item.conditionalGroup === 'debito'

        const isNaoSeAplica = item.permiteNaoSeAplica && r === 'NSA'

        let isConforme, isNaoConforme, marriedWarning = ''

        if (isNaoSeAplica) {
          isConforme    = false
          isNaoConforme = false

        } else if (item.marriedGroup && item.marriedRole === 'pai') {
          isConforme    = r !== undefined
          isNaoConforme = false

        } else if (item.marriedGroup && item.marriedRole === 'filho') {
          const pai  = items.find(i => i.marriedGroup === item.marriedGroup && i.marriedRole === 'pai')
          const rPai = pai ? form.respostas[pai.id] : undefined
          isConforme    = rPai !== undefined && r !== undefined && rPai === r
          isNaoConforme = rPai !== undefined && r !== undefined && rPai !== r
          if (rPai === true  && r === false) marriedWarning = '⚠️ Inconsistência: houve instalação mas não foi lançada na OS!'
          if (rPai === false && r === true)  marriedWarning = '⚠️ Inconsistência: não houve instalação mas foi lançada na OS!'

        } else if (isInverted) {
          isConforme    = r === false
          isNaoConforme = r === true

        } else {
          isConforme    = r === true
          isNaoConforme = r === false
        }

        return (
          <div key={item.id}
            className={`check-item ${isNaoSeAplica ? 'nsa' : isConforme ? 'sim' : isNaoConforme ? 'nao' : ''}`}
            style={isElim ? { borderWidth: 2 } : {}}>
            <div className="check-item-body">

              <div className="check-item-meta">
                <span className={`badge ${meta.cls}`}>{meta.label}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>#{idx + 1}</span>
                {isElim && (
                  <span style={{ fontSize: 10, background: '#dc2626', color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                    ELIMINATÓRIA
                  </span>
                )}
                {isCond && (
                  <span style={{ fontSize: 10, background: '#2563eb', color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                    DÉBITO PAGO
                  </span>
                )}
                {isInverted && (
                  <span style={{ fontSize: 10, background: '#7c3aed', color: '#fff', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                    NÃO = conforme
                  </span>
                )}
                {isNaoSeAplica && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginLeft: 'auto' }}>➖ Não se aplica</span>}
                {!isNaoSeAplica && isConforme    && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, marginLeft: 'auto' }}>✓ Conforme</span>}
                {!isNaoSeAplica && isNaoConforme && !isElim && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginLeft: 'auto' }}>✗ Não conforme</span>}
                {!isNaoSeAplica && isNaoConforme && isElim  && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 800, marginLeft: 'auto' }}>🚫 NÃO ATENDE</span>}
              </div>

              <p className="check-item-text" style={isElim ? { fontWeight: 600 } : {}}>{item.p}</p>

              {isNaoSeAplica ? (
                <p style={{ fontSize: 11, color: '#475569', marginBottom: 8, background: '#f1f5f9', padding: '4px 8px', borderRadius: 6 }}>
                  ➖ Não se aplica — este item sai do cálculo da nota{isElim ? ' e deixa de ser eliminatório' : ''}.
                </p>
              ) : (
                <>
                  {isElim && (
                    <p style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, background: '#fef2f2', padding: '4px 8px', borderRadius: 6 }}>
                      ⚠️ Se NÃO → resultado automaticamente NÃO ATENDE
                    </p>
                  )}
                  {isInverted && (
                    <p style={{ fontSize: 11, color: '#7c3aed', marginBottom: 8, background: '#f5f3ff', padding: '4px 8px', borderRadius: 6 }}>
                      ℹ️ NÃO = não havia como resolver = conforme &nbsp;|&nbsp; SIM = havia solução e não foi feita = não conforme
                    </p>
                  )}
                  {marriedWarning && (
                    <p style={{ fontSize: 11, color: '#d97706', marginBottom: 8, background: '#fffbeb', padding: '4px 8px', borderRadius: 6, border: '1px solid #fcd34d' }}>
                      {marriedWarning}
                    </p>
                  )}
                </>
              )}

              <div className="check-item-btns" style={item.permiteNaoSeAplica ? { gridTemplateColumns: '1fr 1fr 1fr' } : undefined}>
                <button className={`btn-sim ${r === true ? 'active' : ''}`} onClick={() => responder(item.id, true)}>✓ SIM</button>
                <button className={`btn-nao ${r === false ? 'active' : ''}`} onClick={() => responder(item.id, false)}>✗ NÃO</button>
                {item.permiteNaoSeAplica && (
                  <button className={`btn-nsa ${r === 'NSA' ? 'active' : ''}`} onClick={() => responder(item.id, 'NSA')}>➖ NSA</button>
                )}
              </div>

            </div>
          </div>
        )
      })}

      {!completo && (
        <div className="alert alert-info" style={{ textAlign: 'center' }}>
          {temDebito && form.debitoPago === null
            ? 'Responda "Foi débito pago?" para continuar'
            : `Responda todas as ${items.length} perguntas para prosseguir`}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <Textarea label="Feedback do Fiscal" value={form.feedback} onChange={v => upd('feedback', v)}
          placeholder="Observações gerais, comportamento da equipe, situações encontradas..." rows={3} />
      </div>

      <div style={{ height: 80 }} />
      <NavBar onPrev={prev} onNext={completo ? next : undefined} nextDisabled={!completo} />
    </div>
  )
}
