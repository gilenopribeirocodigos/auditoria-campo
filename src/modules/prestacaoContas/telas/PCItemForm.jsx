import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase.js'
import { CATEGORIAS_SUGERIDAS, CATEGORIAS_DESPESA, FORMAS_PAGAMENTO, TIPOS_COMPROVANTE } from '../lib/categorias.js'
import { listarClassificacoes, listarTiposComprovanteCadastrados, listarFormasPagamento } from '../lib/prestacaoContas.js'
import PCSearchSelect from './PCSearchSelect.jsx'

const ITEM_VAZIO = {
  classificacao: '', descricao: '', fornecedor: '', forma_pagamento: 'PIX',
  tipo_comprovante: 'RECIBO', data_emissao: '', valor: '', observacao: '',
  categoria_despesa: '', colaborador_1: '', colaborador_2: '', alocacao: '',
}

// Campo com autocomplete buscando em estrutura_equipes (mesmo padrão de
// CampoPrefixo/CampoColaboradorEnvolvido em AberturaOcorrencia.jsx) — online
// sugere conforme digita, offline a busca simplesmente não retorna nada e o
// campo continua aceitando digitação livre. Sempre em maiúscula.
function CampoAutocompleteEstrutura({ coluna, value, onChange, placeholder }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async v => {
    if (!v || v.length < 2 || !supabase) { setSugestoes([]); setAberto(false); return }
    try {
      const { data } = await supabase.from('estrutura_equipes')
        .select(coluna).ilike(coluna, `%${v}%`).not(coluna, 'is', null).neq(coluna, '')
        .order(coluna).limit(15)
      const unicos = [...new Set((data || []).map(r => r[coluna]?.trim().toUpperCase()).filter(Boolean))]
      setSugestoes(unicos)
      setAberto(unicos.length > 0)
    } catch { setSugestoes([]); setAberto(false) }
  }

  const handleChange = e => {
    const v = e.target.value.toUpperCase()
    onChange(v)
    buscar(v)
  }

  const selecionar = s => { onChange(s); setSugestoes([]); setAberto(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="form-input" value={value} onChange={handleChange}
        onFocus={() => value && buscar(value)}
        placeholder={placeholder} autoComplete="off" />
      {aberto && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto',
        }}>
          {sugestoes.map((s, i) => (
            <button key={i} type="button" onMouseDown={() => selecionar(s)}
              style={{
                display: 'block', width: '100%', padding: '9px 12px',
                textAlign: 'left', background: 'none', border: 'none',
                borderBottom: i < sugestoes.length - 1 ? '1px solid #f1f5f9' : 'none',
                fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PCItemForm({ itemInicial, fotosIniciais, onSalvar, onCancelar, salvando }) {
  const editando = !!itemInicial
  const [item, setItem] = useState(() => itemInicial
    ? {
        classificacao: itemInicial.classificacao || '', descricao: itemInicial.descricao || '',
        fornecedor: itemInicial.fornecedor || '', forma_pagamento: itemInicial.forma_pagamento || 'PIX',
        tipo_comprovante: itemInicial.tipo_comprovante || 'RECIBO', data_emissao: itemInicial.data_emissao || '',
        valor: itemInicial.valor ?? '', observacao: itemInicial.observacao || '',
        categoria_despesa: itemInicial.categoria_despesa || '', colaborador_1: itemInicial.colaborador_1 || '',
        colaborador_2: itemInicial.colaborador_2 || '', alocacao: itemInicial.alocacao || '',
      }
    : ITEM_VAZIO)
  // Cada foto é { id, foto_url } (já salva) ou { base64 } (nova, ainda não enviada).
  const [fotos, setFotos] = useState(() => (fotosIniciais || []).map(f => ({ id: f.id, foto_url: f.foto_url })))
  const [fotosRemovidasIds, setFotosRemovidasIds] = useState([])
  const [classificacoes, setClassificacoes] = useState(CATEGORIAS_SUGERIDAS)
  const [tiposComprovante, setTiposComprovante] = useState(TIPOS_COMPROVANTE)
  const [formasPagamento, setFormasPagamento] = useState(FORMAS_PAGAMENTO)
  const cameraRef = useRef(null)
  const galeriaRef = useRef(null)

  // Padrões cadastrados (tela "⚙️ Padrões") — se a busca falhar ou vier
  // vazia, mantém a lista fixa de categorias.js como reserva.
  useEffect(() => {
    (async () => {
      try {
        const cs = await listarClassificacoes()
        if (cs.length > 0) setClassificacoes(cs.map(c => c.nome))
      } catch { /* mantém a lista fixa */ }
      try {
        const ts = await listarTiposComprovanteCadastrados()
        if (ts.length > 0) setTiposComprovante(ts.map(t => t.nome))
      } catch { /* mantém a lista fixa */ }
      try {
        const fs = await listarFormasPagamento()
        if (fs.length > 0) setFormasPagamento(fs.map(f => f.nome))
      } catch { /* mantém a lista fixa */ }
    })()
  }, [])

  const upd = (campo, valor) => setItem(f => ({ ...f, [campo]: valor }))
  const updMaiuscula = (campo, valor) => setItem(f => ({ ...f, [campo]: valor.toUpperCase() }))

  const processarFotos = (files) => {
    for (const file of files || []) {
      const reader = new FileReader()
      reader.onload = ev => setFotos(f => [...f, { base64: ev.target.result }])
      reader.readAsDataURL(file)
    }
  }

  const removerFoto = (index) => {
    setFotos(f => {
      const alvo = f[index]
      if (alvo?.id) setFotosRemovidasIds(ids => [...ids, alvo.id])
      return f.filter((_, i) => i !== index)
    })
  }

  const alocacaoOk = item.categoria_despesa === 'COLABORADOR' ? item.colaborador_1.trim().length > 0
    : item.categoria_despesa === 'ADMINISTRATIVA' ? true
    : item.alocacao.trim().length > 0

  const valido = item.classificacao.trim() && item.descricao.trim() && item.fornecedor.trim()
    && item.data_emissao.trim() && Number(item.valor) > 0 && fotos.length > 0
    && item.categoria_despesa && alocacaoOk

  const salvar = () => {
    const novasBase64 = fotos.filter(f => f.base64).map(f => f.base64)
    onSalvar(item, { removidasIds: fotosRemovidasIds, novasBase64 })
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>
        {editando ? 'Editar Despesa' : 'Nova Despesa'}
      </h2>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
        {editando ? 'Corrija os dados e a foto do comprovante, se precisar.' : 'Preencha os mesmos dados que você usa na sua planilha de prestação de contas.'}
      </p>

      <div className="form-group">
        <label className="form-label">Classificação *</label>
        <PCSearchSelect
          opcoes={classificacoes} valor={item.classificacao}
          onSelecionar={v => upd('classificacao', v)}
          placeholder="Buscar e escolher a classificação..."
        />
      </div>

      <div className="form-group">
        <label className="form-label">Categoria da Despesa *</label>
        <PCSearchSelect
          opcoes={CATEGORIAS_DESPESA} valor={item.categoria_despesa}
          onSelecionar={v => upd('categoria_despesa', v)}
          placeholder="Escolha para quem/o quê alocar..."
        />
      </div>

      {item.categoria_despesa === 'COLABORADOR' && (
        <>
          <div className="form-group">
            <label className="form-label">Colaborador 1 *</label>
            <CampoAutocompleteEstrutura coluna="colaborador" value={item.colaborador_1}
              onChange={v => upd('colaborador_1', v)} placeholder="Nome do colaborador..." />
          </div>
          <div className="form-group">
            <label className="form-label">Colaborador 2 (opcional)</label>
            <CampoAutocompleteEstrutura coluna="colaborador" value={item.colaborador_2}
              onChange={v => upd('colaborador_2', v)} placeholder="Nome do 2º colaborador, se houver..." />
          </div>
        </>
      )}

      {item.categoria_despesa === 'EQUIPE_PREFIXO' && (
        <div className="form-group">
          <label className="form-label">Prefixo da Equipe *</label>
          <CampoAutocompleteEstrutura coluna="prefixo" value={item.alocacao}
            onChange={v => upd('alocacao', v)} placeholder="Ex.: PI-THE-C002M" />
        </div>
      )}

      {item.categoria_despesa === 'VIATURA' && (
        <div className="form-group">
          <label className="form-label">Placa da Viatura *</label>
          <input className="form-input" value={item.alocacao} onChange={e => updMaiuscula('alocacao', e.target.value)} placeholder="Ex.: OUB23GI" />
        </div>
      )}

      {item.categoria_despesa === 'BASE_OPERACIONAL' && (
        <div className="form-group">
          <label className="form-label">Base Operacional *</label>
          <input className="form-input" value={item.alocacao} onChange={e => updMaiuscula('alocacao', e.target.value)} placeholder="Ex.: BASE MONTE CASTELO" />
        </div>
      )}

      {item.categoria_despesa === 'TERCEIROS' && (
        <div className="form-group">
          <label className="form-label">Nome do Terceiro *</label>
          <input className="form-input" value={item.alocacao} onChange={e => updMaiuscula('alocacao', e.target.value)} placeholder="Ex.: CONDOMÍNIO RESIDENCIAL X" />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Descrição *</label>
        <input className="form-input" value={item.descricao} onChange={e => updMaiuscula('descricao', e.target.value)} placeholder="Ex.: VIAGEM BOA HORA" />
      </div>

      <div className="form-group">
        <label className="form-label">Fornecedor *</label>
        <input className="form-input" value={item.fornecedor} onChange={e => updMaiuscula('fornecedor', e.target.value)} placeholder="Ex.: RESTAURANTE SABOR IDEAL" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Forma de pagamento</label>
          <PCSearchSelect
            opcoes={formasPagamento} valor={item.forma_pagamento}
            onSelecionar={v => upd('forma_pagamento', v)}
            placeholder="Buscar..."
          />
        </div>
        <div className="form-group">
          <label className="form-label">Comprovante</label>
          <PCSearchSelect
            opcoes={tiposComprovante} valor={item.tipo_comprovante}
            onSelecionar={v => upd('tipo_comprovante', v)}
            placeholder="Buscar..."
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Data da emissão *</label>
          <input type="date" className="form-input" value={item.data_emissao} onChange={e => upd('data_emissao', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Valor (R$) *</label>
          <input type="number" step="0.01" min="0" className="form-input" value={item.valor} onChange={e => upd('valor', e.target.value)} placeholder="0,00" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Observação (opcional)</label>
        <input className="form-input" value={item.observacao} onChange={e => updMaiuscula('observacao', e.target.value)} />
      </div>

      {/* ── Fotos do comprovante (pode ter mais de uma) ── */}
      <div style={{ marginTop: 18, marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
          📷 Fotos do Comprovante *{fotos.length > 0 && ` (${fotos.length})`}
        </p>

        {fotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10, marginBottom: 10 }}>
            {fotos.map((f, i) => (
              <div key={f.id ?? `nova-${i}`} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                <img src={f.base64 || f.foto_url} alt="Comprovante" style={{ width: '100%', height: 100, display: 'block', objectFit: 'cover' }} />
                <button onClick={() => removerFoto(i)} style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
                  border: 'none', background: 'rgba(220,38,38,0.9)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', lineHeight: '22px', padding: 0,
                }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e => { processarFotos(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <input ref={galeriaRef} type="file" accept="image/*" multiple onChange={e => { processarFotos(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => cameraRef.current?.click()} style={{
            padding: '18px 12px', borderRadius: 14, border: '2px dashed #2563eb', background: '#eff6ff',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 28 }}>📷</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{fotos.length > 0 ? 'Adicionar (câmera)' : 'Tirar foto'}</span>
          </button>
          <button onClick={() => galeriaRef.current?.click()} style={{
            padding: '18px 12px', borderRadius: 14, border: '2px dashed #2563eb', background: '#eff6ff',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 28 }}>🖼️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{fotos.length > 0 ? 'Adicionar (galeria)' : 'Da galeria'}</span>
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Pode anexar mais de uma foto (ex.: recibo com várias páginas). Obrigatório ao menos 1 foto.</p>
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={salvar} disabled={!valido || salvando} style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          background: valido && !salvando ? '#1e3a5f' : '#e2e8f0',
          color: valido && !salvando ? '#fff' : '#94a3b8',
          fontSize: 15, fontWeight: 700, cursor: valido && !salvando ? 'pointer' : 'not-allowed',
        }}>
          {salvando ? '⏳ Salvando...' : editando ? '✓ Salvar Alterações' : '✓ Salvar Item'}
        </button>
        <button onClick={onCancelar} disabled={salvando} style={{
          width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>← Cancelar</button>
      </div>
    </div>
  )
}
