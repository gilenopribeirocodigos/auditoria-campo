import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` 
}

function mesLabel(mesAno) {
  const [ano, mes] = mesAno.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

// Perfis que SÃO fiscais (têm meta e realizam auditorias)
// Admin, supervisores e coordenadores ficam de fora.

export default function Metas({ usuarioLogado, onVoltar }) {
  const [mesAno,    setMesAno]    = useState(mesAtual())
  const [fiscais,   setFiscais]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [salvando,  setSalvando]  = useState(false)
  const [editMetas, setEditMetas] = useState({})
  const [msgSalvo,  setMsgSalvo]  = useState('')
  const [erroSalvo, setErroSalvo] = useState('')
  const [abaAtiva,  setAbaAtiva]  = useState('metas')

  const [feriadosLista,   setFeriadosLista]   = useState([])
  const [novoFerData,     setNovoFerData]     = useState('')
  const [novoFerDesc,     setNovoFerDesc]     = useState('')
  const [salvandoFeriado, setSalvandoFeriado] = useState(false)
  const [erroFeriado,     setErroFeriado]     = useState('')

  const mesesOpcoes = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const carregarFeriados = async () => {
    const { data } = await supabase.from('feriados').select('*').order('data')
    setFeriadosLista(data || [])
  }

  const carregar = async () => {
    setLoading(true)
    try {
      // Carrega APENAS usuários marcados com tem_meta = true
      const { data: fData } = await supabase
        .from('usuarios').select('nome, login, matricula, perfil')
        .in('status', ['ATIVO', 'RESERVA'])
        .eq('tem_meta', true)
        .order('nome')
      setFiscais(fData || [])

      const { data: mData, error: mErr } = await supabase
        .from('metas_fiscal').select('*').eq('mes_ano', mesAno)
      if (mErr) throw mErr

      const mapaEdit = {}
      if (fData) fData.forEach(f => {
        const meta = mData?.find(m => m.fiscal_login === f.login)
        mapaEdit[f.login] = meta?.meta ?? 20
      })
      setEditMetas(mapaEdit)
    } catch (e) {
      console.error('Erro ao carregar metas:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregarFeriados(); carregar() }, [mesAno])

  const salvarMetas = async () => {
    setSalvando(true); setMsgSalvo(''); setErroSalvo('')
    try {
      const { error: delErr } = await supabase
        .from('metas_fiscal').delete().eq('mes_ano', mesAno)
      if (delErr) throw delErr

      const inserir = Object.entries(editMetas)
        .filter(([, v]) => parseInt(v) > 0)
        .map(([fiscal_login, meta]) => ({ fiscal_login, mes_ano: mesAno, meta: parseInt(meta) }))

      if (inserir.length > 0) {
        const { error: insErr } = await supabase.from('metas_fiscal').insert(inserir)
        if (insErr) throw insErr
      }

      setMsgSalvo('✅ Metas salvas com sucesso!')
      await carregar()
      setTimeout(() => setMsgSalvo(''), 3000)
    } catch (e) {
      setErroSalvo('❌ Erro: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  const adicionarFeriado = async () => {
    if (!novoFerData) { setErroFeriado('Informe a data.'); return }
    setSalvandoFeriado(true); setErroFeriado('')
    try {
      const { error } = await supabase.from('feriados').insert({ data: novoFerData, descricao: novoFerDesc || null })
      if (error) throw error
      setNovoFerData(''); setNovoFerDesc('')
      await carregarFeriados()
    } catch (e) {
      setErroFeriado(e.message.includes('unique') ? '❌ Esta data já está cadastrada.' : '❌ ' + e.message)
    } finally {
      setSalvandoFeriado(false)
    }
  }

  const excluirFeriado = async (id) => {
    if (!window.confirm('Remover este feriado?')) return
    await supabase.from('feriados').delete().eq('id', id)
    await carregarFeriados()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      <div style={{ background: '#059669', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800 }}>🎯 Metas por Fiscal</h1>
            <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>
              Cadastro de metas e feriados — apenas fiscais de campo
            </p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Abas */}
        <div style={{ display: 'flex', marginBottom: 16, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {[
            { id: 'metas',    label: '✏️ Editar Metas' },
            { id: 'feriados', label: '🗓️ Feriados'    },
          ].map(a => (
            <button key={a.id} onClick={() => setAbaAtiva(a.id)} style={{
              flex: 1, padding: '13px', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: abaAtiva === a.id ? '#059669' : '#fff',
              color:      abaAtiva === a.id ? '#fff'    : '#64748b',
              transition: 'all 0.2s',
            }}>{a.label}</button>
          ))}
        </div>

        {/* ══════════════ ABA EDITAR METAS ══════════════ */}
        {abaAtiva === 'metas' && (
          <>
            {/* Aviso sobre quem aparece */}
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              fontSize: 12, color: '#15803d', fontWeight: 600,
            }}>
              🎯 Exibindo apenas usuários marcados com "Aparece em Metas por Fiscal" — configure em Gestão de Usuários.
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  MÊS DE REFERÊNCIA
                </label>
                <select value={mesAno} onChange={e => setMesAno(e.target.value)}
                  className="form-input" style={{ fontSize: 14, padding: '9px 14px', fontWeight: 700 }}>
                  {mesesOpcoes.map(m => (
                    <option key={m} value={m}>{mesLabel(m)}{m === mesAtual() ? ' (atual)' : ''}</option>
                  ))}
                </select>
              </div>
              <button onClick={salvarMetas} disabled={salvando} style={{
                padding: '10px 24px',
                background: salvando ? '#64748b' : '#059669',
                color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                {salvando ? '⏳ Salvando...' : '💾 Salvar Metas'}
              </button>
              {msgSalvo  && <p style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{msgSalvo}</p>}
              {erroSalvo && <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{erroSalvo}</p>}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <p>Carregando fiscais...</p>
              </div>
            ) : fiscais.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                <p>Nenhum usuário marcado para receber meta.</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>
                  Acesse <strong>Gestão de Usuários</strong> → edite um usuário → ative <strong>"🎯 Aparece em Metas por Fiscal"</strong>.
                </p>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #059669', padding: '16px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Definindo metas para {mesLabel(mesAno)} — {fiscais.length} fiscal{fiscais.length > 1 ? 'is' : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {fiscais.map((f, idx) => (
                    <div key={f.login} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0',
                      borderBottom: idx < fiscais.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{f.nome}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{f.login}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: '#059669',
                          background: '#d1fae5', padding: '1px 6px', borderRadius: 4,
                          marginLeft: 6,
                        }}>{f.perfil}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 12, color: '#64748b' }}>Meta:</label>
                        <input
                          type="number" min="0" max="999"
                          value={editMetas[f.login] ?? 20}
                          onChange={e => setEditMetas(prev => ({ ...prev, [f.login]: e.target.value }))}
                          style={{
                            width: 70, padding: '7px 10px', borderRadius: 8,
                            border: '1.5px solid #059669', fontSize: 15,
                            fontWeight: 700, textAlign: 'center', color: '#065f46',
                            outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: 12, color: '#64748b' }}>auditorias</span>
                      </div>
                    </div>
                  ))}
                </div>
                {fiscais.length > 6 && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                    <button onClick={salvarMetas} disabled={salvando} style={{
                      padding: '10px 24px', background: salvando ? '#64748b' : '#059669',
                      color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                      {salvando ? '⏳ Salvando...' : '💾 Salvar Metas'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ══════════════ ABA FERIADOS ══════════════ */}
        {abaAtiva === 'feriados' && (
          <>
            <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #059669', padding: '16px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 14 }}>➕ Adicionar Feriado</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Data *</label>
                  <input type="date" value={novoFerData} onChange={e => setNovoFerData(e.target.value)}
                    className="form-input" style={{ fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Descrição</label>
                  <input type="text" value={novoFerDesc} onChange={e => setNovoFerDesc(e.target.value)}
                    placeholder="Ex: Tiradentes, Natal, Corpus Christi..."
                    className="form-input" style={{ fontSize: 14 }} />
                </div>
              </div>
              {erroFeriado && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{erroFeriado}</p>}
              <button onClick={adicionarFeriado} disabled={salvandoFeriado} style={{
                padding: '10px 20px', background: salvandoFeriado ? '#64748b' : '#059669',
                color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                {salvandoFeriado ? '⏳ Salvando...' : '💾 Adicionar Feriado'}
              </button>
            </div>

            {feriadosLista.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
                <p>Nenhum feriado cadastrado.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {feriadosLista.map(f => (
                  <div key={f.id} style={{
                    background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                    padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                        {new Date(f.data + 'T00:00:00').toLocaleDateString('pt-BR', {
                          weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                        })}
                      </p>
                      {f.descricao && <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{f.descricao}</p>}
                    </div>
                    <button onClick={() => excluirFeriado(f.id)} style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 16,
                    }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
