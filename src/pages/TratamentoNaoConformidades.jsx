import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase, uploadBase64 } from '../lib/supabase.js'
import { isAdmin, temPermissao } from '../lib/auth.js'
import { PainelFiltros, useFiltrosOperacionais, LABEL_STYLE, INPUT_STYLE } from '../components/PainelFiltros.jsx'
import { Textarea, CarregandoHexagono } from '../components/Shared.jsx'
import { PainelAssinatura } from '../steps/S5Assinatura.jsx'
import { listarOcorrencias, tratarOcorrencia, editarOcorrencia, numeroOcorrencia } from '../lib/ocorrencias.js'
import { parseDescricaoImportada } from '../lib/importacaoOcorrencias.js'
import { temaMotivoOcorrencia } from '../data/motivosOcorrenciaTema.js'

const TIPO_LABEL = { DESEMPENHO: '📊 Desempenho Operacional', POS_SERVICO: '✅ Pós Serviço' }

// Mesmo padrão de marca d'água usado em S4Fotos.jsx/R5Evidencias.jsx —
// data/hora, equipe e fiscal gravados na própria imagem.
function processarFotoEvidencia(file, prefixo, fiscal) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        const agora = new Date()
        const ts = agora.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        const fontSize = Math.max(18, Math.round(img.width * 0.032))
        const pad = 10
        const lineH = fontSize + 8
        const linhas = [ts, 'Evidência de tratamento de NC']
        if (prefixo) linhas.push(`Equipe: ${prefixo}`)
        if (fiscal)  linhas.push(`Fiscal: ${fiscal}`)
        const boxH = linhas.length * lineH + pad * 2
        const boxY = img.height - boxH - 10

        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(0, boxY, img.width, boxH + 10)
        ctx.font = `bold ${fontSize}px monospace`
        linhas.forEach((linha, i) => {
          const y = boxY + pad + fontSize + i * lineH
          ctx.fillStyle = 'rgba(0,0,0,0.8)'
          ctx.fillText(linha, pad + 2, y + 2)
          ctx.fillStyle = i === 0 ? '#ffffff' : '#4ade80'
          ctx.fillText(linha, pad, y)
        })
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ─── Card de uma AS: lista as NCs (contexto) + 1 tratamento único ───────────
function GrupoNC({ grupo, usuarioLogado, onTratado }) {
  const pendentes   = grupo.itens.filter(i => i.status_tratamento === 'PENDENTE')
  const temPendente = pendentes.length > 0

  const temEletricista2 = !!grupo.itens[0]?.nome_eletricista2

  const [aberto,           setAberto]           = useState(false)
  const [observacao,      setObservacao]      = useState('')
  const [fotos,            setFotos]           = useState([])
  const [nomeEletricista,  setNomeEletricista]  = useState(grupo.itens[0]?.nome_eletricista || '')
  const [assinatura,       setAssinatura]       = useState(null)
  const [nomeEletricista2, setNomeEletricista2] = useState(grupo.itens[0]?.nome_eletricista2 || '')
  const [assinatura2,      setAssinatura2]      = useState(null)
  const [salvando,         setSalvando]         = useState(false)
  const [erro,             setErro]             = useState('')
  const [reabrindo,        setReabrindo]        = useState(false)

  const addFoto = async e => {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const url = await processarFotoEvidencia(file, grupo.prefixo, usuarioLogado?.nome)
      setFotos(f => [...f, url])
    }
    e.target.value = ''
  }
  const removerFoto = i => setFotos(f => f.filter((_, j) => j !== i))

  const podeConfirmar = observacao.trim().length > 0 && fotos.length > 0 && !!assinatura
    && (!temEletricista2 || !!assinatura2)

  const confirmarTratamento = async () => {
    if (!podeConfirmar || !grupo.auditoria_id) return
    setSalvando(true)
    setErro('')
    try {
      const evidenciasUrls = []
      for (let i = 0; i < fotos.length; i++) {
        const url = await uploadBase64(fotos[i], `nc_tratamento/${grupo.auditoria_id}/foto_${Date.now()}_${i + 1}.jpg`)
        evidenciasUrls.push(url)
      }
      const assinaturaUrl = await uploadBase64(assinatura, `nc_tratamento/${grupo.auditoria_id}/assinatura_${Date.now()}.png`)
      let assinatura2Url = null
      if (temEletricista2 && assinatura2) {
        assinatura2Url = await uploadBase64(assinatura2, `nc_tratamento/${grupo.auditoria_id}/assinatura2_${Date.now()}.png`)
      }

      const { error } = await supabase
        .from('auditorias_nao_conformes')
        .update({
          status_tratamento:            'TRATADA',
          tratamento_observacao:        observacao.trim(),
          tratamento_evidencias_urls:   evidenciasUrls,
          tratamento_assinatura_url:    assinaturaUrl,
          tratamento_assinatura_nome:   nomeEletricista || null,
          ...(temEletricista2 && {
            tratamento_assinatura2_url:  assinatura2Url,
            tratamento_assinatura2_nome: nomeEletricista2 || null,
          }),
          tratado_por:                  usuarioLogado?.matricula || usuarioLogado?.login || usuarioLogado?.nome || null,
          tratado_em:                   new Date().toISOString(),
        })
        .eq('auditoria_id', grupo.auditoria_id)
        .eq('status_tratamento', 'PENDENTE')
      if (error) throw error

      // Todas as NCs pendentes desta AS foram tratadas juntas — recalcula o agregado
      await supabase.from('auditorias').update({ nc_status: 'TRATADA' }).eq('id', grupo.auditoria_id)
      await supabase.from('pautas').update({ nc_status: 'TRATADA' }).eq('auditoria_id', grupo.auditoria_id)

      onTratado()
    } catch (e) {
      setErro(e.message || 'Erro ao salvar tratamento.')
    } finally {
      setSalvando(false)
    }
  }

  const reabrir = async () => {
    if (!grupo.auditoria_id) return
    if (!window.confirm('Reabrir esta AS? As não conformidades voltarão para Pendente.')) return
    setReabrindo(true)
    try {
      const { error } = await supabase
        .from('auditorias_nao_conformes')
        .update({ status_tratamento: 'PENDENTE' })
        .eq('auditoria_id', grupo.auditoria_id)
        .eq('status_tratamento', 'TRATADA')
      if (error) throw error
      await supabase.from('auditorias').update({ nc_status: 'PENDENTE' }).eq('id', grupo.auditoria_id)
      await supabase.from('pautas').update({ nc_status: 'PENDENTE' }).eq('auditoria_id', grupo.auditoria_id)
      onTratado()
    } catch (e) {
      alert('Erro ao reabrir: ' + e.message)
    } finally {
      setReabrindo(false)
    }
  }

  return (
    <div className="card" style={{ border: `1.5px solid ${temPendente ? '#fdba74' : '#86efac'}`, cursor: 'pointer' }}
      onClick={() => setAberto(a => !a)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{grupo.prefixo || '—'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#64748b' }}>{grupo.numero_as || '—'}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: temPendente ? '#fef3c7' : '#dcfce7', color: temPendente ? '#92400e' : '#15803d',
            }}>
              {temPendente ? `🟠 ${pendentes.length} pendente(s)` : '🟢 Tratada'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#64748b' }}>
            {grupo.fiscal} · {TIPO_LABEL[grupo.tipo_auditoria] || grupo.tipo_auditoria || '—'} · OS {grupo.os || '—'} · UC {grupo.uc || '—'}
            {grupo.auditoria?.data_auditoria && ` · ${grupo.auditoria.data_auditoria}`}
          </p>
          {!aberto && (
            <p style={{ fontSize: 12, color: '#334155', marginTop: 6 }}>
              {grupo.itens.length} não conformidade(s) — toque para {temPendente ? 'tratar' : 'ver detalhes'}
            </p>
          )}
        </div>
        <span style={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }}>{aberto ? '▲' : '▼'}</span>
      </div>

      {aberto && <div onClick={e => e.stopPropagation()}>

      <div style={{ marginTop: 10, marginBottom: temPendente ? 14 : 10 }}>
        {grupo.itens.map(item => (
          <div key={item.id} style={{
            display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8,
            background: '#fef2f2', borderLeft: '3px solid #dc2626', borderRadius: '0 8px 8px 0',
            padding: '8px 10px', fontSize: 12,
          }}>
            <span style={{ flex: 1, color: '#991b1b', fontWeight: 600 }}>{item.item_texto}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
              background: item.status_tratamento === 'PENDENTE' ? '#fef3c7' : '#dcfce7',
              color: item.status_tratamento === 'PENDENTE' ? '#92400e' : '#15803d',
            }}>
              {item.status_tratamento}
            </span>
          </div>
        ))}
      </div>

      {!temPendente && (
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, fontSize: 11, color: '#475569' }}>
          <p><strong>Tratado por:</strong> {grupo.itens[0]?.tratado_por || '—'} em {grupo.itens[0]?.tratado_em ? new Date(grupo.itens[0].tratado_em).toLocaleString('pt-BR') : '—'}</p>
          {grupo.itens[0]?.tratamento_observacao && (
            <p style={{ marginTop: 4 }}><strong>Observação:</strong> {grupo.itens[0].tratamento_observacao}</p>
          )}
          {(grupo.itens[0]?.tratamento_assinatura_nome || grupo.itens[0]?.tratamento_assinatura2_nome) && (
            <p style={{ marginTop: 4 }}>
              <strong>Eletricista(s) cientificado(s):</strong>{' '}
              {[grupo.itens[0]?.tratamento_assinatura_nome, grupo.itens[0]?.tratamento_assinatura2_nome].filter(Boolean).join(' e ')}
            </p>
          )}
          {isAdmin(usuarioLogado) && (
            <button onClick={reabrir} disabled={reabrindo} style={{
              marginTop: 8, fontSize: 11, fontWeight: 700, color: '#dc2626',
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '6px 10px', cursor: reabrindo ? 'not-allowed' : 'pointer',
            }}>
              {reabrindo ? '⏳ Reabrindo...' : '🔓 Reabrir'}
            </button>
          )}
        </div>
      )}

      {temPendente && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            Tratamento único — resolve {pendentes.length} não conformidade(s) desta AS de uma vez
          </p>

          <Textarea label="Observação do tratamento *" value={observacao} onChange={setObservacao}
            placeholder="Descreva a correção feita junto à equipe..." rows={3} />

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Evidência (mín. 1 foto) *
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <label style={{ flex: 1, cursor: 'pointer' }}>
                <input type="file" accept="image/*" capture="environment" multiple onChange={addFoto} style={{ display: 'none' }} />
                <div className="upload-zone" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                  <p style={{ color: '#1e3a5f', fontWeight: 700, fontSize: 13 }}>Tirar foto</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Câmera</p>
                </div>
              </label>
              <label style={{ flex: 1, cursor: 'pointer' }}>
                <input type="file" accept="image/*" multiple onChange={addFoto} style={{ display: 'none' }} />
                <div className="upload-zone" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                  <p style={{ color: '#7c3aed', fontWeight: 700, fontSize: 13 }}>Da galeria</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Galeria</p>
                </div>
              </label>
            </div>
            {fotos.length > 0 && (
              <div className="photo-grid" style={{ marginTop: 10 }}>
                {fotos.map((url, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={url} alt={`Evidência ${i + 1}`} />
                    <button className="photo-remove" onClick={() => removerFoto(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <PainelAssinatura
            label="Eletricista 1"
            nome={nomeEletricista}
            onNome={setNomeEletricista}
            assinatura={assinatura}
            onAssinatura={setAssinatura}
            obrigatorio={true}
          />

          {temEletricista2 && (
            <PainelAssinatura
              label="Eletricista 2"
              nome={nomeEletricista2}
              onNome={setNomeEletricista2}
              assinatura={assinatura2}
              onAssinatura={setAssinatura2}
              obrigatorio={true}
            />
          )}

          {erro && <div className="alert alert-danger" style={{ marginBottom: 10 }}>❌ {erro}</div>}

          <button className="btn-primary" onClick={confirmarTratamento} disabled={!podeConfirmar || salvando}
            style={{ background: (!podeConfirmar || salvando) ? undefined : '#15803d' }}>
            {salvando ? '⏳ Salvando...' : '✅ Confirmar Tratamento'}
          </button>
        </div>
      )}
      </div>}
    </div>
  )
}

// ─── Card de uma Ocorrência: descrição + 1 tratamento com evidência ─────────
// Mesmo padrão de exigência do tratamento de Não Conformidade: observação +
// mín. 1 foto + assinatura do colaborador envolvido.
// Campo com autocomplete buscando em estrutura_equipes — mesmo padrão usado
// em AberturaOcorrencia.jsx/PCItemForm.jsx (online sugere conforme digita,
// offline a busca não retorna nada e o campo aceita digitação livre).
function CampoAutocompleteEstrutura({ coluna, value, onChange, placeholder }) {
  const [sugestoes, setSugestoes] = useState([])
  const [aberto,    setAberto]    = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const buscar = async v => {
    if (!v || v.length < 2) { setSugestoes([]); setAberto(false); return }
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

// Descrição de uma Ocorrência importada em lote (lib/importacaoOcorrencias.js)
// vem como um texto corrido com vários campos juntos (Observação, UC, OS,
// Registro de Execução, Data de Conclusão, possível erro de conclusão) — sem
// isso, vira um parágrafo ilegível. parseDescricaoImportada() separa os
// campos de volta; quando não reconhece o formato (descrição digitada à
// mão), devolve null e aqui cai no texto simples, só com quebra de linha.
function DescricaoOcorrencia({ texto, comEspacoParaEditar }) {
  const dados = parseDescricaoImportada(texto)
  if (!dados) {
    return (
      <p style={{
        fontSize: 12, color: '#3730a3', margin: 0, fontWeight: 600, whiteSpace: 'pre-wrap',
        paddingRight: comEspacoParaEditar ? 56 : 0,
      }}>{texto}</p>
    )
  }
  const linhasDados = [
    ['UC', dados.uc],
    ['OS', dados.os],
    ['Registro de Execução', dados.registroExec],
    ['Data de Conclusão', dados.dataConclusao],
  ].filter(([, v]) => v)

  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.4,
        marginBottom: 10, paddingRight: comEspacoParaEditar ? 56 : 0,
      }}>
        📥 Importado em lote via planilha
      </div>

      {dados.observacao && (
        <div style={{ background: '#dbeafe', border: '2px solid #3b82f6', borderRadius: 8, padding: '11px 13px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 19, flexShrink: 0, marginTop: 1 }}>📝</span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1d4ed8', marginBottom: 4 }}>Observação</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.5 }}>{dados.observacao}</div>
          </div>
        </div>
      )}

      {linhasDados.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e0e7ff', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          {linhasDados.map(([l, v]) => (
            <div key={l} style={{ display: 'flex', gap: 8, fontSize: 11.5, padding: '3px 0' }}>
              <span style={{ color: '#94a3b8', minWidth: 118, flexShrink: 0 }}>{l}</span>
              <span style={{ color: '#1e293b', fontWeight: 600, wordBreak: 'break-word' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {dados.erroConclusao && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2, opacity: 0.75 }}>Possível erro de conclusão do serviço</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', lineHeight: 1.5 }}>{dados.erroConclusao}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function CardOcorrencia({ oc, usuarioLogado, onTratado, onEditado }) {
  const pendente = oc.status === 'PENDENTE'
  const [aberto,           setAberto]           = useState(false)
  const [observacao,       setObservacao]       = useState('')
  const [fotos,             setFotos]           = useState([])
  const [nomeColaborador,  setNomeColaborador]  = useState(oc.eletricista_equipe || '')
  const [assinatura,        setAssinatura]      = useState(null)
  const temColaborador2 = !!oc.eletricista_equipe_2
  const [nomeColaborador2, setNomeColaborador2] = useState(oc.eletricista_equipe_2 || '')
  const [assinatura2,       setAssinatura2]     = useState(null)
  const [salvando,          setSalvando]        = useState(false)
  const [erro,              setErro]            = useState('')

  // Corrigir prefixo/colaborador(es)/descrição digitados errado na abertura
  // — só enquanto pendente, e só quem abriu ou ADMIN (mesma regra de
  // visibilidade de botões sensíveis usada no resto do app).
  const podeEditar = pendente && (oc.matricula_aberto_por === usuarioLogado?.matricula || isAdmin(usuarioLogado))
  const [editando,       setEditando]       = useState(false)
  const [editPrefixo,    setEditPrefixo]    = useState(oc.prefixo || '')
  const [editColab1,     setEditColab1]     = useState(oc.eletricista_equipe || '')
  const [editColab2,     setEditColab2]     = useState(oc.eletricista_equipe_2 || '')
  const [editDescricao,  setEditDescricao]  = useState(oc.descricao || '')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [erroEdicao,     setErroEdicao]     = useState('')

  const podeSalvarEdicao = editColab1.trim().length > 0 && editDescricao.trim().length > 0

  const salvarEdicao = async () => {
    if (!podeSalvarEdicao) return
    setSalvandoEdicao(true)
    setErroEdicao('')
    try {
      await editarOcorrencia(oc.id, {
        prefixo:              editPrefixo.trim().toUpperCase() || null,
        eletricista_equipe:   editColab1.trim(),
        eletricista_equipe_2: editColab2.trim() || null,
        descricao:            editDescricao.trim(),
      })
      setEditando(false)
      onEditado?.()
    } catch (e) {
      setErroEdicao(e.message || 'Erro ao salvar a correção.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const addFoto = async e => {
    const files = Array.from(e.target.files)
    for (const file of files) {
      const url = await processarFotoEvidencia(file, oc.prefixo, usuarioLogado?.nome)
      setFotos(f => [...f, url])
    }
    e.target.value = ''
  }
  const removerFoto = i => setFotos(f => f.filter((_, j) => j !== i))

  const podeConfirmar = observacao.trim().length > 0 && fotos.length > 0 && !!assinatura
    && (!temColaborador2 || !!assinatura2)

  const confirmarTratamento = async () => {
    if (!podeConfirmar) return
    setSalvando(true)
    setErro('')
    try {
      const fotosUrls = []
      for (let i = 0; i < fotos.length; i++) {
        const url = await uploadBase64(fotos[i], `ocorrencias_tratamento/${oc.id}/foto_${Date.now()}_${i + 1}.jpg`)
        fotosUrls.push(url)
      }
      const assinaturaUrl = await uploadBase64(assinatura, `ocorrencias_tratamento/${oc.id}/assinatura_${Date.now()}.png`)
      let assinatura2Url = null
      if (temColaborador2 && assinatura2) {
        assinatura2Url = await uploadBase64(assinatura2, `ocorrencias_tratamento/${oc.id}/assinatura2_${Date.now()}.png`)
      }

      await tratarOcorrencia(oc.id, {
        observacao, fotosUrls, assinaturaUrl,
        assinaturaNome: nomeColaborador || null,
        assinatura2Url,
        assinatura2Nome: temColaborador2 ? (nomeColaborador2 || null) : null,
        usuarioLogado,
      })
      onTratado()
    } catch (e) {
      setErro(e.message || 'Erro ao salvar tratamento.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="card" style={{ border: `1.5px solid ${pendente ? '#a5b4fc' : '#86efac'}`, cursor: 'pointer' }}
      onClick={() => setAberto(a => !a)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{oc.prefixo || '—'}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
              background: pendente ? '#e0e7ff' : '#dcfce7', color: pendente ? '#3730a3' : '#15803d',
            }}>
              {pendente ? '🟣 pendente' : '🟢 tratada'}
            </span>
          </div>
          <p style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#94a3b8', margin: '0 0 9px' }}>{numeroOcorrencia(oc)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <p style={{ fontSize: 11.5, color: '#64748b' }}>📨 Encaminhada para <strong style={{ color: '#1e293b' }}>{oc.direcionado_para}</strong></p>
            <p style={{ fontSize: 11.5, color: '#64748b' }}>🧑 Aberta por <strong style={{ color: '#1e293b' }}>{oc.aberto_por}</strong> · {new Date(oc.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
          </div>
          {!aberto && (
            <p style={{ fontSize: 12, color: '#334155', marginTop: 6 }}>
              {oc.descricao.length > 90 ? oc.descricao.slice(0, 90) + '...' : oc.descricao} — toque para {pendente ? 'tratar' : 'ver detalhes'}
            </p>
          )}
        </div>
        <span style={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }}>{aberto ? '▲' : '▼'}</span>
      </div>

      {aberto && <div onClick={e => e.stopPropagation()}>

      {oc.motivo && !editando && (() => {
        const tema = temaMotivoOcorrencia(oc.motivo)
        return (
          <div style={{
            marginTop: 10, background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${tema.color}`,
            borderRadius: 10, padding: '9px 12px 9px 11px', display: 'flex', alignItems: 'center', gap: 11,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: tema.bg, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
            }}>{tema.emoji}</div>
            <div>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 1px' }}>Motivo</p>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: tema.color, margin: 0 }}>{oc.motivo}</p>
            </div>
          </div>
        )
      })()}

      <div style={{ marginTop: 10, marginBottom: pendente ? 14 : 10, background: '#eef2ff', borderLeft: '3px solid #4338ca', borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
        {editando ? (
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#3730a3', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              ✎ Corrigindo dados da abertura
            </p>
            <div className="form-group">
              <label className="form-label">Prefixo / Equipe</label>
              <CampoAutocompleteEstrutura coluna="prefixo" value={editPrefixo} onChange={setEditPrefixo} placeholder="Ex: PI-THE-C001M" />
            </div>
            <div className="form-group">
              <label className="form-label">Colaborador 1 envolvido *</label>
              <CampoAutocompleteEstrutura coluna="colaborador" value={editColab1} onChange={setEditColab1} placeholder="Nome do colaborador" />
            </div>
            <div className="form-group">
              <label className="form-label">Colaborador 2 envolvido (opcional)</label>
              <CampoAutocompleteEstrutura coluna="colaborador" value={editColab2} onChange={setEditColab2} placeholder="Nome do 2º colaborador, se houver" />
            </div>
            <Textarea label="Descrição da ocorrência *" value={editDescricao} onChange={setEditDescricao} rows={3} />
            {erroEdicao && <div className="alert alert-danger" style={{ marginBottom: 10 }}>❌ {erroEdicao}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={salvarEdicao} disabled={!podeSalvarEdicao || salvandoEdicao}
                style={{
                  flex: 1, padding: 10, borderRadius: 8, border: 'none',
                  background: (!podeSalvarEdicao || salvandoEdicao) ? '#e2e8f0' : '#4338ca',
                  color: (!podeSalvarEdicao || salvandoEdicao) ? '#94a3b8' : '#fff',
                  fontSize: 13, fontWeight: 700, cursor: (!podeSalvarEdicao || salvandoEdicao) ? 'not-allowed' : 'pointer',
                }}>
                {salvandoEdicao ? '⏳ Salvando...' : '✓ Salvar correção'}
              </button>
              <button onClick={() => { setEditando(false); setErroEdicao('') }} disabled={salvandoEdicao}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #c7d2fe', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              {/* "✎ Editar" flutua no canto em vez de dividir a linha com
                  DescricaoOcorrencia num flex row — um sibling flex ali
                  espremia a LARGURA INTEIRA do bloco (Observação/UC-OS/Erro),
                  não só a linha do botão, deixando tudo recuado à direita. */}
              {podeEditar && (
                <button onClick={() => setEditando(true)} style={{
                  position: 'absolute', top: 0, right: 0,
                  border: 'none', background: 'none', color: '#4338ca',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '2px 4px',
                }}>✎ Editar</button>
              )}
              <DescricaoOcorrencia texto={oc.descricao} comEspacoParaEditar={podeEditar} />
            </div>
            {oc.eletricista_equipe && (
              <p style={{ fontSize: 11, color: '#4338ca', margin: '6px 0 0' }}>
                👤 {[oc.eletricista_equipe, oc.eletricista_equipe_2].filter(Boolean).join(' e ')}
              </p>
            )}
            {(oc.data_abertura || oc.endereco) && (
              <p style={{ fontSize: 11, color: '#4338ca', margin: '6px 0 0' }}>
                {oc.data_abertura && `📅 ${new Date(oc.data_abertura + 'T00:00:00').toLocaleDateString('pt-BR')}${oc.hora_abertura ? ` às ${oc.hora_abertura}` : ''}`}
                {oc.data_abertura && oc.endereco && ' · '}
                {oc.endereco && `📍 ${oc.endereco}`}
              </p>
            )}
            {oc.foto_url && (
              <a href={oc.foto_url} target="_blank" rel="noreferrer">
                <img src={oc.foto_url} alt="Evidência" style={{ marginTop: 8, width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #c7d2fe', display: 'block' }} />
              </a>
            )}
          </>
        )}
      </div>

      {!pendente && (
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, fontSize: 11, color: '#475569' }}>
          <p><strong>Tratado por:</strong> {oc.tratado_por || '—'} em {oc.tratado_em ? new Date(oc.tratado_em).toLocaleString('pt-BR') : '—'}</p>
          {oc.tratamento_observacao && (
            <p style={{ marginTop: 4 }}><strong>Observação:</strong> {oc.tratamento_observacao}</p>
          )}
          {(oc.tratamento_assinatura_nome || oc.tratamento_assinatura2_nome) && (
            <p style={{ marginTop: 4 }}>
              <strong>Colaborador(es) cientificado(s):</strong> {[oc.tratamento_assinatura_nome, oc.tratamento_assinatura2_nome].filter(Boolean).join(' e ')}
            </p>
          )}
          {Array.isArray(oc.tratamento_fotos_urls) && oc.tratamento_fotos_urls.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {oc.tratamento_fotos_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`Evidência ${i + 1}`} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {pendente && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, padding: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
            Tratamento da ocorrência
          </p>

          <Textarea label="Observação do tratamento *" value={observacao} onChange={setObservacao}
            placeholder="Descreva a correção feita junto à equipe..." rows={3} />

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
              Evidência (mín. 1 foto) *
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <label style={{ flex: 1, cursor: 'pointer' }}>
                <input type="file" accept="image/*" capture="environment" multiple onChange={addFoto} style={{ display: 'none' }} />
                <div className="upload-zone" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                  <p style={{ color: '#1e3a5f', fontWeight: 700, fontSize: 13 }}>Tirar foto</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Câmera</p>
                </div>
              </label>
              <label style={{ flex: 1, cursor: 'pointer' }}>
                <input type="file" accept="image/*" multiple onChange={addFoto} style={{ display: 'none' }} />
                <div className="upload-zone" style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
                  <p style={{ color: '#7c3aed', fontWeight: 700, fontSize: 13 }}>Da galeria</p>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Galeria</p>
                </div>
              </label>
            </div>
            {fotos.length > 0 && (
              <div className="photo-grid" style={{ marginTop: 10 }}>
                {fotos.map((url, i) => (
                  <div key={i} className="photo-thumb">
                    <img src={url} alt={`Evidência ${i + 1}`} />
                    <button className="photo-remove" onClick={() => removerFoto(i)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <PainelAssinatura
            label={temColaborador2 ? 'Colaborador 1 envolvido' : 'Colaborador envolvido'}
            nome={nomeColaborador}
            onNome={setNomeColaborador}
            assinatura={assinatura}
            onAssinatura={setAssinatura}
            obrigatorio={true}
          />

          {temColaborador2 && (
            <PainelAssinatura
              label="Colaborador 2 envolvido"
              nome={nomeColaborador2}
              onNome={setNomeColaborador2}
              assinatura={assinatura2}
              onAssinatura={setAssinatura2}
              obrigatorio={true}
            />
          )}

          {erro && <div className="alert alert-danger" style={{ marginBottom: 10 }}>❌ {erro}</div>}

          <button className="btn-primary" onClick={confirmarTratamento} disabled={!podeConfirmar || salvando}
            style={{ background: (!podeConfirmar || salvando) ? undefined : '#15803d' }}>
            {salvando ? '⏳ Salvando...' : '✅ Confirmar Tratamento'}
          </button>
        </div>
      )}
      </div>}
    </div>
  )
}

export default function TratamentoNaoConformidades({ usuarioLogado, onVoltar }) {
  const filtros = useFiltrosOperacionais({ usuarioLogado, inicializarMes: false })
  // Quem vê tudo (todos os fiscais) vs só as próprias pendências — diferente
  // da segregação hierárquica usada em RegistrosOperacionais.jsx (onde
  // supervisores enxergam a equipe toda): aqui é uma fila pessoal de
  // tarefas, então por padrão só ADMIN vê tudo (temPermissao já libera
  // ADMIN automaticamente) — qualquer outro usuário só recebe a visão
  // ampla se o admin marcar a permissão 'ver_todas_pendencias_nc' pra ele
  // em Gestão de Usuários; sem ela, vê e é notificado só do que é seu.
  const podeVerTodas = temPermissao(usuarioLogado, 'ver_todas_pendencias_nc')
  const [ncs,            setNcs]           = useState([])
  const [loading,         setLoading]       = useState(true)
  const [statusTab,       setStatusTab]     = useState('PENDENTE')
  const [tipoFiltro,      setTipoFiltro]    = useState('TODOS')
  const [numeroASFiltro,  setNumeroASFiltro] = useState('')

  // ── Módulo Ocorrências (Almoxarifado → Fiscal) — aba separada, mesmo filtro
  // de período/estrutura da tela, mas fonte de dados independente (tabela
  // `ocorrencias`, sem relação com auditorias_nao_conformes) ──
  const [modulo,          setModulo]        = useState('NC') // 'NC' | 'OCORRENCIAS'
  const [ocorrencias,     setOcorrencias]   = useState([])
  const [loadingOc,       setLoadingOc]     = useState(true)
  const [pendentesOcQtd,  setPendentesOcQtd] = useState(0) // badge no botão do toggle

  const carregar = async () => {
    setLoading(true)
    try {
      let q = supabase.from('auditorias_nao_conformes').select('*').order('criado_em', { ascending: false })
      if (statusTab !== 'TODOS') q = q.eq('status_tratamento', statusTab)
      const { ini, fim } = filtros.getDatasQuery()
      if (ini) q = q.gte('criado_em', `${ini}T00:00:00`)
      if (fim) q = q.lte('criado_em', `${fim}T23:59:59`)
      if (!podeVerTodas) q = q.eq('matricula', usuarioLogado?.matricula)
      const { data: ncsData, error } = await q
      if (error) throw error

      // Join manual em JS com `auditorias` (mesmo padrão de GestaoPauta.baixarRelatorioNCs)
      const auditoriaIds = [...new Set((ncsData || []).map(n => n.auditoria_id).filter(Boolean))]
      const mapa = {}
      if (auditoriaIds.length > 0) {
        const { data: auds } = await supabase
          .from('auditorias')
          .select('id, data_auditoria, hora_auditoria, endereco')
          .in('id', auditoriaIds)
        ;(auds || []).forEach(a => { mapa[a.id] = a })
      }
      setNcs((ncsData || []).map(n => ({ ...n, auditoria: mapa[n.auditoria_id] || null })))
    } catch (e) {
      console.error('Erro ao carregar não conformidades:', e)
      setNcs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [statusTab, filtros.tipoPeriodo, filtros.mesAno, filtros.dataIni, filtros.dataFim])

  const grupos = useMemo(() => {
    let lista = ncs
    if (tipoFiltro !== 'TODOS') lista = lista.filter(n => n.tipo_auditoria === tipoFiltro)
    if (numeroASFiltro.trim()) lista = lista.filter(n => (n.numero_as || '').includes(numeroASFiltro.trim().toUpperCase()))
    lista = filtros.filtrar(lista, { prefixoField: 'prefixo' })

    const map = new Map()
    lista.forEach(nc => {
      const chave = nc.auditoria_id || nc.numero_as
      if (!map.has(chave)) {
        map.set(chave, {
          chave, auditoria_id: nc.auditoria_id, numero_as: nc.numero_as,
          fiscal: nc.fiscal, matricula: nc.matricula, prefixo: nc.prefixo,
          os: nc.os, uc: nc.uc, tipo_auditoria: nc.tipo_auditoria,
          auditoria: nc.auditoria, itens: [],
        })
      }
      map.get(chave).itens.push(nc)
    })
    return [...map.values()].sort((a, b) => (b.itens[0]?.criado_em || '').localeCompare(a.itens[0]?.criado_em || ''))
  }, [ncs, tipoFiltro, numeroASFiltro, filtros])

  // ─── Ocorrências ───────────────────────────────────────────────────────────
  // Direcionada pra mim = matrícula bate (caso comum, veio da lista de
  // fiscais) ou, na falta dela (almoxarifado digitou o nome offline), o nome
  // bate exatamente — mesmo raciocínio de "é minha pendência ou não".
  const direcionadaParaMim = oc => {
    if (oc.matricula_fiscal_destino) return oc.matricula_fiscal_destino === usuarioLogado?.matricula
    return (oc.direcionado_para || '').trim().toLowerCase() === (usuarioLogado?.nome || '').trim().toLowerCase()
  }

  const carregarOcorrencias = async () => {
    setLoadingOc(true)
    try {
      const { ini, fim } = filtros.getDatasQuery()
      const data = await listarOcorrencias(statusTab === 'TODOS' ? 'TODOS' : statusTab, { ini, fim })
      setOcorrencias(podeVerTodas ? data : data.filter(direcionadaParaMim))
    } catch (e) {
      console.error('Erro ao carregar ocorrências:', e)
      setOcorrencias([])
    } finally {
      setLoadingOc(false)
    }
  }

  useEffect(() => { carregarOcorrencias() }, [statusTab, filtros.tipoPeriodo, filtros.mesAno, filtros.dataIni, filtros.dataFim])

  // Badge de pendências — carregado 1x (independe da aba/status selecionado)
  // pra ficar visível assim que o fiscal abre a tela, sem precisar trocar de aba.
  const atualizarBadgeOc = () => {
    listarOcorrencias('PENDENTE')
      .then(d => setPendentesOcQtd((podeVerTodas ? d : d.filter(direcionadaParaMim)).length))
      .catch(() => {})
  }
  useEffect(() => { atualizarBadgeOc() }, [])

  const ocorrenciasFiltradas = useMemo(
    () => filtros.filtrar(ocorrencias, { prefixoField: 'prefixo' }),
    [ocorrencias, filtros]
  )

  const resumoPorFiscalOc = useMemo(() => {
    if (statusTab === 'TODOS') return []
    const contagem = new Map()
    ocorrenciasFiltradas.forEach(oc => {
      const nome = oc.direcionado_para || '—'
      contagem.set(nome, (contagem.get(nome) || 0) + 1)
    })
    return [...contagem.entries()]
      .map(([fiscal, qtd]) => ({ fiscal, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
  }, [ocorrenciasFiltradas, statusTab])

  const onOcorrenciaTratada = () => {
    carregarOcorrencias()
    atualizarBadgeOc()
  }

  // Conta por AS (grupo), não por item de NC — uma AS pode ter 2+ NCs, mas o
  // fiscal trata todas de uma vez só (ver GrupoNC acima), então o badge do
  // cabeçalho tem que bater com o que ele realmente vai tratar/já tratou,
  // não com a quantidade de itens (mesmo critério de `resumoPorFiscal`).
  const contarGrupos = (lista, status) => new Set(
    lista.filter(n => n.status_tratamento === status).map(n => n.auditoria_id || n.numero_as)
  ).size
  const totalPendentes = contarGrupos(ncs, 'PENDENTE')
  const totalTratadas  = contarGrupos(ncs, 'TRATADA')
  const totalPendentesOc = ocorrencias.filter(o => o.status === 'PENDENTE').length
  const totalTratadasOc  = ocorrencias.filter(o => o.status === 'TRATADA').length

  // Resumo por fiscal — conta por AS (grupo), não por item de NC.
  // Só faz sentido nas abas PENDENTE/TRATADA: como `grupos` já vem filtrado
  // pela aba ativa (a query em `carregar` filtra status_tratamento quando
  // statusTab !== 'TODOS'), cada grupo aqui já representa uma AS daquele status.
  // Na aba TODOS não exibe, pois pendente e tratada ficariam misturados.
  const [resumoAberto, setResumoAberto] = useState(true)
  const resumoPorFiscal = useMemo(() => {
    if (statusTab === 'TODOS') return []
    const contagem = new Map()
    grupos.forEach(g => {
      const nome = g.fiscal || '—'
      contagem.set(nome, (contagem.get(nome) || 0) + 1)
    })
    return [...contagem.entries()]
      .map(([fiscal, qtd]) => ({ fiscal, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
  }, [grupos, statusTab])

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ background: '#c2410c', padding: 'calc(18px + env(safe-area-inset-top)) 20px 18px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>🛠️ Tratamento de Não Conformidades</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Ações pendentes de tratamento (Pós Serviço, Ocorrências) e histórico</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{modulo === 'NC' ? totalPendentes : totalPendentesOc}</div>
                <div style={{ fontSize: 9, opacity: 0.8 }}>PENDENTES</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{modulo === 'NC' ? totalTratadas : totalTratadasOc}</div>
                <div style={{ fontSize: 9, opacity: 0.8 }}>TRATADAS</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        {/* Toggle Não Conformidades / Ocorrências — dois módulos, mesma tela */}
        <div style={{ display: 'flex', gap: 8, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 5, marginBottom: 16 }}>
          <button onClick={() => setModulo('NC')} style={{
            flex: 1, padding: 10, borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: modulo === 'NC' ? '#c2410c' : 'transparent',
            color: modulo === 'NC' ? '#fff' : '#64748b',
          }}>🛠️ Não Conformidades</button>
          <button onClick={() => setModulo('OCORRENCIAS')} style={{
            position: 'relative',
            flex: 1, padding: 10, borderRadius: 9, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            background: modulo === 'OCORRENCIAS' ? '#4338ca' : 'transparent',
            color: modulo === 'OCORRENCIAS' ? '#fff' : '#64748b',
          }}>
            📦 Ocorrências
            {pendentesOcQtd > 0 && (
              <span style={{
                // Azul claro (não vermelho) — mesma cor já usada na Home pro
                // badge de Ocorrência pendente, pra diferenciar visualmente
                // de Não Conformidade (laranja/vermelho) e não se misturar
                // com o roxo/índigo da própria aba quando ativa.
                position: 'absolute', top: -6, right: -6, background: '#38bdf8', color: '#fff',
                borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, padding: '0 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #fff',
              }}>{pendentesOcQtd}</span>
            )}
          </button>
        </div>

        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros"
          badge={modulo === 'NC' ? 'não conformidades' : 'ocorrências'}
          extras={modulo === 'NC' ? (
            <>
              <div>
                <label style={LABEL_STYLE}>Tipo de Auditoria</label>
                <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} style={INPUT_STYLE}>
                  <option value="TODOS">Todos</option>
                  <option value="DESEMPENHO">Desempenho Operacional</option>
                  <option value="POS_SERVICO">Pós Serviço</option>
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>No. AS</label>
                <input value={numeroASFiltro} onChange={e => setNumeroASFiltro(e.target.value.toUpperCase())}
                  placeholder="AS-..." style={INPUT_STYLE} />
              </div>
            </>
          ) : null}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['PENDENTE', 'TRATADA', 'TODOS'].map(s => (
            <button key={s} onClick={() => setStatusTab(s)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              background: statusTab === s ? (modulo === 'NC' ? '#c2410c' : '#4338ca') : '#e2e8f0',
              color: statusTab === s ? '#fff' : '#374151',
            }}>{s}</button>
          ))}
        </div>

        {modulo === 'NC' ? (
          <>
            {podeVerTodas && resumoPorFiscal.length > 0 && (() => {
              const cor = statusTab === 'PENDENTE'
                ? { borda: '#fdba74', fundo: '#fff7ed', texto: '#9a3412', chipFundo: '#fef3c7', chipTexto: '#92400e', bolaFundo: '#f59e0b' }
                : { borda: '#86efac', fundo: '#f0fdf4', texto: '#166534', chipFundo: '#dcfce7', chipTexto: '#15803d', bolaFundo: '#22c55e' }
              return (
                <div style={{
                  background: cor.fundo, border: `1.5px solid ${cor.borda}`, borderRadius: 12,
                  padding: '10px 14px', marginBottom: 14,
                }}>
                  <div
                    onClick={() => setResumoAberto(a => !a)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 800, color: cor.texto, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      📋 Por Fiscal ({resumoPorFiscal.length})
                      <span style={{ background: cor.bolaFundo, color: '#fff', borderRadius: 8, padding: '2px 8px', fontSize: 11 }}>
                        Total: {resumoPorFiscal.reduce((soma, r) => soma + r.qtd, 0)}
                      </span>
                    </p>
                    <span style={{ fontSize: 13, color: cor.texto }}>{resumoAberto ? '▾' : '▸'}</span>
                  </div>

                  {resumoAberto && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 10 }}>
                      {resumoPorFiscal.map(({ fiscal, qtd }) => (
                        <div key={fiscal} style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          background: cor.chipFundo, borderRadius: 20, padding: '5px 12px 5px 5px',
                        }}>
                          <span style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: '50%', background: cor.bolaFundo,
                            color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0,
                          }}>{qtd}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cor.chipTexto, whiteSpace: 'nowrap' }}>{fiscal}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {loading ? (
              <CarregandoHexagono />
            ) : grupos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🛠️</div>
                <p>Nenhuma não conformidade encontrada para os filtros selecionados</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {grupos.map(g => (
                  <GrupoNC key={g.chave} grupo={g} usuarioLogado={usuarioLogado} onTratado={carregar} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {podeVerTodas && resumoPorFiscalOc.length > 0 && (
              <div style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
                <div
                  onClick={() => setResumoAberto(a => !a)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                >
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#3730a3', textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    📋 Por Fiscal ({resumoPorFiscalOc.length})
                    <span style={{ background: '#4f46e5', color: '#fff', borderRadius: 8, padding: '2px 8px', fontSize: 11 }}>
                      Total: {resumoPorFiscalOc.reduce((soma, r) => soma + r.qtd, 0)}
                    </span>
                  </p>
                  <span style={{ fontSize: 13, color: '#3730a3' }}>{resumoAberto ? '▾' : '▸'}</span>
                </div>

                {resumoAberto && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 10 }}>
                    {resumoPorFiscalOc.map(({ fiscal, qtd }) => (
                      <div key={fiscal} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        background: '#e0e7ff', borderRadius: 20, padding: '5px 12px 5px 5px',
                      }}>
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%', background: '#4f46e5',
                          color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0,
                        }}>{qtd}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#3730a3', whiteSpace: 'nowrap' }}>{fiscal}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {loadingOc ? (
              <CarregandoHexagono />
            ) : ocorrenciasFiltradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
                <p>Nenhuma ocorrência encontrada para os filtros selecionados</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ocorrenciasFiltradas.map(oc => (
                  <CardOcorrencia key={oc.id} oc={oc} usuarioLogado={usuarioLogado} onTratado={onOcorrenciaTratada} onEditado={onOcorrenciaTratada} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
