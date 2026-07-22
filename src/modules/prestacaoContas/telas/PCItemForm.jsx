import { useEffect, useRef, useState } from 'react'
import { CATEGORIAS_SUGERIDAS, FORMAS_PAGAMENTO, TIPOS_COMPROVANTE } from '../lib/categorias.js'
import { listarClassificacoes, listarTiposComprovanteCadastrados } from '../lib/prestacaoContas.js'
import PCSearchSelect from './PCSearchSelect.jsx'

const ITEM_VAZIO = {
  classificacao: '', descricao: '', fornecedor: '', forma_pagamento: 'PIX',
  tipo_comprovante: 'Recibo', data_emissao: '', valor: '', observacao: '',
}

export default function PCItemForm({ itemInicial, fotoInicialUrl, onSalvar, onCancelar, salvando }) {
  const editando = !!itemInicial
  const [item, setItem] = useState(() => itemInicial
    ? {
        classificacao: itemInicial.classificacao || '', descricao: itemInicial.descricao || '',
        fornecedor: itemInicial.fornecedor || '', forma_pagamento: itemInicial.forma_pagamento || 'PIX',
        tipo_comprovante: itemInicial.tipo_comprovante || 'Recibo', data_emissao: itemInicial.data_emissao || '',
        valor: itemInicial.valor ?? '', observacao: itemInicial.observacao || '',
      }
    : ITEM_VAZIO)
  const [foto, setFoto] = useState(fotoInicialUrl || null)
  const [fotoAlterada, setFotoAlterada] = useState(false)
  const [classificacoes, setClassificacoes] = useState(CATEGORIAS_SUGERIDAS)
  const [tiposComprovante, setTiposComprovante] = useState(TIPOS_COMPROVANTE)
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
        if (ts.length > 0) setTiposComprovante([...ts.map(t => t.nome), 'Outro'])
      } catch { /* mantém a lista fixa */ }
    })()
  }, [])

  const upd = (campo, valor) => setItem(f => ({ ...f, [campo]: valor }))
  const updMaiuscula = (campo, valor) => setItem(f => ({ ...f, [campo]: valor.toUpperCase() }))

  const processarFoto = (files) => {
    const file = files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setFoto(ev.target.result); setFotoAlterada(true) }
    reader.readAsDataURL(file)
  }

  const removerFoto = () => { setFoto(null); setFotoAlterada(true) }

  const valido = item.classificacao.trim() && item.descricao.trim() && Number(item.valor) > 0

  const salvar = () => {
    const fotoBase64 = fotoAlterada && foto && foto.startsWith('data:') ? foto : null
    onSalvar(item, { alterada: fotoAlterada, base64: fotoBase64 })
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
        <label className="form-label">Descrição *</label>
        <input className="form-input" value={item.descricao} onChange={e => updMaiuscula('descricao', e.target.value)} placeholder="Ex.: VIAGEM BOA HORA" />
      </div>

      <div className="form-group">
        <label className="form-label">Fornecedor</label>
        <input className="form-input" value={item.fornecedor} onChange={e => updMaiuscula('fornecedor', e.target.value)} placeholder="Ex.: RESTAURANTE SABOR IDEAL" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Forma de pagamento</label>
          <select className="form-input" value={item.forma_pagamento} onChange={e => upd('forma_pagamento', e.target.value)}>
            {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
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
          <label className="form-label">Data da emissão</label>
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

      {/* ── Foto do comprovante ── */}
      <div style={{ marginTop: 18, marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
          📷 Foto do Comprovante
        </p>

        {foto ? (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
            <img src={foto} alt="Comprovante" style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }} />
            <button onClick={removerFoto} style={{
              position: 'absolute', top: 8, right: 8, padding: '4px 10px', borderRadius: 8,
              border: 'none', background: 'rgba(220,38,38,0.85)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>✕ Remover</button>
          </div>
        ) : null}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e => { processarFoto(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <input ref={galeriaRef} type="file" accept="image/*" onChange={e => { processarFoto(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => cameraRef.current?.click()} style={{
            padding: '18px 12px', borderRadius: 14, border: '2px dashed #2563eb', background: '#eff6ff',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 28 }}>📷</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{foto ? 'Trocar (câmera)' : 'Tirar foto'}</span>
          </button>
          <button onClick={() => galeriaRef.current?.click()} style={{
            padding: '18px 12px', borderRadius: 14, border: '2px dashed #2563eb', background: '#eff6ff',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 28 }}>🖼️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{foto ? 'Trocar (galeria)' : 'Da galeria'}</span>
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Opcional aqui — mas obrigatório antes de enviar a prestação (regra de negócio).</p>
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
