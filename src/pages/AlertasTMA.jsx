import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { listarAlertasTMA } from '../lib/alertasSTC.js'
import './AlertasTMA.css'

const FILTROS_INICIAIS = {
  status: '',
  busca: '',
  fiscal: '',
  dataInicio: '',
  dataFim: '',
  limite: 500,
  offset: 0,
}

function dataFortaleza(data = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data)
}

function inicioMesAtual() {
  return `${dataFortaleza().slice(0, 7)}-01`
}

function formatarDataHora(valor) {
  if (!valor) return 'Não informado'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Fortaleza',
  }).format(data)
}

function formatarMinutos(valor) {
  if (valor === null || valor === undefined || valor === '') return 'Não informado'
  return `${valor} min`
}

function Resumo({ resumo, statusAtivo, onStatus }) {
  const itens = [
    { chave: '', rotulo: 'Total', valor: resumo.total || 0, classe: 'total' },
    { chave: 'PENDENTE', rotulo: 'Pendentes', valor: resumo.pendentes || 0, classe: 'pendente' },
    { chave: 'ENCERRADO', rotulo: 'Encerrados', valor: resumo.encerrados || 0, classe: 'encerrado' },
  ]

  return (
    <div className="tma-resumo" aria-label="Resumo dos Alertas TMA">
      {itens.map(item => (
        <button
          type="button"
          key={item.classe}
          className={`tma-indicador ${item.classe} ${statusAtivo === item.chave ? 'ativo' : ''}`}
          onClick={() => onStatus(item.chave)}
        >
          <strong>{item.valor}</strong>
          <span>{item.rotulo}</span>
        </button>
      ))}
    </div>
  )
}

function ResumoPorFiscal({ alertas, status, aberto, onToggle }) {
  if (!status) return null
  const contagem = new Map()
  alertas.forEach(a => {
    const nome = a.fiscal_nome || a.lider || 'Não informado'
    contagem.set(nome, (contagem.get(nome) || 0) + 1)
  })
  const itens = [...contagem.entries()]
    .map(([fiscal, qtd]) => ({ fiscal, qtd }))
    .sort((a, b) => b.qtd - a.qtd)
  if (itens.length === 0) return null

  const classe = status === 'PENDENTE' ? 'pendente' : 'encerrado'
  const rotulo = status === 'PENDENTE' ? 'Pendentes' : 'Encerrados'

  return (
    <div className={`tma-resumo-fiscal ${classe}`}>
      <div className="tma-resumo-fiscal-header" onClick={onToggle}>
        <strong>📋 {rotulo} por Fiscal ({itens.length})</strong>
        <span>{aberto ? '▾' : '▸'}</span>
      </div>
      {aberto && (
        <div className="tma-chips">
          {itens.map(({ fiscal, qtd }) => (
            <div key={fiscal} className="tma-chip">
              <span className="tma-chip-bola">{qtd}</span>
              <span>{fiscal}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CartaoAlerta({ alerta }) {
  const encerrado = alerta.status_tratamento === 'ENCERRADO'
  const disparos = alerta.disparos || []
  const enviados = disparos.filter(d => d.status_envio === 'ENVIADO').length

  return (
    <article className={`tma-alerta ${encerrado ? 'encerrado' : 'pendente'}`}>
      <div className="tma-alerta-topo">
        <div>
          <div className="tma-alerta-identificacao">
            <strong>{alerta.recurso || 'Equipe não informada'}</strong>
            <span className={`tma-status ${encerrado ? 'encerrado' : 'pendente'}`}>
              {alerta.status_tratamento}
            </span>
          </div>
          <div className="tma-codigo">{alerta.codigo_alerta}</div>
        </div>
        <button
          type="button"
          className="tma-abrir"
          onClick={() => window.open(alerta.url_tratamento, '_blank', 'noopener,noreferrer')}
        >
          Abrir alerta ↗
        </button>
      </div>

      <div className="tma-dados-grid">
        <div><span>Fiscal</span><strong>{alerta.fiscal_nome || alerta.lider || 'Não informado'}</strong></div>
        <div><span>Ordem de Serviço</span><strong>{alerta.ordem_servico || 'Não informada'}</strong></div>
        <div><span>Atividade</span><strong>{alerta.tipo_atividade || 'Não informada'}</strong></div>
        <div><span>Grupo</span><strong>{alerta.grupo_atividade || 'Não informado'}</strong></div>
        <div><span>Início</span><strong>{alerta.inicio_atividade || 'Não informado'}</strong></div>
        <div><span>Tempo / limite</span><strong>{alerta.tempo_apurado_hhmmss || '—'} · {formatarMinutos(alerta.tempo_limite_min)}</strong></div>
        <div><span>Alerta criado</span><strong>{formatarDataHora(alerta.criado_em)}</strong></div>
        <div><span>Disparos enviados</span><strong>{enviados}</strong></div>
      </div>

      {encerrado && (
        <div className="tma-tratamento">
          <div className="tma-tratamento-titulo">✅ Tratamento registrado</div>
          <div><span>Encerrado por:</span> {alerta.encerrado_por || 'Não informado'}</div>
          <div><span>Encerrado em:</span> {formatarDataHora(alerta.encerrado_em)}</div>
          <div className="tma-justificativa"><span>Justificativa:</span> {alerta.justificativa_encerramento || 'Não informada'}</div>
        </div>
      )}
    </article>
  )
}

export default function AlertasTMA({ onVoltar }) {
  const hoje = dataFortaleza()
  const [filtros, setFiltros] = useState({
    ...FILTROS_INICIAIS,
    dataInicio: inicioMesAtual(),
    dataFim: hoje,
  })
  const [periodo, setPeriodo] = useState('mes')
  const [resultado, setResultado] = useState({
    resumo: { total: 0, pendentes: 0, encerrados: 0 },
    total_resultados: 0,
    fiscais: [],
    alertas: [],
  })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null)
  const [resumoFiscalAberto, setResumoFiscalAberto] = useState(true)

  async function carregar(filtrosConsulta = filtros) {
    setCarregando(true)
    setErro('')
    try {
      const dados = await listarAlertasTMA(filtrosConsulta)
      setResultado(dados)
      setUltimaAtualizacao(new Date())
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // A consulta inicial deve ocorrer uma única vez ao abrir o módulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function alterarPeriodo(novoPeriodo) {
    setPeriodo(novoPeriodo)
    if (novoPeriodo === 'hoje') {
      setFiltros(atual => ({ ...atual, dataInicio: hoje, dataFim: hoje }))
    } else if (novoPeriodo === 'mes') {
      setFiltros(atual => ({ ...atual, dataInicio: inicioMesAtual(), dataFim: hoje }))
    }
  }

  function filtrarStatus(status) {
    const novosFiltros = { ...filtros, status, offset: 0 }
    setFiltros(novosFiltros)
    carregar(novosFiltros)
  }

  function limpar() {
    const novosFiltros = {
      ...FILTROS_INICIAIS,
      dataInicio: inicioMesAtual(),
      dataFim: hoje,
    }
    setPeriodo('mes')
    setFiltros(novosFiltros)
    carregar(novosFiltros)
  }

  function exportarExcel() {
    const linhas = resultado.alertas.map(alerta => ({
      Código: alerta.codigo_alerta,
      Status: alerta.status_tratamento,
      Fiscal: alerta.fiscal_nome || alerta.lider,
      Equipe: alerta.recurso,
      'Ordem de Serviço': alerta.ordem_servico,
      Atividade: alerta.tipo_atividade,
      Grupo: alerta.grupo_atividade,
      'Início da Atividade': alerta.inicio_atividade,
      'Tempo Apurado': alerta.tempo_apurado_hhmmss,
      'Limite (min)': alerta.tempo_limite_min,
      'Criado em': formatarDataHora(alerta.criado_em),
      'Encerrado por': alerta.encerrado_por,
      'Encerrado em': formatarDataHora(alerta.encerrado_em),
      Justificativa: alerta.justificativa_encerramento,
    }))
    const planilha = XLSX.utils.json_to_sheet(linhas)
    const arquivo = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(arquivo, planilha, 'Alertas TMA')
    XLSX.writeFile(arquivo, `Alertas_TMA_${dataFortaleza()}.xlsx`)
  }

  return (
    <div className="tma-pagina">
      <header className="tma-cabecalho">
        <div className="tma-cabecalho-conteudo">
          <button type="button" className="tma-voltar" onClick={onVoltar}>← Voltar para Home</button>
          <div className="tma-titulo-linha">
            <div>
              <h1>⏱️ Alertas TMA</h1>
              <p>Acompanhamento dos disparos e tratamentos das atividades</p>
            </div>
            <Resumo resumo={resultado.resumo || {}} statusAtivo={filtros.status} onStatus={filtrarStatus} />
          </div>
        </div>
      </header>

      <main className="tma-conteudo">
        <section className="tma-filtros">
          <div className="tma-secao-titulo">🔍 Filtros</div>
          <div className="tma-periodos">
            <button type="button" className={periodo === 'hoje' ? 'ativo' : ''} onClick={() => alterarPeriodo('hoje')}>📍 Hoje</button>
            <button type="button" className={periodo === 'mes' ? 'ativo' : ''} onClick={() => alterarPeriodo('mes')}>🗓️ Mês</button>
            <button type="button" className={periodo === 'periodo' ? 'ativo' : ''} onClick={() => alterarPeriodo('periodo')}>📅 Período</button>
          </div>

          <div className="tma-filtros-grid">
            <label>
              Data inicial
              <input type="date" value={filtros.dataInicio} onChange={e => { setPeriodo('periodo'); setFiltros({ ...filtros, dataInicio: e.target.value }) }} />
            </label>
            <label>
              Data final
              <input type="date" value={filtros.dataFim} onChange={e => { setPeriodo('periodo'); setFiltros({ ...filtros, dataFim: e.target.value }) }} />
            </label>
            <label>
              Status
              <select value={filtros.status} onChange={e => setFiltros({ ...filtros, status: e.target.value })}>
                <option value="">Todos</option>
                <option value="PENDENTE">Pendentes</option>
                <option value="ENCERRADO">Encerrados</option>
              </select>
            </label>
            <label>
              Fiscal
              <select value={filtros.fiscal} onChange={e => setFiltros({ ...filtros, fiscal: e.target.value })}>
                <option value="">Todos</option>
                {(resultado.fiscais || []).map(fiscal => <option key={fiscal} value={fiscal}>{fiscal}</option>)}
              </select>
            </label>
            <label className="tma-busca">
              Código, OS, equipe, fiscal ou atividade
              <input
                type="search"
                placeholder="Digite para localizar..."
                value={filtros.busca}
                onChange={e => setFiltros({ ...filtros, busca: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') carregar({ ...filtros, offset: 0 }) }}
              />
            </label>
          </div>

          <div className="tma-acoes">
            <button type="button" className="primario" disabled={carregando} onClick={() => carregar({ ...filtros, offset: 0 })}>
              {carregando ? '⏳ Buscando...' : '🔍 Buscar'}
            </button>
            <button type="button" className="secundario" disabled={carregando} onClick={limpar}>Limpar filtros</button>
            <button type="button" className="excel" disabled={carregando || resultado.alertas.length === 0} onClick={exportarExcel}>
              📊 Exportar Excel ({resultado.alertas.length})
            </button>
          </div>
        </section>

        <div className="tma-lista-cabecalho">
          <div>
            <strong>{resultado.total_resultados || 0}</strong> alerta(s) encontrado(s)
            {resultado.total_resultados > resultado.alertas.length && <span> · exibindo os primeiros {resultado.alertas.length}</span>}
          </div>
          {ultimaAtualizacao && <span>Atualizado em {formatarDataHora(ultimaAtualizacao)}</span>}
        </div>

        <ResumoPorFiscal
          alertas={resultado.alertas}
          status={filtros.status}
          aberto={resumoFiscalAberto}
          onToggle={() => setResumoFiscalAberto(a => !a)}
        />

        {erro && <div className="tma-erro" role="alert">⚠️ {erro}</div>}
        {!erro && carregando && <div className="tma-vazio">⏳ Carregando Alertas TMA...</div>}
        {!erro && !carregando && resultado.alertas.length === 0 && (
          <div className="tma-vazio">Nenhum alerta encontrado para os filtros selecionados.</div>
        )}
        {!carregando && resultado.alertas.map(alerta => <CartaoAlerta key={alerta.alerta_key} alerta={alerta} />)}
      </main>
    </div>
  )
}
