// ── pages/ImportarOcorrenciasLote.jsx ───────────────────────────────────────
// Importa "Abertura de Ocorrência" em lote a partir da planilha do TOA.
// Fluxo não-bloqueante: ao confirmar, linha que resolveu tudo (prefixo +
// colaboradores + supervisor via matrícula) já vira Ocorrência de verdade;
// linha que não resolveu fica guardada em "Pendências de Importação" —
// revisitável a qualquer momento, sem travar as demais (ver mockup aprovado).
// Admin-only/online-only (mesmo padrão de ImportarEquipes.jsx/
// SesmtCargaPessoas.jsx) — não participa da fila offline.
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { SearchSelect } from '../components/Shared.jsx'
import { listarFiscaisParaDirecionamento } from '../lib/ocorrencias.js'
import { listarMotivosPorTipo } from '../lib/motivosRegistros.js'
import {
  extrairLinhasPlanilha, resolverLinhasImportacao,
  confirmarLinhasResolvidas, salvarPendenciasImportacao,
  listarPendenciasImportacao, excluirPendenciaImportacao, corrigirEAbrirPendencia,
} from '../lib/importacaoOcorrencias.js'

// Modelo de planilha gerado no próprio navegador — mesmo padrão de
// baixarModeloExcel() em SesmtCargaPessoas.jsx. Cabeçalho igual ao esperado
// por extrairLinhasPlanilha() + uma linha de exemplo (DATAC CONCLUSAO no
// formato americano do TOA, igual o usuário vai receber de lá). MOTIVO não
// vem do TOA — é a coluna opcional que o usuário pode preencher por linha.
function baixarModeloExcel() {
  const cabecalho = ['PREFIXO', 'UC', 'OS', 'REGISTRO_EXEC', 'DATAC CONCLUSAO', 'TIPO_CONCLUSAO', 'MOTIVO']
  const exemplo = ['PI-THE-C016M', '2000155158', '2026.00-9.00/56858.00', 'Acionar disjuntor do cliente', '9/30/2026 15:03', 'FALHA DE CONEXÃO', 'DEVOLUÇÃO DE MATERIAL NÃO REALIZADA']
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, exemplo])
  ws['!cols'] = cabecalho.map(c => ({ wch: Math.max(c.length + 2, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ocorrências')
  XLSX.writeFile(wb, 'modelo_importacao_ocorrencias.xlsx')
}

function parseCsvTexto(texto) {
  const linhas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (linhas.length === 0) return []
  const sep = linhas[0].includes(';') ? ';' : ','
  const cols = linhas[0].split(sep).map(c => c.trim())
  return linhas.slice(1).map(linha => {
    const vals = linha.split(sep)
    return cols.reduce((obj, col, i) => ({ ...obj, [col]: (vals[i] || '').trim() }), {})
  })
}

function CardLinha({ linha, numero }) {
  if (!linha.pendente) {
    return (
      <div style={{ background: '#fff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: '#4338ca' }}>{linha.prefixo || `Linha ${numero}`}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap' }}>✓ pronta</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, marginBottom: 8 }}>
          <div><span style={{ color: '#94a3b8' }}>Direcionar para </span><strong>{linha.direcionadoPara}</strong></div>
          {linha.eletricistaEquipe  && <div><span style={{ color: '#94a3b8' }}>Colaborador 1 </span><strong>{linha.eletricistaEquipe}</strong></div>}
          {linha.eletricistaEquipe2 && <div><span style={{ color: '#94a3b8' }}>Colaborador 2 </span><strong>{linha.eletricistaEquipe2}</strong></div>}
          {linha.motivo && <div><span style={{ color: '#94a3b8' }}>🏷️ Motivo </span><strong>{linha.motivo}</strong></div>}
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 10px', fontSize: 11.5, whiteSpace: 'pre-wrap', color: '#374151' }}>
          {linha.descricao}
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: '#4338ca' }}>{linha.prefixo || `Linha ${numero}`}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>⚠ pendente</span>
      </div>
      <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, marginBottom: 6 }}>{linha.motivoPendencia}</div>
      {(linha.eletricistaEquipe || linha.eletricistaEquipe2) && (
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {[linha.eletricistaEquipe, linha.eletricistaEquipe2].filter(Boolean).join(' e ')}
        </div>
      )}
    </div>
  )
}

// ─── Formulário de correção de uma pendência: escolhe o supervisor e ajusta
// os colaboradores antes de criar a Ocorrência de verdade ──────────────────
function CorrigirPendenciaForm({ pendencia, onCancelar, onSalvo, usuarioLogado }) {
  const [fiscais, setFiscais] = useState([])
  const [nomeSuperv, setNomeSuperv] = useState(pendencia.direcionado_para || '')
  const [matriculaSuperv, setMatriculaSuperv] = useState(pendencia.matricula_fiscal_destino || '')
  const [colab1, setColab1] = useState(pendencia.colaborador_1 || '')
  const [colab2, setColab2] = useState(pendencia.colaborador_2 || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { listarFiscaisParaDirecionamento().then(setFiscais).catch(() => setFiscais([])) }, [])

  const salvar = async () => {
    if (!nomeSuperv.trim()) { setErro('Escolha quem vai receber a ocorrência.'); return }
    setSalvando(true); setErro('')
    try {
      await corrigirEAbrirPendencia(pendencia, {
        direcionadoPara: nomeSuperv.trim().toUpperCase(),
        matriculaFiscalDestino: matriculaSuperv || null,
        eletricistaEquipe: colab1.trim().toUpperCase(),
        eletricistaEquipe2: colab2.trim().toUpperCase(),
      }, usuarioLogado)
      onSalvo()
    } catch (e) {
      setErro('Erro ao abrir a ocorrência: ' + e.message)
      setSalvando(false)
    }
  }

  return (
    <div style={{ marginTop: 10, background: '#fff', border: '1px solid #fcd34d', borderRadius: 10, padding: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'block', marginBottom: 4 }}>Direcionar para (Fiscal/Supervisor) *</label>
      <SearchSelect
        opcoes={fiscais.map(f => ({ value: f.nome, label: f.matricula ? `${f.nome} (${f.matricula})` : f.nome }))}
        valor={nomeSuperv}
        onSelecionar={v => {
          setNomeSuperv(v)
          setMatriculaSuperv(fiscais.find(f => f.nome === v)?.matricula || '')
        }}
        placeholder="Selecione o fiscal..."
      />
      <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'block', margin: '10px 0 4px' }}>Colaborador 1</label>
      <input className="form-input" value={colab1} onChange={e => setColab1(e.target.value.toUpperCase())} />
      <label style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'block', margin: '10px 0 4px' }}>Colaborador 2</label>
      <input className="form-input" value={colab2} onChange={e => setColab2(e.target.value.toUpperCase())} />
      {erro && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8, fontWeight: 700 }}>{erro}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button disabled={salvando} onClick={salvar} style={{
          flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#4338ca', color: '#fff',
          fontSize: 12.5, fontWeight: 700, cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.7 : 1,
        }}>{salvando ? 'Abrindo...' : '✓ Confirmar e abrir'}</button>
        <button disabled={salvando} onClick={onCancelar} style={{
          padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff',
          color: '#64748b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        }}>Cancelar</button>
      </div>
    </div>
  )
}

function CardPendencia({ pendencia, usuarioLogado, onMudou }) {
  const [corrigindo, setCorrigindo] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const excluir = async () => {
    if (!window.confirm(`Excluir a pendência do prefixo "${pendencia.prefixo || '—'}"? Ela nunca virará uma Ocorrência.`)) return
    setExcluindo(true)
    try { await excluirPendenciaImportacao(pendencia.id); onMudou() }
    catch (e) { alert('Erro ao excluir: ' + e.message); setExcluindo(false) }
  }

  return (
    <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: '#4338ca' }}>{pendencia.prefixo || '—'}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>⚠ pendente</span>
      </div>
      <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 700, marginBottom: 6 }}>{pendencia.motivo_pendencia}</div>
      {(pendencia.colaborador_1 || pendencia.colaborador_2) && (
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          {[pendencia.colaborador_1, pendencia.colaborador_2].filter(Boolean).join(' e ')}
        </div>
      )}
      {!corrigindo ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => setCorrigindo(true)} style={{
            flex: 1, textAlign: 'center', padding: 9, borderRadius: 8, background: '#4338ca', color: '#fff',
            fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>✎ Corrigir e abrir</button>
          <button disabled={excluindo} onClick={excluir} style={{
            flex: 1, textAlign: 'center', padding: 9, borderRadius: 8, background: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca', fontSize: 12, fontWeight: 700, cursor: excluindo ? 'default' : 'pointer',
          }}>{excluindo ? 'Excluindo...' : '🗑️ Excluir'}</button>
        </div>
      ) : (
        <CorrigirPendenciaForm pendencia={pendencia} usuarioLogado={usuarioLogado} onCancelar={() => setCorrigindo(false)} onSalvo={onMudou} />
      )}
    </div>
  )
}

export default function ImportarOcorrenciasLote({ usuarioLogado, onHome, onVoltar }) {
  const [tela, setTela] = useState('upload') // upload | revisao | pendencias
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [linhasResolvidas, setLinhasResolvidas] = useState([])
  const [nomeArquivo, setNomeArquivo] = useState('')

  const [pendencias, setPendencias] = useState([])
  const [carregandoPendencias, setCarregandoPendencias] = useState(false)
  const [resultadoConfirmacao, setResultadoConfirmacao] = useState(null)

  // Motivo (opcional) aplicado a TODAS as ocorrências desta importação —
  // mesmo cadastro usado na abertura manual (tipo_registro = 'OCORRENCIA'
  // em motivos_registros_operacionais). A planilha do TOA não traz motivo
  // por linha, por isso é um único campo pro lote inteiro, não por linha.
  const [motivos, setMotivos] = useState([])
  const [motivoLote, setMotivoLote] = useState('')

  const carregarPendencias = () => {
    setCarregandoPendencias(true)
    listarPendenciasImportacao()
      .then(setPendencias)
      .catch(e => setErro('Erro ao carregar pendências: ' + e.message))
      .finally(() => setCarregandoPendencias(false))
  }

  useEffect(() => {
    carregarPendencias()
    listarMotivosPorTipo('OCORRENCIA').then(lista => setMotivos(lista.map(m => m.motivo))).catch(() => setMotivos([]))
  }, [])

  const onFile = e => {
    const file = e.target.files[0]
    if (!file) return
    setErro(''); setNomeArquivo(file.name)
    const ext = file.name.split('.').pop().toLowerCase()
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        let objs = []
        if (ext === 'xlsx' || ext === 'xls') {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          objs = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'mm/dd/yyyy hh:mm' })
        } else {
          let texto
          try { texto = new TextDecoder('utf-8', { fatal: true }).decode(ev.target.result) }
          catch { texto = new TextDecoder('windows-1252').decode(ev.target.result) }
          objs = parseCsvTexto(texto)
        }
        const linhas = extrairLinhasPlanilha(objs)
        if (linhas.length === 0) {
          setErro('Nenhuma linha com PREFIXO, UC ou OS reconhecida. Confira o cabeçalho da planilha.')
          return
        }
        setProcessando(true)
        const resolvidas = await resolverLinhasImportacao(linhas)
        setLinhasResolvidas(resolvidas)
        setTela('revisao')
      } catch (err) {
        setErro('Erro ao ler arquivo: ' + err.message)
      } finally {
        setProcessando(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const prontas   = linhasResolvidas.filter(l => !l.pendente)
  const revisar   = linhasResolvidas.filter(l => l.pendente)

  const confirmar = async () => {
    setProcessando(true); setErro('')
    try {
      // Motivo da própria linha (coluna MOTIVO na planilha) tem prioridade;
      // sem ela, cai pro motivo único escolhido pra importação inteira.
      const prontasComMotivo = prontas.map(l => ({ ...l, motivo: l.motivo || motivoLote || null }))
      const revisarComMotivo = revisar.map(l => ({ ...l, motivo: l.motivo || motivoLote || null }))
      const criadas = await confirmarLinhasResolvidas(prontasComMotivo, usuarioLogado)
      await salvarPendenciasImportacao(revisarComMotivo, usuarioLogado)
      setResultadoConfirmacao({ criadas: criadas.length, pendentes: revisar.length })
      setLinhasResolvidas([])
      carregarPendencias()
      setTela('pendencias')
    } catch (e) {
      setErro('Erro ao importar: ' + e.message)
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header no-print" style={{ background: '#4338ca' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Plataforma de Gestão Operacional
          </div>
          <button onClick={onHome} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>🏠 Home</button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>📥 Abrir Ocorrências em Lote</div>
        <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Importar de planilha (TOA)</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <button onClick={onVoltar} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          }}>← Voltar</button>
          <button onClick={() => setTela('pendencias')} style={{
            border: '1px solid rgba(255,255,255,0.4)', background: tela === 'pendencias' ? '#fff' : 'rgba(255,255,255,0.12)',
            color: tela === 'pendencias' ? '#4338ca' : '#fff',
            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>📋 Pendências ({pendencias.length})</button>
        </div>
      </header>

      <main className="app-content">
        <div style={{ padding: '0 0 80px' }}>
          {erro && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              {erro}
            </div>
          )}

          {tela === 'upload' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <label style={{
                  flex: 1, display: 'block', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff',
                  padding: '10px 14px', textAlign: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1e293b',
                }}>
                  📄 Escolher arquivo
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} disabled={processando} style={{ display: 'none' }} />
                </label>
                <button onClick={baixarModeloExcel} style={{
                  flex: 1, border: '1.5px solid #c7d2fe', borderRadius: 10, background: '#eef2ff', color: '#4338ca',
                  padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>📥 Baixar modelo (.xlsx)</button>
              </div>

              <div style={{
                border: '2px dashed #a5b4fc', borderRadius: 14, background: '#eef2ff',
                padding: '28px 16px', textAlign: 'center', marginBottom: 16,
              }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#4338ca' }}>
                  {processando ? 'Lendo planilha...' : nomeArquivo || 'Nenhuma planilha selecionada'}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>.xlsx ou .csv — mesmas colunas do TOA</div>
              </div>
              <p style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6 }}>
                Colunas esperadas: <strong>PREFIXO</strong>, UC, OS, REGISTRO_EXEC, DATAC CONCLUSAO, TIPO_CONCLUSAO
                e MOTIVO (opcional, não vem do TOA — só se você acrescentar).
                Cada PREFIXO é casado com a Estrutura Online (supervisor de campo + colaboradores). Baixe o modelo
                acima se tiver dúvida de como preencher — pode até usá-lo como ponto de partida.
              </p>
            </>
          )}

          {tela === 'revisao' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 90, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>{prontas.length}</div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>prontas</div>
                </div>
                <div style={{ flex: 1, minWidth: 90, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>{revisar.length}</div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>p/ revisar</div>
                </div>
                <div style={{ flex: 1, minWidth: 90, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{linhasResolvidas.length}</div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>total linhas</div>
                </div>
              </div>

              {linhasResolvidas.map((linha, i) => <CardLinha key={i} linha={linha} numero={i + 1} />)}

              {motivos.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Motivo (opcional) — aplicado a todas as ocorrências desta importação
                  </label>
                  <SearchSelect opcoes={motivos} valor={motivoLote} onSelecionar={setMotivoLote} placeholder="Buscar e escolher o motivo..." />
                </div>
              )}

              {revisar.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
                  ℹ️ As {prontas.length} prontas são abertas agora. {revisar.length === 1 ? 'A 1 pendente não é perdida' : `As ${revisar.length} pendentes não são perdidas`} — fica{revisar.length === 1 ? '' : 'm'} guardada{revisar.length === 1 ? '' : 's'} pra você corrigir ou excluir quando quiser, sem travar as outras.
                </div>
              )}

              <button disabled={processando} onClick={confirmar} style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#4338ca', color: '#fff',
                fontSize: 14.5, fontWeight: 700, cursor: processando ? 'default' : 'pointer', opacity: processando ? 0.7 : 1, marginTop: 6,
              }}>
                {processando
                  ? 'Importando...'
                  : revisar.length > 0
                    ? `📦 Abrir ${prontas.length} Ocorrência${prontas.length === 1 ? '' : 's'} Pronta${prontas.length === 1 ? '' : 's'} (${revisar.length} fica${revisar.length === 1 ? '' : 'm'} pendente${revisar.length === 1 ? '' : 's'})`
                    : `📦 Abrir ${prontas.length} Ocorrência${prontas.length === 1 ? '' : 's'}`}
              </button>
              <button onClick={() => { setTela('upload'); setLinhasResolvidas([]); setNomeArquivo(''); setMotivoLote('') }} style={{
                width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff',
                color: '#1e293b', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8,
              }}>← Voltar e trocar o arquivo</button>
            </>
          )}

          {tela === 'pendencias' && (
            <>
              {resultadoConfirmacao && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: 14, textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#15803d' }}>
                    {resultadoConfirmacao.criadas} Ocorrência{resultadoConfirmacao.criadas === 1 ? '' : 's'} aberta{resultadoConfirmacao.criadas === 1 ? '' : 's'} com sucesso!
                  </div>
                  <div style={{ fontSize: 11.5, color: '#15803d', opacity: 0.85, marginTop: 2 }}>
                    Já aparece{resultadoConfirmacao.criadas === 1 ? '' : 'm'} pendente{resultadoConfirmacao.criadas === 1 ? '' : 's'} de tratamento em "Tratamento de Não Conformidades"
                  </div>
                </div>
              )}

              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>📋 Pendências de Importação ({pendencias.length})</h3>
              <p style={{ fontSize: 11.5, color: '#64748b', margin: '0 0 12px' }}>
                Essas linhas ainda não viraram Ocorrência — ficam guardadas aqui até você decidir.
              </p>

              {carregandoPendencias && <p style={{ fontSize: 13, color: '#64748b' }}>Carregando...</p>}
              {!carregandoPendencias && pendencias.length === 0 && (
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Nenhuma pendência no momento.</p>
              )}
              {pendencias.map(p => (
                <CardPendencia key={p.id} pendencia={p} usuarioLogado={usuarioLogado} onMudou={carregarPendencias} />
              ))}

              <button onClick={() => { setResultadoConfirmacao(null); setTela('upload'); setMotivoLote('') }} style={{
                width: '100%', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff',
                color: '#1e293b', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 10,
              }}>📥 Importar outra planilha</button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
