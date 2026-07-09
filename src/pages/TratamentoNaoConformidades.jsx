import { useState, useEffect, useMemo } from 'react'
import { supabase, uploadBase64 } from '../lib/supabase.js'
import { isAdmin } from '../lib/auth.js'
import { PainelFiltros, useFiltrosOperacionais, LABEL_STYLE, INPUT_STYLE } from '../components/PainelFiltros.jsx'
import { Textarea } from '../components/Shared.jsx'
import { PainelAssinatura } from '../steps/S5Assinatura.jsx'

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
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#1e293b' }}>{grupo.numero_as || '—'}</span>
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

export default function TratamentoNaoConformidades({ usuarioLogado, onVoltar }) {
  const filtros = useFiltrosOperacionais({ usuarioLogado, inicializarMes: false })
  const [ncs,            setNcs]           = useState([])
  const [loading,         setLoading]       = useState(true)
  const [statusTab,       setStatusTab]     = useState('PENDENTE')
  const [tipoFiltro,      setTipoFiltro]    = useState('TODOS')
  const [numeroASFiltro,  setNumeroASFiltro] = useState('')

  const carregar = async () => {
    setLoading(true)
    try {
      let q = supabase.from('auditorias_nao_conformes').select('*').order('criado_em', { ascending: false })
      if (statusTab !== 'TODOS') q = q.eq('status_tratamento', statusTab)
      const { ini, fim } = filtros.getDatasQuery()
      if (ini) q = q.gte('criado_em', `${ini}T00:00:00`)
      if (fim) q = q.lte('criado_em', `${fim}T23:59:59`)
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

  const totalPendentes = ncs.filter(n => n.status_tratamento === 'PENDENTE').length
  const totalTratadas  = ncs.filter(n => n.status_tratamento === 'TRATADA').length

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ background: '#c2410c', padding: '18px 20px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14,
          }}>← Voltar para Home</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>🛠️ Tratamento de Não Conformidades</h1>
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>Ações pendentes de tratamento (Pós Serviço) e histórico</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{totalPendentes}</div>
                <div style={{ fontSize: 9, opacity: 0.8 }}>PENDENTES</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 10px', textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{totalTratadas}</div>
                <div style={{ fontSize: 9, opacity: 0.8 }}>TRATADAS</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros"
          badge="não conformidades"
          extras={
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
          }
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['PENDENTE', 'TRATADA', 'TODOS'].map(s => (
            <button key={s} onClick={() => setStatusTab(s)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
              background: statusTab === s ? '#c2410c' : '#e2e8f0',
              color: statusTab === s ? '#fff' : '#374151',
            }}>{s}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Carregando...</div>
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
      </div>
    </div>
  )
}
