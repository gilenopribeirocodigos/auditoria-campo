import { useEffect, useRef, useState } from 'react'
import { CATEGORIAS_SUGERIDAS, FORMAS_PAGAMENTO, TIPOS_COMPROVANTE } from '../lib/categorias.js'
import { listarClassificacoes, listarTiposComprovanteCadastrados, listarFormasPagamento } from '../lib/prestacaoContas.js'
import PCSearchSelect from './PCSearchSelect.jsx'

const ITEM_VAZIO = {
  classificacao: '', descricao: '', fornecedor: '', forma_pagamento: 'PIX',
  tipo_comprovante: 'Recibo', data_emissao: '', valor: '', observacao: '',
}

export default function PCItemForm({ itemInicial, fotosIniciais, onSalvar, onCancelar, salvando }) {
  const editando = !!itemInicial
  const [item, setItem] = useState(() => itemInicial
    ? {
        classificacao: itemInicial.classificacao || '', descricao: itemInicial.descricao || '',
        fornecedor: itemInicial.fornecedor || '', forma_pagamento: itemInicial.forma_pagamento || 'PIX',
        tipo_comprovante: itemInicial.tipo_comprovante || 'Recibo', data_emissao: itemInicial.data_emissao || '',
        valor: itemInicial.valor ?? '', observacao: itemInicial.observacao || '',
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

  const valido = item.classificacao.trim() && item.descricao.trim() && Number(item.valor) > 0

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

      {/* ── Fotos do comprovante (pode ter mais de uma) ── */}
      <div style={{ marginTop: 18, marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
          📷 Fotos do Comprovante{fotos.length > 0 && ` (${fotos.length})`}
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
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Pode anexar mais de uma foto (ex.: recibo com várias páginas). Opcional aqui — mas obrigatório ao menos 1 antes de enviar a prestação (regra de negócio).</p>
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
