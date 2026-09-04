import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { temPermissao } from '../lib/auth.js'
import { listarPessoasSesmt, importarPessoasSesmt } from '../lib/sesmt.js'

// Aceita cabeçalhos variados (CHAPA/MATRICULA, NOME/COLABORADOR) — normaliza
// acento/caixa antes de casar com as colunas esperadas.
const normChave = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()

const ALIAS_CHAPA           = ['chapa', 'matricula']
const ALIAS_NOME            = ['nome', 'colaborador', 'nome_completo', 'nome_colaborador']
const ALIAS_CODSITUACAO     = ['codsituacao', 'cod_situacao', 'situacao']
const ALIAS_CODSECAO        = ['codsecao', 'cod_secao', 'secao']
const ALIAS_DATAADMISSAO    = ['dataadmissao', 'data_admissao']
const ALIAS_DTTRANSFERENCIA = ['dttransferencia', 'dt_transferencia', 'datatransferencia', 'data_transferencia']
const ALIAS_DATADEMISSAO    = ['datademissao', 'data_demissao']
const ALIAS_PISPASEP        = ['pispasep', 'pis_pasep', 'pis']
const ALIAS_CPF             = ['cpf']

// REGIONAL não vem no arquivo — é calculado a partir dos 3 primeiros grupos
// de CODSECAO (ex.: "02.03.01.20.014" -> "02.03.01" -> METROPOLITANA).
function derivarRegional(codsecao) {
  const partes = String(codsecao || '').trim().split('.').map(p => p.trim())
  if (partes.length < 3 || partes[0] !== '02' || partes[1] !== '03') return ''
  const n = Number(partes[2])
  if (n === 1) return 'METROPOLITANA'
  if (n === 2) return 'NORTE'
  if (n >= 3 && n <= 8) return 'SUL'
  return ''
}

// Datas do arquivo vêm em DD/MM/AAAA — converte pra AAAA-MM-DD (coluna date).
function parseDataBR(valor) {
  const v = String(valor || '').trim()
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mes, ano] = m
  return `${ano}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function extrairPessoa(linhaObj) {
  const chaves = Object.keys(linhaObj).reduce((acc, k) => { acc[normChave(k)] = linhaObj[k]; return acc }, {})
  const pega = (aliases) => {
    const key = aliases.find(a => chaves[a] !== undefined && String(chaves[a]).trim() !== '')
    return key ? String(chaves[key]).trim() : ''
  }
  const codsecao = pega(ALIAS_CODSECAO)
  return {
    chapa: pega(ALIAS_CHAPA),
    nome: pega(ALIAS_NOME),
    codsituacao: pega(ALIAS_CODSITUACAO),
    codsecao,
    regional: derivarRegional(codsecao),
    data_admissao: parseDataBR(pega(ALIAS_DATAADMISSAO)),
    dt_transferencia: parseDataBR(pega(ALIAS_DTTRANSFERENCIA)),
    data_demissao: parseDataBR(pega(ALIAS_DATADEMISSAO)),
    pispasep: pega(ALIAS_PISPASEP),
    cpf: pega(ALIAS_CPF),
  }
}

// Modelo de planilha gerado no próprio navegador — cabeçalho igual aos ALIAS_*
// (preferência: nome "canônico") + uma linha de exemplo, para o usuário saber
// exatamente o que preencher antes de montar o arquivo real.
function baixarModeloExcel() {
  const cabecalho = ['CHAPA', 'NOME', 'CODSITUACAO', 'CODSECAO', 'DATAADMISSAO', 'DTTRANSFERENCIA', 'DATADEMISSAO', 'PISPASEP', 'CPF']
  const exemplo = ['12345', 'JOÃO DA SILVA', 'ATIVO', '02.03.01.20.014', '01/03/2020', '', '', '12345678900', '12345678900']
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, exemplo])
  ws['!cols'] = cabecalho.map(c => ({ wch: Math.max(c.length + 2, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pessoas')
  XLSX.writeFile(wb, 'modelo_carga_pessoas_sesmt.xlsx')
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

export default function SesmtCargaPessoas({ usuarioLogado, onVoltar }) {
  const podeCarregar = temPermissao(usuarioLogado, 'sesmt_acesso')

  const [pessoas,   setPessoas]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [linhas,    setLinhas]    = useState([])
  const [status,    setStatus]    = useState('idle') // idle | lido | importando | ok | erro
  const [msg,       setMsg]       = useState('')

  const carregar = async () => {
    setLoading(true)
    try { setPessoas(await listarPessoasSesmt()) }
    catch (e) { setMsg('Erro ao carregar lista: ' + e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  const onFile = e => {
    const file = e.target.files[0]
    if (!file) return
    setStatus('idle')
    setMsg('')
    setLinhas([])

    const ext = file.name.split('.').pop().toLowerCase()
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let objs = []
        if (ext === 'xlsx' || ext === 'xls') {
          const wb = XLSX.read(ev.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          objs = XLSX.utils.sheet_to_json(ws, { defval: '' })
        } else {
          let texto
          try { texto = new TextDecoder('utf-8', { fatal: true }).decode(ev.target.result) }
          catch { texto = new TextDecoder('windows-1252').decode(ev.target.result) }
          objs = parseCsvTexto(texto)
        }
        const extraidas = objs.map(extrairPessoa).filter(l => l.chapa && l.nome)
        if (extraidas.length === 0) {
          setStatus('erro')
          setMsg('Nenhuma linha com CHAPA e NOME reconhecida. Confira o cabeçalho da planilha (aceita CHAPA/MATRICULA e NOME/COLABORADOR).')
          return
        }
        setLinhas(extraidas)
        setStatus('lido')
        setMsg(`✅ Arquivo lido: ${extraidas.length} pessoa(s) reconhecida(s) de ${objs.length} linha(s).`)
      } catch (err) {
        setStatus('erro')
        setMsg('Erro ao ler arquivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const importar = async () => {
    if (linhas.length === 0) return
    if (!window.confirm(
      `Confirma a importação de ${linhas.length} pessoa(s)?\n\n` +
      'Quem já está na lista tem o nome atualizado.\n' +
      'Quem não vier mais no arquivo fica marcado como inativo (não é removido).'
    )) return
    setStatus('importando')
    setMsg('')
    try {
      const resumo = await importarPessoasSesmt(linhas, usuarioLogado?.login)
      setStatus('ok')
      setMsg(`✅ Importação concluída: ${resumo.importadas} carregada(s), ${resumo.inativadas} marcada(s) como inativa(s).`)
      setLinhas([])
      await carregar()
    } catch (e) {
      setStatus('erro')
      setMsg('❌ ' + e.message)
    }
  }

  if (!podeCarregar) {
    return <div style={cardStyle}>Seu perfil não tem permissão para acessar o módulo Ações SESMT.</div>
  }

  const ativos = pessoas.filter(p => p.ativo)
  const inativos = pessoas.filter(p => !p.ativo)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>🦺 Ações SESMT — Lista de Pessoas</h1>
        <button onClick={onVoltar} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
          ← Voltar
        </button>
      </div>

      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
        Lista própria deste módulo (CHAPA + NOME), independente da Estrutura Operacional.
        Será usada para o preenchimento de participantes nas ações do SESMT (Diálogo de Segurança,
        Treinamento, Reciclagem).
      </p>

      <div style={cardStyle}>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>📤 Carregar planilha</p>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
          Arquivo Excel (.xlsx) ou CSV com colunas <strong>CHAPA</strong>, <strong>NOME</strong>, CODSITUACAO,
          CODSECAO, DATAADMISSAO, DTTRANSFERENCIA, DATADEMISSAO, PISPASEP e CPF (as duas primeiras são
          obrigatórias, as demais opcionais). <strong>REGIONAL</strong> é calculado automaticamente a partir do
          CODSECAO (02.03.01 → METROPOLITANA, 02.03.02 → NORTE, 02.03.03 a 02.03.08 → SUL).
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={onFile} />
          <button type="button" onClick={baixarModeloExcel} style={{
            background: '#f0fdfa', border: '1px solid #5eead4', borderRadius: 8,
            padding: '8px 12px', fontSize: 12, fontWeight: 700, color: '#0f766e', cursor: 'pointer',
          }}>
            📥 Baixar modelo (.xlsx)
          </button>
        </div>

        {msg && (
          <div style={{
            background: status === 'erro' ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${status === 'erro' ? '#fecaca' : '#86efac'}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 13,
            color: status === 'erro' ? '#b91c1c' : '#15803d', marginBottom: 14,
          }}>
            {msg}
          </div>
        )}

        {linhas.length > 0 && (
          <>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 14 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={thStyle}>CHAPA</th>
                    <th style={thStyle}>NOME</th>
                    <th style={thStyle}>REGIONAL</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 30).map((l, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{l.chapa}</td>
                      <td style={tdStyle}>{l.nome}</td>
                      <td style={tdStyle}>{l.regional || <span style={{ color: '#dc2626' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linhas.length > 30 && (
                <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '6px 0' }}>
                  ...e mais {linhas.length - 30} linha(s).
                </p>
              )}
            </div>

            <button onClick={importar} disabled={status === 'importando'} style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: '#0f766e', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: status === 'importando' ? 'not-allowed' : 'pointer',
              opacity: status === 'importando' ? 0.6 : 1,
            }}>
              {status === 'importando' ? '⏳ Importando...' : `Importar ${linhas.length} pessoa(s)`}
            </button>
          </>
        )}
      </div>

      <div style={cardStyle}>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>
          👥 Lista atual — {loading ? '...' : `${ativos.length} ativa(s)`}{inativos.length > 0 ? `, ${inativos.length} inativa(s)` : ''}
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Carregando...</p>
        ) : ativos.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Nenhuma pessoa carregada ainda.</p>
        ) : (
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {ativos.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <span style={{ color: '#1e293b', fontWeight: 600 }}>{p.nome}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {p.regional && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#f0fdfa', border: '1px solid #5eead4', padding: '2px 7px', borderRadius: 6 }}>
                      {p.regional}
                    </span>
                  )}
                  <span style={{ color: '#64748b' }}>{p.chapa}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
  padding: 18, marginBottom: 16,
}
const thStyle = { textAlign: 'left', padding: '6px 10px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0' }
const tdStyle = { padding: '5px 10px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' }
