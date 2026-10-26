import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase.js'
import { listarRegistros } from '../lib/registros.js'
import { listarOcorrenciasDoUsuario, numeroOcorrencia, listarColaboradoresOcorrencia } from '../lib/ocorrencias.js'
import { getVersaoApp, temPermissao } from '../lib/auth.js'
import { listarAssinaturasColetadas, listarTokensRegistro, encerrarToken } from '../lib/assinaturas.js'
import { TIPOS_REGISTRO, MODALIDADES } from '../data/registros_config.js'
import { compartilharImagemNativo, compartilharPDFNativo, renderizarHtmlParaCanvas, renderizarElementoVisivelParaCanvas, descreverErro, compartilharImagemWeb } from '../lib/compartilhar.js'
import { MARCADOR_ERRO_CONCLUSAO, MARCADOR_OBSERVACAO, parseDescricaoImportada } from '../lib/importacaoOcorrencias.js'
import { temaMotivoOcorrencia } from '../data/motivosOcorrenciaTema.js'
import MotivosRegistrosOperacionais from './MotivosRegistrosOperacionais.jsx'

// Cor de destaque de cada marcador que a importação em lote
// (lib/importacaoOcorrencias.js) grava dentro da descrição — pro supervisor
// bater o olho e perceber na hora, sem precisar ler o texto todo.
function corDoMarcador(linha) {
  if (linha.includes(MARCADOR_ERRO_CONCLUSAO)) return '#dc2626'
  if (linha.includes(MARCADOR_OBSERVACAO))     return '#1d4ed8'
  return null
}

// Destaque em HTML cru (pro PDF/Zap, montado fora do React).
function destacarDescricaoHtml(texto) {
  return (texto || '')
    .split('\n')
    .map(linha => {
      const cor = corDoMarcador(linha)
      return cor ? `<strong style="color:${cor};">${linha}</strong>` : linha
    })
    .join('<br/>')
}

// Mesmo destaque, em JSX (pro modal dentro do app) — monta elementos React
// em vez de HTML cru, pra não precisar de dangerouslySetInnerHTML aqui.
function DescricaoDestacada({ texto }) {
  const linhas = (texto || '').split('\n')
  return linhas.map((linha, i) => {
    const cor = corDoMarcador(linha)
    return (
      <span key={i}>
        {cor ? <strong style={{ color: cor }}>{linha}</strong> : linha}
        {i < linhas.length - 1 && <br />}
      </span>
    )
  })
}
import {
  useFiltrosOperacionais,
  PainelFiltros,
  MultiSelect,
  FIELD_HEIGHT, LABEL_STYLE, INPUT_STYLE,
} from '../components/PainelFiltros.jsx'

const TIPO_MEDIDA_LABEL = {
  FEEDBACK:            'Feedback',
  ADVERTENCIA_VERBAL:  'Advertência Verbal',
  ADVERTENCIA_ESCRITA: 'Advertência Escrita',
  SUSPENSAO:           'Suspensão',
}

// ─── conteúdo reaproveitável (impressão web + PDF nativo Android) ────────────
function montarConteudoImpressaoRegistro(r, assinaturasOnline = [], versaoApp = '') {
  const tipoConfig = TIPOS_REGISTRO[r.tipo]
  const modConfig  = MODALIDADES[r.modalidade]
  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const participantesRenderizados = (r.participantes || []).map(p => {
    const assinaturaOnline = assinaturasOnline.find(
      a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
    )
    const isOnline = p.modo === 'online' || (!!assinaturaOnline && !p.assinatura_url)
    return {
      ...p,
      isOnline,
      assinaturaFinal: p.assinatura_url || assinaturaOnline?.assinatura_url || null,
    }
  })

  const apenasOnline = assinaturasOnline.filter(
    a => !r.participantes?.some(p => p.nome?.trim().toLowerCase() === a.nome?.trim().toLowerCase())
  )

  return `
  <div style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
    <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">VérticeGP</div>
    <div style="font-size:20px;font-weight:800;">${tipoConfig?.emoji} ${tipoConfig?.label}</div>
    <div style="font-size:13px;opacity:0.8;margin-top:2px;">${modConfig?.label}</div>
  </div>
  ${r.tipo === 'DISCIPLINAR' && r.tipo_medida ? `<div style="background:${tipoConfig?.bg};border:2px solid ${tipoConfig?.color};border-radius:12px;padding:12px 16px;margin-bottom:16px;text-align:center;"><span style="font-size:16px;font-weight:800;color:${tipoConfig?.color};">${TIPO_MEDIDA_LABEL[r.tipo_medida]||r.tipo_medida}</span></div>` : ''}
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;">Dados do Registro</div>
    <table style="width:100%;border-collapse:collapse;">
      ${[['Fiscal',r.fiscal],['Matrícula',r.matricula_fiscal],['Data/Hora',`${formatData(r.data_registro)} às ${r.hora_registro}`],['Local',r.endereco],['GPS',r.lat?`${r.lat}, ${r.lng}`:null],['Tema',r.tema],['Carga Horária',r.carga_horaria]].filter(([,v])=>v).map(([l,v])=>`<tr><td style="padding:7px 10px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${l}</td><td style="padding:7px 10px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`).join('')}
    </table>
  </div>
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">${r.tipo==='DISCIPLINAR'?'Descrição da Ocorrência':'Pauta / Conteúdo'}</div>
    <div style="font-size:13px;color:#475569;line-height:1.7;">${r.pauta||''}</div>
  </div>
  ${r.observacoes ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">Observações</div>
    <div style="font-size:13px;color:#475569;line-height:1.7;">${r.observacoes}</div>
  </div>` : ''}
  ${participantesRenderizados.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:16px;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;">LISTA DE FREQUÊNCIA (${participantesRenderizados.length + apenasOnline.length})</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#1e3a5f;">
        <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;">Nº</th>
        <th style="padding:8px 10px;color:#fff;font-size:12px;text-align:left;">Nome</th>
        <th style="padding:8px 10px;color:#fff;font-size:12px;">Mat.</th>
        <th style="padding:8px 10px;color:#fff;font-size:12px;">Assinatura / Status</th>
      </tr>
      ${participantesRenderizados.map((p,i)=>`
        <tr style="border-bottom:1px solid #f1f5f9;${p.isOnline?'background:#eff6ff;':''}">
          <td style="padding:8px 10px;font-size:13px;">${i+1}</td>
          <td style="padding:8px 10px;font-size:13px;font-weight:600;">
            ${p.nome}
            ${p.isOnline?'<span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>':''}
          </td>
          <td style="padding:8px 10px;font-size:13px;text-align:center;">${p.matricula||'—'}</td>
          <td style="padding:4px 8px;">
            ${p.assinaturaFinal
              ? `<img src="${p.assinaturaFinal}" style="height:40px;max-width:120px;object-fit:contain;" crossorigin="anonymous"/>`
              : p.isOnline
                ? '<span style="font-size:11px;color:#f59e0b;background:#fef3c7;padding:2px 6px;border-radius:4px;border:1px solid #fcd34d;">⏳ Aguardando assinatura</span>'
                : '<span style="font-size:11px;color:#94a3b8;">—</span>'
            }
          </td>
        </tr>`).join('')}
      ${apenasOnline.map((a,i)=>`
        <tr style="border-bottom:1px solid #f1f5f9;background:#eff6ff;">
          <td style="padding:8px 10px;font-size:13px;">${participantesRenderizados.length+i+1}</td>
          <td style="padding:8px 10px;font-size:13px;font-weight:600;">
            ${a.nome}
            <span style="font-size:10px;color:#1d4ed8;background:#dbeafe;padding:1px 5px;border-radius:4px;margin-left:4px;">🔗 online</span>
          </td>
          <td style="padding:8px 10px;font-size:13px;text-align:center;">${a.matricula||'—'}</td>
          <td style="padding:4px 8px;">${a.assinatura_url?`<img src="${a.assinatura_url}" style="height:40px;max-width:120px;object-fit:contain;" crossorigin="anonymous"/>`:''}</td>
        </tr>`).join('')}
    </table>
  </div>` : ''}
  ${Array.isArray(r.fotos_urls) && r.fotos_urls.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">📷 Fotos (${r.fotos_urls.length})</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${r.fotos_urls.map(url=>`<img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;display:block;"/>`).join('')}
    </div>
  </div>` : ''}
  <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">VérticeGP · Plataforma de Gestão Operacional</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR',{dateStyle:'long'})} · <span style="color:#dc2626;">v${versaoApp}</span></p>
  </div>`
}

// Web: abre popup com o registro e chama print() nele — mantido igual.
function imprimirRegistro(r, assinaturasOnline = [], versaoApp = '') {
  const tipoConfig = TIPOS_REGISTRO[r.tipo]
  const conteudo = montarConteudoImpressaoRegistro(r, assinaturasOnline, versaoApp)
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${tipoConfig?.label}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:24px;}
  @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}@page{margin:15mm;}}</style></head><body>
  ${conteudo}
  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`

  const janela = window.open('', '_blank', 'width=700,height=900')
  if (!janela) { alert('Permita pop-ups.'); return }
  janela.document.write(html)
  janela.document.close()
  janela.onload = () => setTimeout(() => janela.print(), 600)
}

// App Android nativo: window.open()/window.print() não funcionam dentro do
// WebView — monta um PDF de verdade a partir do mesmo conteúdo e compartilha
// via folha nativa do Android.
async function gerarPDFRegistro(r, assinaturasOnline = [], versaoApp = '') {
  const tipoConfig = TIPOS_REGISTRO[r.tipo]
  const conteudo = montarConteudoImpressaoRegistro(r, assinaturasOnline, versaoApp)
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:24px;box-sizing:border-box;width:700px;color:#1e293b;">${conteudo}</div>`
  const canvas = await renderizarHtmlParaCanvas(html, {
    largura: 700, escala: 4, aguardarImagens: true, esperaExtraMs: 80, corFundo: '#fff',
  })
  const nomeArq = `Registro_${r.tipo}_${r.data_registro}.pdf`.replace(/\s+/g, '_')
  await compartilharPDFNativo(canvas, nomeArq, { titulo: tipoConfig?.label })
}

// ─── Conteúdo reaproveitável (impressão + PDF + imagem WhatsApp) de uma
// Ocorrência — mesmo padrão de montarConteudoImpressaoRegistro, mas inclui
// também os dados do TRATAMENTO (observação, colaborador(es) cientificado(s)
// e as fotos do tratamento), não só os dados da abertura.
// `colaboradoresOc` (opcional): lista completa de ocorrencias_colaboradores
// já carregada (ver listarColaboradoresOcorrencia) — quando presente e não
// vazia, mostra TODOS os que assinaram (equipe dinâmica, ver
// TratamentoNaoConformidades.jsx), não só os 2 primeiros das colunas
// tratamento_assinatura_*/tratamento_assinatura2_* (usadas como
// fallback pra ocorrências antigas, sem linhas na tabela nova).
function montarConteudoImpressaoOcorrencia(oc, versaoApp = '', colaboradoresOc = null) {
  const pendente = oc.status === 'PENDENTE'
  const ehGenerica = oc.tipo_ocorrencia === 'OCORRENCIA_GENERICA'
  const formatDataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '—'
  const modoEquipe = Array.isArray(colaboradoresOc) && colaboradoresOc.length > 0
  // Nomes em linhas separadas — mesmo padrão do modal (ver detalheOc em
  // RegistrosOperacionais.jsx) em vez de um resumo "N colaborador(es) da
  // equipe".
  const colaboradoresNomeados = modoEquipe
    ? colaboradoresOc.map((c, i) => [`Colaborador ${i + 1}`, c.nome])
    : [oc.eletricista_equipe, oc.eletricista_equipe_2]
        .map((nome, i) => [`Colaborador ${i + 1}`, nome])
        .filter(([, nome]) => nome)
  const assinantes = modoEquipe
    ? colaboradoresOc.filter(c => c.assinatura_url).map(c => ({ nome: c.nome, url: c.assinatura_url }))
    : [
        { nome: oc.tratamento_assinatura_nome,  url: oc.tratamento_assinatura_url },
        { nome: oc.tratamento_assinatura2_nome, url: oc.tratamento_assinatura2_url },
      ].filter(a => a.nome || a.url)
  const tituloAssinantes = modoEquipe
    ? `✍️ COLABORADOR(ES) CIENTIFICADO(S) (${assinantes.length} de ${colaboradoresOc.length})`
    : '✍️ COLABORADOR(ES) CIENTIFICADO(S)'

  // Dados Técnicos (só Retrabalho) — mesma lógica do modal: prefere as
  // colunas estruturadas, cai pro texto da descrição importada em lote
  // (ocorrências antigas, antes dessas colunas existirem) quando vazias.
  const parsedDescricao = !ehGenerica ? parseDescricaoImportada(oc.descricao) : null
  const dadosTecnicos = !ehGenerica ? [
    ['UC', oc.uc || parsedDescricao?.uc],
    ['OS', oc.os || parsedDescricao?.os],
    ['Registro de Execução', oc.registro_execucao || parsedDescricao?.registroExec],
    ['Data de Conclusão', oc.data_conclusao || parsedDescricao?.dataConclusao],
  ].filter(([, v]) => v) : []
  const descricaoExibida = (!ehGenerica && parsedDescricao)
    ? [
        'IMPORTADO EM LOTE VIA PLANILHA',
        parsedDescricao.observacao ? `\n📝 ${MARCADOR_OBSERVACAO}: ${parsedDescricao.observacao}` : '',
        parsedDescricao.erroConclusao ? `\n⚠️ ${MARCADOR_ERRO_CONCLUSAO}: ${parsedDescricao.erroConclusao}` : '',
      ].filter(Boolean).join('\n')
    : oc.descricao

  return `
  <div style="background:linear-gradient(135deg,#4338ca,#6d28d9);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
    <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">VérticeGP</div>
    <div style="font-size:20px;font-weight:800;">${ehGenerica ? '📦 Abertura de Ocorrência' : '🔧 Tratamento de Retrabalho'}</div>
    <div style="font-size:13px;opacity:0.8;margin-top:2px;">${numeroOcorrencia(oc)}</div>
  </div>
  <div style="text-align:center;margin-bottom:16px;">
    <span style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:13px;font-weight:700;background:${pendente ? '#e0e7ff' : '#dcfce7'};color:${pendente ? '#3730a3' : '#15803d'};">${pendente ? '🟣 Pendente' : '🟢 Tratada'}</span>
  </div>
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;">${ehGenerica ? 'Dados da Ocorrência' : 'Dados do Retrabalho'}</div>
    <table style="width:100%;border-collapse:collapse;">
      ${[['Aberto por', oc.aberto_por], ['Data/Hora', formatDataHora(oc.criado_em)], ['Prefixo/Equipe', oc.prefixo], ...colaboradoresNomeados, ['Direcionado para', oc.direcionado_para], ...(ehGenerica ? [['Local', oc.endereco]] : [])].filter(([, v]) => v).map(([l, v]) => `<tr><td style="padding:7px 10px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${l}</td><td style="padding:7px 10px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`).join('')}
    </table>
  </div>
  ${ehGenerica && oc.motivo ? (() => {
    const tema = temaMotivoOcorrencia(oc.motivo)
    return `<div style="background:${tema.bg};border:1.5px solid ${tema.border};border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:24px;">${tema.emoji}</div>
      <div>
        <div style="font-size:10px;font-weight:700;color:${tema.color};text-transform:uppercase;letter-spacing:0.5px;">Motivo</div>
        <div style="font-size:15px;font-weight:800;color:${tema.color};">${oc.motivo}</div>
      </div>
    </div>`
  })() : ''}
  ${dadosTecnicos.length > 0 ? `
  <div style="background:#eef2ff;border:1.5px solid #c7d2fe;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#3730a3;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.4px;">📊 Dados Técnicos</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:0;">
      ${dadosTecnicos.map(([l, v]) => `
        <div style="padding:7px 10px 7px 0;">
          <div style="font-size:10px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:0.3px;">${l}</div>
          <div style="font-size:13px;font-weight:800;color:#312e81;margin-top:2px;">${v}</div>
        </div>`).join('')}
    </div>
  </div>` : ''}
  <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#3730a3;margin-bottom:8px;">DESCRIÇÃO${ehGenerica ? ' DA OCORRÊNCIA' : ''}</div>
    <div style="font-size:13px;color:#3730a3;line-height:1.7;">${destacarDescricaoHtml(descricaoExibida)}</div>
  </div>
  ${!pendente ? `
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;">✅ TRATAMENTO</div>
    <div style="font-size:13px;color:#15803d;line-height:1.7;">${oc.tratamento_observacao || ''}</div>
  </div>` : ''}
  ${!pendente && assinantes.length > 0 ? `
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;">${tituloAssinantes}</div>
    ${assinantes.map((a, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;${i > 0 ? 'border-top:1px solid #bbf7d0;' : ''}">
        <span style="font-size:13px;font-weight:700;color:#15803d;">${a.nome || '—'}</span>
        ${a.url ? `<img src="${a.url}" crossorigin="anonymous" style="height:44px;max-width:120px;object-fit:contain;background:#fff;border-radius:6px;border:1px solid #bbf7d0;"/>` : ''}
      </div>`).join('')}
  </div>` : ''}
  ${!pendente ? `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">👤 TRATADA POR</div>
    ${[['Matrícula', oc.tratado_por], ['Nome', oc.tratado_por_nome], ['Data / Hora', formatDataHora(oc.tratado_em)]].filter(([, v]) => v).map(([l, v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span style="color:#94a3b8;">${l}</span><span style="color:#1e293b;font-weight:600;">${v}</span></div>`).join('')}
  </div>` : ''}
  ${oc.foto_url ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">📷 Foto da Ocorrência</div>
    <img src="${oc.foto_url}" crossorigin="anonymous" style="width:100%;max-width:300px;border-radius:8px;display:block;"/>
  </div>` : ''}
  ${Array.isArray(oc.tratamento_fotos_urls) && oc.tratamento_fotos_urls.length > 0 ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">📷 Fotos do Tratamento (${oc.tratamento_fotos_urls.length})</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${oc.tratamento_fotos_urls.map(url => `<img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;display:block;"/>`).join('')}
    </div>
  </div>` : ''}
  <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">VérticeGP · Plataforma de Gestão Operacional</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })} · <span style="color:#dc2626;">v${versaoApp}</span></p>
  </div>`
}

function imprimirOcorrenciaDoc(oc, versaoApp = '', colaboradoresOc = null) {
  const titulo = oc.tipo_ocorrencia === 'OCORRENCIA_GENERICA' ? 'Abertura de Ocorrência' : 'Tratamento de Retrabalho'
  const conteudo = montarConteudoImpressaoOcorrencia(oc, versaoApp, colaboradoresOc)
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${titulo}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:24px;}
  @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}@page{margin:15mm;}}</style></head><body>
  ${conteudo}
  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:#4338ca;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`

  const janela = window.open('', '_blank', 'width=700,height=900')
  if (!janela) { alert('Permita pop-ups.'); return }
  janela.document.write(html)
  janela.document.close()
  janela.onload = () => setTimeout(() => janela.print(), 600)
}

async function gerarPDFOcorrenciaDoc(oc, versaoApp = '', colaboradoresOc = null) {
  const titulo = oc.tipo_ocorrencia === 'OCORRENCIA_GENERICA' ? 'Abertura de Ocorrência' : 'Tratamento de Retrabalho'
  const conteudo = montarConteudoImpressaoOcorrencia(oc, versaoApp, colaboradoresOc)
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:24px;box-sizing:border-box;width:700px;color:#1e293b;">${conteudo}</div>`
  const canvas = await renderizarHtmlParaCanvas(html, {
    largura: 700, escala: 4, aguardarImagens: true, esperaExtraMs: 80, corFundo: '#fff',
  })
  const nomeArq = `Ocorrencia_${oc.numero_ocorrencia || oc.id}.pdf`.replace(/\s+/g, '_')
  await compartilharPDFNativo(canvas, nomeArq, { titulo })
}

// ─── Mesmo padrão de montarConteudoImpressaoOcorrencia, pra Tratamento de
// Reincidência — tema laranja (combina com a tela de lançamento). Espelha
// EXATAMENTE os campos/seções do modal de detalhe (ver o bloco `detalheReinc`
// mais abaixo): selo Pendente/Tratada, Dados do Lançamento (Fiscal, Matrícula,
// Equipe, Eletricista 1/2...), Dados Técnicos + reincidências por período, e,
// quando tratada, a seção de Tratamento inteira (checklist, ciência,
// assinaturas e fotos de evidência) — pra imagem/PDF compartilhados baterem
// com o que aparece na tela, em vez de mostrar só os dados de abertura.
function montarConteudoImpressaoReincidencia(r, versaoApp = '') {
  const pendente = r.status === 'PENDENTE'
  const formatDataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '—'
  const dadosTecnicos = [
    ['OE', r.numero_oe], ['ABRG', r.abrangencia], ['PDF', r.componente_pdf], ['AL', r.alimentador_al],
  ].filter(([, v]) => v)
  const reincidenciasPeriodo = [
    ['7 dias', r.reincidencia_r07], ['30 dias', r.reincidencia_r30], ['90 dias', r.reincidencia_r90],
  ].filter(([, v]) => v)
  const assinantesTratamento = [
    ['Eletricista 1', r.tratamento_assinatura_nome, r.tratamento_assinatura_url],
    ['Eletricista 2', r.tratamento_assinatura2_nome, r.tratamento_assinatura2_url],
    ['Termo de Ciência do Fiscal', r.reincidencia_termo_fiscal_nome, r.reincidencia_termo_fiscal_assinatura_url],
  ].filter(([, , url]) => url)

  return `
  <div style="background:linear-gradient(135deg,#c2410c,#ea580c);color:#fff;padding:20px 24px;border-radius:14px;margin-bottom:16px;">
    <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">VérticeGP</div>
    <div style="font-size:20px;font-weight:800;">🔁 Tratamento de Reincidência</div>
    <div style="font-size:13px;opacity:0.8;margin-top:2px;">${numeroOcorrencia(r)}</div>
  </div>
  <div style="text-align:center;margin-bottom:16px;">
    <span style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:13px;font-weight:700;background:${pendente ? '#fff7ed' : '#dcfce7'};color:${pendente ? '#9a3412' : '#15803d'};border:1.5px solid ${pendente ? '#fed7aa' : '#86efac'};">${pendente ? '🟣 Pendente' : '🟢 Tratada'}</span>
  </div>
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:4px 0;margin-bottom:16px;">
    <div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;">Dados do Lançamento</div>
    <table style="width:100%;border-collapse:collapse;">
      ${[
        ['Fiscal', r.aberto_por],
        ['Matrícula', r.matricula_aberto_por],
        ['Data/Hora', formatDataHora(r.criado_em)],
        ['Equipe', r.prefixo],
        ['Direcionado para', r.direcionado_para],
        ['Eletricista 1', r.eletricista_equipe],
        ['Eletricista 2', r.eletricista_equipe_2],
      ].filter(([, v]) => v).map(([l, v]) => `<tr><td style="padding:7px 10px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">${l}</td><td style="padding:7px 10px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`).join('')}
    </table>
  </div>
  ${(dadosTecnicos.length > 0 || reincidenciasPeriodo.length > 0) ? `
  <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:14px;padding:14px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">📊 Dados Técnicos</div>
    ${dadosTecnicos.length > 0 ? `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-bottom:${reincidenciasPeriodo.length > 0 ? '10px' : '0'};">
      ${dadosTecnicos.map(([l, v]) => `
        <div style="padding:6px 8px;">
          <div style="font-size:10px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:0.3px;">${l}</div>
          <div style="font-size:14px;font-weight:800;color:#7c2d12;margin-top:2px;">${v}</div>
        </div>`).join('')}
    </div>` : ''}
    ${reincidenciasPeriodo.length > 0 ? `
    <div style="display:grid;grid-template-columns:repeat(${reincidenciasPeriodo.length},1fr);gap:8px;">
      ${reincidenciasPeriodo.map(([l, v]) => `
        <div style="background:#fff;border:1.5px solid #fdba74;border-radius:10px;padding:10px 6px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#c2410c;line-height:1;">${v}</div>
          <div style="font-size:9.5px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.3px;margin-top:3px;">Reinc. ${l}</div>
        </div>`).join('')}
    </div>` : ''}
  </div>` : ''}
  ${r.motivo ? (() => {
    const tema = temaMotivoOcorrencia(r.motivo)
    return `<div style="background:${tema.bg};border:1.5px solid ${tema.border};border-radius:14px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
      <div style="font-size:24px;">${tema.emoji}</div>
      <div>
        <div style="font-size:10px;font-weight:700;color:${tema.color};text-transform:uppercase;letter-spacing:0.5px;">Motivo</div>
        <div style="font-size:15px;font-weight:800;color:${tema.color};">${r.motivo}</div>
      </div>
    </div>`
  })() : ''}
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#9a3412;margin-bottom:8px;">DESCRIÇÃO DA REINCIDÊNCIA</div>
    <div style="font-size:13px;color:#9a3412;line-height:1.7;">${(r.descricao || '').split('\n').join('<br/>')}</div>
  </div>
  ${r.foto_url ? `
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">📷 Foto da Reincidência</div>
    <img src="${r.foto_url}" crossorigin="anonymous" style="width:100%;max-width:300px;border-radius:8px;display:block;"/>
  </div>` : ''}
  ${!pendente ? `
  <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:14px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px;">✅ Tratamento</div>
    <div style="font-size:12px;color:#166534;margin-bottom:10px;"><strong>Tratado por</strong> ${r.tratado_por_nome || r.tratado_por || '—'} em ${formatDataHora(r.tratado_em)}</div>

    <div style="font-size:10.5px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;">📋 Respostas do checklist</div>
    <div style="display:flex;justify-content:space-between;background:#fff;border-radius:8px;padding:7px 10px;font-size:11.5px;margin-bottom:6px;">
      <span>1. Rede BT inspecionada?</span>
      <strong style="color:${r.reincidencia_rede_inspecionada ? '#15803d' : '#b91c1c'};">${r.reincidencia_rede_inspecionada ? 'SIM' : 'NÃO'}</strong>
    </div>
    ${r.reincidencia_acoes_equipe ? `<div style="background:#fff;border-radius:8px;padding:7px 10px;font-size:11.5px;margin-bottom:6px;"><span style="display:block;color:#64748b;margin-bottom:2px;">2. Ações executadas pela equipe:</span><strong style="color:#1e293b;">${r.reincidencia_acoes_equipe}</strong></div>` : ''}
    ${r.reincidencia_leituras_eletricas ? `<div style="background:#fff;border-radius:8px;padding:7px 10px;font-size:11.5px;margin-bottom:6px;"><span style="display:block;color:#64748b;margin-bottom:2px;">3. Leituras elétricas:</span><strong style="color:#1e293b;">${r.reincidencia_leituras_eletricas}</strong></div>` : ''}
    <div style="display:flex;justify-content:space-between;background:#fff;border-radius:8px;padding:7px 10px;font-size:11.5px;margin-bottom:6px;">
      <span>4. Resolveu em definitivo?</span>
      <strong style="color:${r.reincidencia_resolvido_definitivo ? '#15803d' : '#b91c1c'};">${r.reincidencia_resolvido_definitivo ? 'SIM' : 'NÃO'}</strong>
    </div>
    ${r.reincidencia_vulnerabilidades ? `<div style="background:#fff;border-radius:8px;padding:7px 10px;font-size:11.5px;margin-bottom:10px;"><span style="display:block;color:#64748b;margin-bottom:2px;">5. Vulnerabilidades estruturais:</span><strong style="color:#1e293b;">${r.reincidencia_vulnerabilidades}</strong></div>` : ''}

    ${(r.tratamento_assinatura_nome || r.tratamento_assinatura2_nome || r.reincidencia_termo_fiscal_nome) ? `
    <div style="font-size:10.5px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:0.3px;margin:10px 0 6px;">✍️ Ciência</div>
    ${(r.tratamento_assinatura_nome || r.tratamento_assinatura2_nome) ? `<div style="font-size:11.5px;color:#1e293b;margin-bottom:4px;"><strong>Eletricistas:</strong> ${[r.tratamento_assinatura_nome, r.tratamento_assinatura2_nome].filter(Boolean).join(' e ')}</div>` : ''}
    ${r.reincidencia_termo_fiscal_nome ? `<div style="font-size:11.5px;color:#1e293b;margin-bottom:10px;"><strong>Termo de Ciência do Fiscal:</strong> ${r.reincidencia_termo_fiscal_nome}</div>` : ''}
    ` : ''}

    ${assinantesTratamento.length > 0 ? `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      ${assinantesTratamento.map(([label, nome, url]) => `
        <div style="width:140px;">
          <img src="${url}" crossorigin="anonymous" style="width:100%;height:100px;object-fit:contain;border-radius:8px;background:#fff;border:1.5px solid #cbd5e1;padding:6px;display:block;"/>
          <div style="font-size:10.5px;color:#166534;text-align:center;margin-top:4px;font-weight:700;">${label}</div>
          ${nome ? `<div style="font-size:10px;color:#166534;opacity:0.8;text-align:center;">${nome}</div>` : ''}
        </div>`).join('')}
    </div>` : ''}

    ${Array.isArray(r.tratamento_fotos_urls) && r.tratamento_fotos_urls.length > 0 ? `
    <div style="font-size:10.5px;font-weight:800;color:#166534;text-transform:uppercase;letter-spacing:0.3px;margin:4px 0 6px;">📷 Evidências do tratamento</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${r.tratamento_fotos_urls.map(url => `<img src="${url}" crossorigin="anonymous" style="width:54px;height:54px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;"/>`).join('')}
    </div>` : ''}
  </div>` : ''}
  <div style="border-top:1px solid #e2e8f0;padding-top:14px;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;">VérticeGP · Plataforma de Gestão Operacional</p>
    <p style="font-size:10px;color:#cbd5e1;margin-top:2px;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })} · <span style="color:#dc2626;">v${versaoApp}</span></p>
  </div>`
}

function imprimirReincidenciaDoc(r, versaoApp = '') {
  const conteudo = montarConteudoImpressaoReincidencia(r, versaoApp)
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Tratamento de Reincidência</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:24px;}
  @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}@page{margin:15mm;}}</style></head><body>
  ${conteudo}
  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 32px;background:#c2410c;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  </body></html>`

  const janela = window.open('', '_blank', 'width=700,height=900')
  if (!janela) { alert('Permita pop-ups.'); return }
  janela.document.write(html)
  janela.document.close()
  janela.onload = () => setTimeout(() => janela.print(), 600)
}

async function gerarPDFReincidenciaDoc(r, versaoApp = '') {
  const conteudo = montarConteudoImpressaoReincidencia(r, versaoApp)
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;padding:24px;box-sizing:border-box;width:700px;color:#1e293b;">${conteudo}</div>`
  const canvas = await renderizarHtmlParaCanvas(html, {
    largura: 700, escala: 4, aguardarImagens: true, esperaExtraMs: 80, corFundo: '#fff',
  })
  const nomeArq = `Reincidencia_${r.numero_ocorrencia || r.id}.pdf`.replace(/\s+/g, '_')
  await compartilharPDFNativo(canvas, nomeArq, { titulo: 'Tratamento de Reincidência' })
}

export default function RegistrosOperacionais({ usuarioLogado, onVoltar, onNovo }) {
  // ─── Hook do painel: Período + Sup. Op + Sup. Campo + Prefixo ───
  // Passa `usuarioLogado` pra ativar segregação por estrutura.
  const filtros = useFiltrosOperacionais({ inicializarMes: true, usuarioLogado })
  const podeCadastrarMotivos = temPermissao(usuarioLogado, 'cadastrar_motivos_registros')
  const [mostrarMotivos, setMostrarMotivos] = useState(false)

  // ─── Restrição por tipo de Registro Operacional (perfis como ANALISTA II)
  // — permissão nova `registro_tipo_<TIPO>`, uma por tipo, configurada em
  // Gestão de Usuários → Permissões por Perfil. Sem NENHUMA marcada, o
  // perfil continua vendo todos os tipos (comportamento de sempre, ninguém
  // que já usa o sistema hoje é afetado). Com pelo menos uma marcada, só os
  // tipos marcados aparecem — na lista, no filtro e no resumo.
  const TIPOS_REGISTRO_TODOS = [...Object.keys(TIPOS_REGISTRO), 'OCORRENCIA', 'REINCIDENCIA', 'OCORRENCIA_GENERICA']
  const tiposPermitidos = (() => {
    const permitidos = TIPOS_REGISTRO_TODOS.filter(t => temPermissao(usuarioLogado, `registro_tipo_${t}`))
    return permitidos.length > 0 ? permitidos : null
  })()

  // ─── Filtros EXTRAS desta tela ───
  const [tiposSel,   setTiposSel]   = useState([])   // multi select — [] = Todos
  const [fiscaisSel, setFiscaisSel] = useState([])   // multi select
  // Status só se aplica a Ocorrências (único tipo com ciclo pendente/tratada
  // — os demais tipos de Registro já nascem concluídos) — single select
  const [statusOcorrenciaSel, setStatusOcorrenciaSel] = useState('')

  const [registros,     setRegistros]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [ocorrencias,   setOcorrencias]   = useState([])
  const [reincidencias, setReincidencias] = useState([])
  const [genericas,     setGenericas]     = useState([]) // Ocorrência Genérica (tipo_ocorrencia 'OCORRENCIA_GENERICA') — ver seção 4.5 do CLAUDE.md
  const [detalhe,       setDetalhe]       = useState(null)
  const [detalheOc,     setDetalheOc]     = useState(null) // ocorrência aberta no modal de PDF/Zap
  const [detalheReinc,  setDetalheReinc]  = useState(null) // reincidência aberta no modal de PDF/Zap
  // Equipe completa (ocorrencias_colaboradores) da Ocorrência aberta no
  // modal — null = ainda não buscou/sem ocorrência aberta; [] = buscou e
  // não achou (ocorrência antiga, sem linhas na tabela nova) — mesmo padrão
  // de fallback do CardOcorrencia em TratamentoNaoConformidades.jsx.
  const [colaboradoresOc, setColaboradoresOc] = useState(null)
  useEffect(() => {
    if (!detalheOc) { setColaboradoresOc(null); return }
    setColaboradoresOc(null)
    listarColaboradoresOcorrencia(detalheOc.id).then(setColaboradoresOc).catch(() => setColaboradoresOc([]))
  }, [detalheOc])
  const [capturandoOc,  setCapturandoOc]  = useState(false)
  const [gerandoPDFOc,  setGerandoPDFOc]  = useState(false)
  const [capturandoReinc, setCapturandoReinc] = useState(false)
  const [gerandoPDFReinc, setGerandoPDFReinc] = useState(false)
  // Aponta pro card já renderizado no modal de detalhe da Reincidência —
  // capturado direto (ver renderizarElementoVisivelParaCanvas) pro
  // compartilhamento no WhatsApp sair idêntico ao que está na tela.
  const reincConteudoRef = useRef(null)
  const [assinOnline,   setAssinOnline]   = useState([])
  const [loadingOnline, setLoadingOnline] = useState(false)
  const [tokensAtivos,  setTokensAtivos]  = useState({})
  const [encerrando,    setEncerrando]    = useState(null)
  const [fiscaisLista,  setFiscaisLista]  = useState([])
  const [capturando,    setCapturando]    = useState(false)
  const [gerandoPDF,    setGerandoPDF]    = useState(false)
  const [versaoSistema, setVersaoSistema] = useState(getVersaoApp())
  const intervalRef = useRef(null)

  // Mesmo padrão do WhatsApp dos Registros comuns (html2canvas + share nativo
  // Android / Web Share API / download), reaproveitando o mesmo conteúdo
  // usado no PDF (montarConteudoImpressaoOcorrencia) — inclui abertura +
  // tratamento (observação, cientificados e fotos do tratamento).
  const compartilharOcorrenciaWhatsApp = async (oc) => {
    setCapturandoOc(true)
    try {
      const titulo = oc.tipo_ocorrencia === 'OCORRENCIA_GENERICA' ? 'Abertura de Ocorrência' : 'Tratamento de Retrabalho'
      const conteudo = montarConteudoImpressaoOcorrencia(oc, versaoSistema, colaboradoresOc)
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:640px;">${conteudo}</div>`
      const canvas = await renderizarHtmlParaCanvas(html, { largura: 640, escala: 6, aguardarImagens: true, esperaExtraMs: 80, corFundo: '#f0f4f8' })
      const nomeArq = `Ocorrencia_${oc.numero_ocorrencia || oc.id}.png`.replace(/\s+/g, '_')
      if (Capacitor.isNativePlatform()) {
        await compartilharImagemNativo(canvas, nomeArq, { titulo })
      } else {
        await compartilharImagemWeb(canvas, nomeArq, { titulo })
      }
    } catch (err) {
      console.error(err); alert('Não foi possível gerar a imagem: ' + descreverErro(err))
    } finally {
      setCapturandoOc(false)
    }
  }

  // Diferente de compartilharOcorrenciaWhatsApp (que remonta o conteúdo como
  // HTML string à parte, via montarConteudoImpressaoOcorrencia), aqui
  // capturamos direto o card já renderizado no modal de detalhe
  // (reincConteudoRef) — só chamado com o modal aberto, então o ref sempre
  // existe. Garante que a imagem enviada no WhatsApp sai idêntica ao que o
  // fiscal/analista está vendo na tela, sem precisar manter dois lugares
  // (JSX do modal + string HTML) sincronizados a cada campo novo.
  const compartilharReincidenciaWhatsApp = async (r) => {
    setCapturandoReinc(true)
    try {
      const canvas = await renderizarElementoVisivelParaCanvas(reincConteudoRef.current, { escala: 4, corFundo: '#fff' })
      const nomeArq = `Reincidencia_${r.numero_ocorrencia || r.id}.png`.replace(/\s+/g, '_')
      if (Capacitor.isNativePlatform()) {
        await compartilharImagemNativo(canvas, nomeArq, { titulo: 'Tratamento de Reincidência' })
      } else {
        await compartilharImagemWeb(canvas, nomeArq, {
          titulo: 'Tratamento de Reincidência',
          mensagem: `Segue em anexo o registro de Reincidência "nº ${r.numero_ocorrencia || r.id}.png" para tratamento !`,
        })
      }
    } catch (err) {
      console.error(err); alert('Não foi possível gerar a imagem: ' + descreverErro(err))
    } finally {
      setCapturandoReinc(false)
    }
  }

  // ADMIN sempre vê tudo (temPermissao já libera); os demais só com a
  // permissão marcada em Gestão de Usuários, senão só os próprios registros.
  const podeVerTodos = temPermissao(usuarioLogado, 'ver_todos_registros_operacionais')

  const buscar = async () => {
    setLoading(true)
    try {
      const { ini, fim } = filtros.getDatasQuery()
      if (!ini || !fim) {
        setRegistros([])
        setTokensAtivos({})
        setOcorrencias([])
        setReincidencias([])
        setGenericas([])
        setLoading(false)
        return
      }

      // ─── Tratamento de Retrabalho, Reincidências e Ocorrência Genérica
      // abertos pelo usuário (ou todos, se privilegiado) ─── Mesma tabela
      // (`ocorrencias`), discriminados por tipo_ocorrencia. Aparecem junto
      // com os registros normais nesta tela pra fins de busca/
      // acompanhamento — status PENDENTE/TRATADA acompanha o que foi feito
      // em Tratamento de Não Conformidades (só pra Retrabalho; Reincidência
      // e Genérica ainda não têm esse fluxo — fase futura). Respeita o
      // filtro Tipo (multi-select): some se houver tipos selecionados e
      // nenhum deles for Retrabalho/Reincidência/Genérica.
      // "Todos" (tiposSel vazio) passa a significar "todos os tipos
      // PERMITIDOS" — pra perfis sem restrição (tiposPermitidos null) isso
      // já é a lista inteira de sempre; pra um perfil restrito (ex: ANALISTA
      // II só com Reincidência), equivale a só aquele tipo, mesmo sem a
      // pessoa precisar mexer no filtro.
      const tiposSelEfetivo = tiposPermitidos
        ? (tiposSel.length > 0 ? tiposSel.filter(t => tiposPermitidos.includes(t)) : tiposPermitidos)
        : tiposSel
      const tiposRegistroSel = tiposSelEfetivo.filter(t => t !== 'OCORRENCIA' && t !== 'REINCIDENCIA' && t !== 'OCORRENCIA_GENERICA')
      const mostrarOcorrencias = tiposSelEfetivo.length === 0 || tiposSelEfetivo.includes('OCORRENCIA')
      const mostrarReincidencias = tiposSelEfetivo.length === 0 || tiposSelEfetivo.includes('REINCIDENCIA')
      const mostrarGenericas = tiposSelEfetivo.length === 0 || tiposSelEfetivo.includes('OCORRENCIA_GENERICA')
      if (!mostrarOcorrencias && !mostrarReincidencias && !mostrarGenericas) {
        setOcorrencias([])
        setReincidencias([])
        setGenericas([])
      } else {
        try {
          const ocData = await listarOcorrenciasDoUsuario(usuarioLogado)
          let ocNoPeriodo = ocData.filter(o => o.criado_em >= `${ini}T00:00:00` && o.criado_em <= `${fim}T23:59:59`)
          if (statusOcorrenciaSel) ocNoPeriodo = ocNoPeriodo.filter(o => o.status === statusOcorrenciaSel)
          const ocFiltradas = filtros.filtrar(ocNoPeriodo, { prefixoField: 'prefixo' })
          setOcorrencias(mostrarOcorrencias ? ocFiltradas.filter(o => (o.tipo_ocorrencia || 'OCORRENCIA') === 'OCORRENCIA') : [])
          setReincidencias(mostrarReincidencias ? ocFiltradas.filter(o => o.tipo_ocorrencia === 'REINCIDENCIA') : [])
          setGenericas(mostrarGenericas ? ocFiltradas.filter(o => o.tipo_ocorrencia === 'OCORRENCIA_GENERICA') : [])
        } catch (e) {
          console.error('Erro ao carregar ocorrências:', e)
          setOcorrencias([])
          setReincidencias([])
          setGenericas([])
        }
      }

      // ─── 1) Determina supervisores permitidos combinando 2 fontes ───
      // a) Filtros do painel (selSupOp/selSupCampo/selPrefixos)
      // b) Segregação por estrutura (filtros.prefixosPermitidos do hook)
      //
      // O mapPrefixo do hook JÁ vem filtrado pelos prefixos que o usuário
      // pode ver (cruzamento natural + processos liberados). Então qualquer
      // iteração sobre ele já respeita a segregação automaticamente.
      //
      // Matching com registros.fiscal é fuzzy (substring case-insensitive)
      // porque fiscal tem nome completo e superv_campo pode ter só primeiro nome.
      const filtroHierarquicoAtivo =
        filtros.selRegional.length > 0 ||
        filtros.selSupOp.length    > 0 ||
        filtros.selSupCampo.length > 0 ||
        filtros.selPrefixos.length > 0

      let supervisoresPermitidos = null

      if (filtroHierarquicoAtivo) {
        // Aplica filtros do painel sobre mapPrefixo (já segregado)
        const sups = new Set()
        Object.entries(filtros.mapPrefixo).forEach(([pref, info]) => {
          if (filtros.selRegional.length > 0 && !filtros.selRegional.includes(info.regional)) return
          if (filtros.selSupOp.length    > 0 && !filtros.selSupOp.includes(info.op))       return
          if (filtros.selSupCampo.length > 0 && !filtros.selSupCampo.includes(info.campo)) return
          if (filtros.selPrefixos.length > 0 && !filtros.selPrefixos.includes(pref))       return
          if (info.campo) sups.add(info.campo)
        })
        supervisoresPermitidos = [...sups]
      } else if (filtros.prefixosPermitidos) {
        // Sem filtros do painel mas há segregação → extrai os sups dos prefixos permitidos
        const sups = new Set()
        filtros.prefixosPermitidos.forEach(pref => {
          const info = filtros.mapPrefixo[pref]
          if (info?.campo) sups.add(info.campo)
        })
        supervisoresPermitidos = [...sups]
      }

      if (supervisoresPermitidos !== null && supervisoresPermitidos.length === 0) {
        setRegistros([])
        setTokensAtivos({})
        setLoading(false)
        return
      }

      // ─── 2) Chama listarRegistros com filtros básicos (data + tipo + fiscais) ───
      // Só "Tratamento de Retrabalho"/"Tratamento de Reincidência"/"Abertura
      // de Ocorrência" (genérica) selecionados (sem nenhum tipo de Registro
      // junto) → não busca registros_operacionais, a tabela é outra.
      const somenteOcorrenciaSelecionada = tiposSelEfetivo.length > 0 && tiposRegistroSel.length === 0
      let data = somenteOcorrenciaSelecionada ? [] : await listarRegistros({
        dataIni: ini,
        dataFim: fim,
        tipo:    tiposRegistroSel,
        fiscais: fiscaisSel,
      }, usuarioLogado)

      // ─── 3) Aplica filtro de supervisor no front-end (matching fuzzy) ───
      if (supervisoresPermitidos) {
        const supLower = supervisoresPermitidos.map(s => s.toLowerCase())
        data = data.filter(r => {
          const fiscalLower = (r.fiscal || '').trim().toLowerCase()
          if (!fiscalLower) return false
          return supLower.some(s =>
            fiscalLower.includes(s) || s.includes(fiscalLower)
          )
        })
      }

      setRegistros(data)

      // ─── 4) Busca tokens ativos para todos os registros ───
      if (data.length > 0) {
        const { data: tokens } = await supabase
          .from('assinaturas_pendentes')
          .select('id, token, registro_id, status, expires_at')
          .eq('status', 'ABERTO')
          .gt('expires_at', new Date().toISOString())
          .in('registro_id', data.map(r => r.id))
        const mapa = {}
        for (const t of (tokens || [])) mapa[t.registro_id] = t
        setTokensAtivos(mapa)
      } else {
        setTokensAtivos({})
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    buscar()
    // Lista de fiscais (usuários ativos exceto ADMIN)
    supabase.from('usuarios').select('nome').neq('perfil', 'ADMIN').eq('status', 'ATIVO').order('nome')
      .then(({ data }) => setFiscaisLista((data || []).map(u => u.nome)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh a cada 5 min — usa ref pra sempre chamar a versão mais recente
  const buscarRef = useRef(buscar)
  useEffect(() => { buscarRef.current = buscar })
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!detalhe) buscarRef.current()
    }, 300000)
    return () => clearInterval(intervalRef.current)
  }, [detalhe])

  const formatData = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const fetchAssinaturasOnline = async (registroId) => {
    setLoadingOnline(true)
    try {
      const tokens = await listarTokensRegistro(registroId)
      const todas  = []
      for (const t of tokens) {
        const col = await listarAssinaturasColetadas(t.id)
        todas.push(...col)
      }
      setAssinOnline(todas)
    } catch (e) {
      console.error('Erro ao buscar assinaturas online:', e)
    } finally {
      setLoadingOnline(false)
    }
  }

  const abrirDetalhe = (r) => {
    setDetalhe(r)
    setAssinOnline([])
    fetchAssinaturasOnline(r.id)
  }

  // ─── Filtros EXTRAS no painel: Tipo + Fiscal/Usuário + Status (Ocorrência) ───
  const extras = (
    <>
      <div>
        <label style={LABEL_STYLE}>Tipo</label>
        <MultiSelect
          opcoes={tiposPermitidos || TIPOS_REGISTRO_TODOS}
          selecionados={tiposSel}
          onChange={setTiposSel}
          placeholder="Todos"
          formatOption={k => k === 'OCORRENCIA' ? '🔧 Tratamento de Retrabalho' : k === 'REINCIDENCIA' ? '🔁 Tratamento de Reincidência' : k === 'OCORRENCIA_GENERICA' ? '📦 Abertura de Ocorrência' : `${TIPOS_REGISTRO[k].emoji} ${TIPOS_REGISTRO[k].label}`}
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>Fiscal / Usuário</label>
        <MultiSelect
          opcoes={fiscaisLista}
          selecionados={fiscaisSel}
          onChange={setFiscaisSel}
          placeholder="Todos"
        />
      </div>
      <div>
        <label style={LABEL_STYLE}>
          Status
          <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
            (Retrabalho / Reincidência / Ocorrência)
          </span>
        </label>
        <select value={statusOcorrenciaSel} onChange={e => setStatusOcorrenciaSel(e.target.value)} style={{
          ...INPUT_STYLE, cursor: 'pointer', appearance: 'none',
          backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32,
        }}>
          <option value="">Todos</option>
          <option value="PENDENTE">🟠 Pendente</option>
          <option value="TRATADA">🟢 Tratada</option>
        </select>
      </div>
    </>
  )

  if (mostrarMotivos) {
    return <MotivosRegistrosOperacionais onVoltar={() => setMostrarMotivos(false)} />
  }

  // Lista única, ordenada por data/hora de abertura decrescente — Ocorrências,
  // Reincidências e os demais tipos de Registro Operacional ficam misturados
  // numa linha do tempo só, em vez de blocos separados por tipo (senão um
  // registro recém-aberto de um tipo podia aparecer abaixo de registros
  // antigos de outro tipo).
  const timestampRegistro = r => new Date(`${r.data_registro}T${r.hora_registro || '00:00'}`).getTime()
  const itensLista = [
    ...ocorrencias.map(oc => ({ kind: 'ocorrencia', item: oc, ts: new Date(oc.criado_em).getTime() })),
    ...reincidencias.map(r => ({ kind: 'reincidencia', item: r, ts: new Date(r.criado_em).getTime() })),
    ...genericas.map(g => ({ kind: 'generica', item: g, ts: new Date(g.criado_em).getTime() })),
    ...registros.map(r => ({ kind: 'registro', item: r, ts: timestampRegistro(r) })),
  ].sort((a, b) => b.ts - a.ts)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>

      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: 'calc(18px + env(safe-area-inset-top)) 20px 18px', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={onVoltar} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
            ← Voltar para Home
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800 }}>📝 Registros Operacionais</h1>
              <p style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                {podeVerTodos ? 'Todos os registros' : `Seus registros — ${usuarioLogado?.nome}`}
                {filtros.temSegregacao && (
                  <span style={{
                    marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 700,
                  }}>
                    🔒 Sua estrutura ({filtros.prefixosPermitidos?.length || 0} prefixos)
                  </span>
                )}
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{registros.length}</div>
              <div style={{ fontSize: 9, opacity: 0.85 }}>Total</div>
            </div>
          </div>
          {podeCadastrarMotivos && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setMostrarMotivos(true)} style={{
                border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.12)', color: '#fff',
                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>⚙️ Motivos</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>

        <button onClick={onNovo} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
          + Novo Registro Operacional
        </button>

        {/* ═══ PAINEL DE FILTROS (componente reutilizável) ═══ */}
        <PainelFiltros
          filtros={filtros}
          titulo="🔍 Filtros"
          badge="registros"
          extras={extras}
        />

        <div style={{ marginBottom: 16 }}>
          <button onClick={buscar} style={{
            height: FIELD_HEIGHT, padding: '0 22px',
            background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>🔍 Buscar</button>
        </div>

        {/* Resumo por tipo — grade de tiles (Total + Pendentes quando houver)
            do período filtrado. Ocorrências e Reincidência têm pendente/
            tratada, então são os únicos que mostram a faixa de pendentes;
            os demais tipos de Registro (Alinhamento, Diálogo de Segurança,
            Treinamento, Feedback, Reunião, Disciplinar) são avulsos, sem
            status, então mostram só o total. Grade de 3 colunas (em vez de
            cards largos) pra caber até 7 tipos sem rolar a tela pro lado. */}
        {!loading && (registros.length > 0 || ocorrencias.length > 0 || reincidencias.length > 0 || genericas.length > 0) && (() => {
          const porTipo = {}
          for (const r of registros) porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1
          const tiles = Object.entries(TIPOS_REGISTRO)
            .filter(([tipo]) => porTipo[tipo] > 0)
            .map(([tipo, cfg]) => ({ tipo, emoji: cfg.emoji, label: cfg.label, color: cfg.color, border: cfg.border, total: porTipo[tipo] }))
          if (genericas.length > 0) {
            tiles.unshift({
              tipo: 'OCORRENCIA_GENERICA', emoji: '📦', label: 'Ocorrências', color: '#4338ca', border: '#c7d2fe',
              total: genericas.length, pendentes: genericas.filter(o => o.status === 'PENDENTE').length,
            })
          }
          if (reincidencias.length > 0) {
            tiles.unshift({
              tipo: 'REINCIDENCIA', emoji: '🔁', label: 'Reincidência', color: '#c2410c', border: '#fed7aa',
              total: reincidencias.length, pendentes: reincidencias.filter(r => r.status === 'PENDENTE').length,
            })
          }
          if (ocorrencias.length > 0) {
            tiles.unshift({
              tipo: 'OCORRENCIA', emoji: '🔧', label: 'Retrabalho', color: '#4338ca', border: '#c7d2fe',
              total: ocorrencias.length, pendentes: ocorrencias.filter(o => o.status === 'PENDENTE').length,
            })
          }
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, marginBottom: 20 }}>
              {tiles.map(t => (
                <div key={t.tipo} style={{ background: '#fff', border: `1.5px solid ${t.border || '#e2e8f0'}`, borderRadius: 12, padding: '10px 10px 9px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1.25 }}>{t.emoji}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: t.color, lineHeight: 1.25, minWidth: 0, flex: 1 }}>{t.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{t.total}</div>
                  <div style={{ fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 }}>total</div>
                  {t.pendentes > 0 && (
                    <span style={{ display: 'inline-block', marginTop: 6, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      {t.pendentes} pendente{t.pendentes > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        })()}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p>Carregando registros...</p>
          </div>
        ) : itensLista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {itensLista.map(({ kind, item }) => {
              if (kind === 'ocorrencia') {
                const oc = item
                const pendente = oc.status === 'PENDENTE'
                return (
                  <div key={`oc-${oc.id}`} onClick={() => setDetalheOc(oc)}
                    style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${pendente ? '#a5b4fc' : '#86efac'}`, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>🔧</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#4338ca' }}>Tratamento de Retrabalho</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: pendente ? '#e0e7ff' : '#dcfce7', color: pendente ? '#3730a3' : '#15803d',
                          }}>{pendente ? '🟣 pendente' : '🟢 tratada'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                          <span>👤 {oc.aberto_por}</span>
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>📅 {new Date(oc.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {oc.prefixo && (<><span style={{ margin: '0 8px' }}>·</span><span>🎯 {oc.prefixo}</span></>)}
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>📨 {oc.direcionado_para}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</span>
                    </div>
                  </div>
                )
              }

              if (kind === 'generica') {
                const oc = item
                const pendente = oc.status === 'PENDENTE'
                return (
                  <div key={`gen-${oc.id}`} onClick={() => setDetalheOc(oc)}
                    style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${pendente ? '#a5b4fc' : '#86efac'}`, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>📦</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#4338ca' }}>Abertura de Ocorrência</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: pendente ? '#e0e7ff' : '#dcfce7', color: pendente ? '#3730a3' : '#15803d',
                          }}>{pendente ? '🟣 pendente' : '🟢 tratada'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                          <span>👤 {oc.aberto_por}</span>
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>📅 {new Date(oc.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {oc.prefixo && (<><span style={{ margin: '0 8px' }}>·</span><span>🎯 {oc.prefixo}</span></>)}
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>📨 {oc.direcionado_para}</span>
                          {oc.motivo && (() => {
                            const tema = temaMotivoOcorrencia(oc.motivo)
                            return (
                              <>
                                <span style={{ margin: '0 8px' }}>·</span>
                                <span style={{ color: tema.color, fontWeight: 700 }}>{tema.emoji} {oc.motivo}</span>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</span>
                    </div>
                  </div>
                )
              }

              if (kind === 'reincidencia') {
                const r = item
                const pendente = r.status === 'PENDENTE'
                return (
                  <div key={`re-${r.id}`} onClick={() => setDetalheReinc(r)}
                    style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${pendente ? '#fdba74' : '#86efac'}`, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: 18 }}>🔁</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#c2410c' }}>Tratamento de Reincidência</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: pendente ? '#ffedd5' : '#dcfce7', color: pendente ? '#9a3412' : '#15803d',
                          }}>{pendente ? '🟣 pendente' : '🟢 tratada'}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                          <span>👤 {r.aberto_por}</span>
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>📅 {new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {r.prefixo && (<><span style={{ margin: '0 8px' }}>·</span><span>🎯 {r.prefixo}</span></>)}
                          <span style={{ margin: '0 8px' }}>·</span>
                          <span>📨 {r.direcionado_para}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</span>
                    </div>
                  </div>
                )
              }

              const r = item
              const tc = TIPOS_REGISTRO[r.tipo] || {}
              const mc = MODALIDADES[r.modalidade] || {}
              const tokenAtivo = tokensAtivos[r.id]
              const expira = tokenAtivo ? new Date(tokenAtivo.expires_at) : null
              const minutosRestantes = expira ? Math.ceil((expira - new Date()) / 60000) : 0
              return (
                    <div key={`rg-${r.id}`} style={{ background: '#fff', borderRadius: 14, border: tokenAtivo ? '1.5px solid #22c55e' : `1.5px solid ${tc.border || '#e2e8f0'}`, padding: '14px 16px', cursor: 'pointer' }}
                      onClick={() => abrirDetalhe(r)}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontSize: 18 }}>{tc.emoji}</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: tc.color || '#1e293b' }}>{tc.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: tc.bg, color: tc.color }}>{mc.emoji} {mc.label}</span>
                            {r.tipo === 'DISCIPLINAR' && r.tipo_medida && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#dc2626' }}>{TIPO_MEDIDA_LABEL[r.tipo_medida]}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
                            <span>👤 {r.fiscal}</span>
                            <span style={{ margin: '0 8px' }}>·</span>
                            <span>📅 {formatData(r.data_registro)} às {r.hora_registro}</span>
                            <span style={{ margin: '0 8px' }}>·</span>
                            <span>👥 {Array.isArray(r.participantes) ? r.participantes.length : 0} participante(s)</span>
                            {r.motivo && (
                              <>
                                <span style={{ margin: '0 8px' }}>·</span>
                                <span>🏷️ {r.motivo}</span>
                              </>
                            )}
                          </div>
                          {tokenAtivo && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}
                              onClick={e => e.stopPropagation()}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '3px 10px', borderRadius: 20, border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: 4 }}>
                                🔗 Link ativo · {minutosRestantes > 60 ? `${Math.floor(minutosRestantes/60)}h ${minutosRestantes%60}min` : `${minutosRestantes}min`}
                              </span>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (!window.confirm('Encerrar o link de assinatura deste registro?')) return
                                  setEncerrando(r.id)
                                  try {
                                    await encerrarToken(tokenAtivo.id)
                                    setTokensAtivos(prev => { const n = {...prev}; delete n[r.id]; return n })
                                  } catch { alert('Erro ao encerrar link.') }
                                  finally { setEncerrando(null) }
                                }}
                                disabled={encerrando === r.id}
                                style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: 20, border: '1px solid #fecaca', cursor: 'pointer' }}>
                                {encerrando === r.id ? '⏳ Encerrando...' : '🔒 Encerrar link'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 18, color: '#94a3b8', marginLeft: 8 }}>›</div>
                      </div>
                    </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal detalhe */}
      {detalhe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            {(() => {
              const tc           = TIPOS_REGISTRO[detalhe.tipo] || {}
              const mc           = MODALIDADES[detalhe.modalidade] || {}
              const participantes = detalhe.participantes || []

              const participantesEnriquecidos = participantes.map(p => {
                const assinaturaOnline = assinOnline.find(
                  a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                )
                const isOnline = p.modo === 'online' || (!!assinaturaOnline && !p.assinatura_url)
                return {
                  ...p,
                  isOnline,
                  assinouOnline:   !!assinaturaOnline,
                  assinaturaFinal: p.assinatura_url || assinaturaOnline?.assinatura_url || null,
                }
              })

              const apenasOnline = assinOnline.filter(
                a => !participantes.some(p => p.nome?.trim().toLowerCase() === a.nome?.trim().toLowerCase())
              )

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>{tc.emoji} {tc.label}</h3>
                    <button onClick={() => setDetalhe(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                  </div>

                  <div style={{ background: tc.bg, border: `2px solid ${tc.border}`, borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>{tc.emoji}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tc.color }}>{tc.label}</div>
                    <div style={{ fontSize: 13, color: tc.color, opacity: 0.85, marginTop: 4 }}>
                      {mc.emoji} {mc.label} · {participantes.length} participante(s)
                    </div>
                    {detalhe.tipo === 'DISCIPLINAR' && detalhe.tipo_medida && (
                      <div style={{ marginTop: 8, background: tc.color, color: '#fff', padding: '3px 12px', borderRadius: 8, display: 'inline-block', fontSize: 12, fontWeight: 700 }}>
                        {TIPO_MEDIDA_LABEL[detalhe.tipo_medida]}
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    {[
                      ['Fiscal',        detalhe.fiscal],
                      ['Matrícula',     detalhe.matricula_fiscal],
                      ['Data / Hora',   `${formatData(detalhe.data_registro)} às ${detalhe.hora_registro}`],
                      ['Local',         detalhe.endereco],
                      ['GPS',           detalhe.lat ? `${detalhe.lat}, ${detalhe.lng}` : null],
                      ['Tema',          detalhe.tema],
                      ['Carga Horária', detalhe.carga_horaria],
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>{l}</span>
                        <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {detalhe.pauta && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                        {detalhe.tipo === 'DISCIPLINAR' ? 'DESCRIÇÃO DA OCORRÊNCIA:' : 'PAUTA / CONTEÚDO:'}
                      </p>
                      <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>{detalhe.pauta}</p>
                    </div>
                  )}

                  {detalhe.observacoes && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>OBSERVAÇÕES:</p>
                      <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{detalhe.observacoes}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: 0 }}>
                        ✅ Lista de Frequência ({participantesEnriquecidos.length + apenasOnline.length})
                      </p>
                      <button onClick={() => fetchAssinaturasOnline(detalhe.id)} disabled={loadingOnline}
                        style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: loadingOnline ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                        {loadingOnline ? '⏳' : '🔄 Atualizar'}
                      </button>
                    </div>

                    {participantesEnriquecidos.map((p, i) => {
                      const bgColor   = p.isOnline ? '#eff6ff' : '#f0fdf4'
                      const bdColor   = p.isOnline ? '#bfdbfe' : '#86efac'
                      const nameColor = p.isOnline ? '#1d4ed8' : '#15803d'

                      return (
                        <div key={i} style={{ background: bgColor, border: `1px solid ${bdColor}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: nameColor }}>
                                  {i + 1}. {p.nome}
                                </span>
                                {p.isOnline && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                                    🔗 online
                                  </span>
                                )}
                              </div>
                              {p.matricula && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Mat: {p.matricula}</p>}

                              {!p.isOnline && p.assinaturaFinal && (p.endereco_assinatura || p.lat) && (
                                <div style={{ marginTop: 5 }}>
                                  {p.endereco_assinatura && (
                                    <p style={{ fontSize: 11, color: '#15803d', margin: '0 0 2px', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                      <span style={{ flexShrink: 0 }}>📍</span>
                                      <span>{p.endereco_assinatura}</span>
                                    </p>
                                  )}
                                  {p.lat && p.lng && (
                                    <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                      🌐 {Number(p.lat).toFixed(7)}, {Number(p.lng).toFixed(7)}
                                    </p>
                                  )}
                                </div>
                              )}

                              {p.isOnline && p.assinouOnline && (() => {
                                const assinOnlineData = assinOnline.find(
                                  a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                                )
                                return assinOnlineData ? (
                                  <div style={{ marginTop: 5 }}>
                                    {assinOnlineData.endereco_assinatura && (
                                      <p style={{ fontSize: 11, color: '#1d4ed8', margin: '0 0 2px', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                        <span style={{ flexShrink: 0 }}>📍</span>
                                        <span>{assinOnlineData.endereco_assinatura}</span>
                                      </p>
                                    )}
                                    {assinOnlineData.latitude && assinOnlineData.longitude && (
                                      <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                        🌐 {Number(assinOnlineData.latitude).toFixed(7)}, {Number(assinOnlineData.longitude).toFixed(7)}
                                      </p>
                                    )}
                                  </div>
                                ) : null
                              })()}

                              {p.isOnline && !p.assinaturaFinal && !loadingOnline && (
                                <p style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, margin: '4px 0 0' }}>
                                  ⏳ Aguardando assinatura via link
                                </p>
                              )}
                            </div>

                            <div style={{ flexShrink: 0 }}>
                              {p.assinaturaFinal ? (
                                <img src={p.assinaturaFinal} alt="assinatura"
                                  style={{ height: 40, maxWidth: 100, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                              ) : p.isOnline && loadingOnline ? (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>⏳</span>
                              ) : !p.isOnline ? (
                                <span style={{ fontSize: 11, color: '#fbbf24', background: '#fffbeb', padding: '2px 8px', borderRadius: 6, border: '1px solid #fcd34d' }}>
                                  pendente
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {apenasOnline.map((a, i) => (
                      <div key={`extra-${i}`} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
                                {participantesEnriquecidos.length + i + 1}. {a.nome}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>🔗 online</span>
                            </div>
                            {a.matricula && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Mat: {a.matricula}</p>}
                            {a.endereco_assinatura && (
                              <p style={{ fontSize: 11, color: '#1d4ed8', margin: '4px 0 2px', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ flexShrink: 0 }}>📍</span>
                                <span>{a.endereco_assinatura}</span>
                              </p>
                            )}
                            {a.latitude && a.longitude && (
                              <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                                🌐 {Number(a.latitude).toFixed(7)}, {Number(a.longitude).toFixed(7)}
                              </p>
                            )}
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                              {new Date(a.assinado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          {a.assinatura_url && (
                            <img src={a.assinatura_url} alt="assinatura"
                              style={{ height: 40, maxWidth: 100, objectFit: 'contain', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0' }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Fotos ({detalhe.fotos_urls.length})</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {detalhe.fotos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Foto ${i+1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <p style={{ textAlign: 'center', fontSize: 11, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>
                    v{versaoSistema}
                  </p>

                  <button onClick={async () => {
                    if (!Capacitor.isNativePlatform()) { imprimirRegistro(detalhe, assinOnline, versaoSistema); return }
                    setGerandoPDF(true)
                    try { await gerarPDFRegistro(detalhe, assinOnline, versaoSistema) }
                    catch (err) { console.error('Erro ao gerar PDF:', err); alert('Não foi possível gerar o PDF: ' + descreverErro(err)) }
                    finally { setGerandoPDF(false) }
                  }} disabled={gerandoPDF} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: gerandoPDF ? '#64748b' : '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: gerandoPDF ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {gerandoPDF ? '⏳ Gerando PDF...' : '🖨️ Imprimir / Salvar PDF'}
                  </button>

                  <button onClick={async () => {
                    setCapturando(true)
                    try {
                      const html2canvas = (await import('html2canvas')).default
                      const tc2 = TIPOS_REGISTRO[detalhe.tipo] || {}
                      const mc2 = MODALIDADES[detalhe.modalidade] || {}
                      const formatD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
                      const participantes = detalhe.participantes || []
                      const participantesComAssinatura = participantes.map(p => {
                        const assinaturaOnline = assinOnline.find(
                          a => a.nome?.trim().toLowerCase() === p.nome?.trim().toLowerCase()
                        )
                        return {
                          ...p,
                          assinaturaFinal: p.assinatura_url || assinaturaOnline?.assinatura_url || null,
                          isOnline: p.modo === 'online' || (!!assinaturaOnline && !p.assinatura_url),
                          assinouOnline: !!assinaturaOnline,
                        }
                      })

                      const infoRow = (label, value) => value ? `
                        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;">
                          <span style="color:#94a3b8;font-weight:700;font-size:14px;min-width:100px;flex-shrink:0;">${label}</span>
                          <span style="color:#1e293b;font-weight:700;font-size:14px;text-align:right;flex:1;padding-left:8px;">${value}</span>
                        </div>` : ''

                      const html = `
                        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;padding:20px;box-sizing:border-box;width:640px;">
                          <div style="background:${tc2.bg || '#eff6ff'};border:3px solid ${tc2.border || '#bfdbfe'};border-radius:18px;padding:20px;text-align:center;margin-bottom:16px;">
                            <div style="font-size:52px;margin-bottom:10px;">${tc2.emoji || '📝'}</div>
                            <div style="font-size:26px;font-weight:900;color:${tc2.color || '#1d4ed8'};margin-bottom:6px;letter-spacing:-0.5px;">${tc2.label || detalhe.tipo}</div>
                            <div style="font-size:15px;color:${tc2.color || '#1d4ed8'};opacity:0.85;font-weight:700;">${mc2.emoji || ''} ${mc2.label || ''} · ${participantes.length} participante(s)</div>
                          </div>
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 10px 0;">Dados do Registro</p>
                            ${infoRow('Fiscal', detalhe.fiscal)}
                            ${infoRow('Data / Hora', formatD(detalhe.data_registro) + ' às ' + detalhe.hora_registro)}
                            ${infoRow('Local', detalhe.endereco)}
                            ${infoRow('GPS', detalhe.lat ? detalhe.lat.toFixed(5) + ', ' + detalhe.lng.toFixed(5) : null)}
                            ${infoRow('Tema', detalhe.tema)}
                            ${infoRow('Carga Horária', detalhe.carga_horaria)}
                          </div>
                          ${detalhe.pauta ? `
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 8px 0;">${detalhe.tipo === 'DISCIPLINAR' ? 'Descrição' : 'Pauta / Conteúdo'}</p>
                            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">${detalhe.pauta}</p>
                          </div>` : ''}
                          ${detalhe.observacoes ? `
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:16px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 8px 0;">Observações</p>
                            <p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">${detalhe.observacoes}</p>
                          </div>` : ''}
                          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:16px;margin-bottom:16px;">
                            <p style="font-size:16px;font-weight:800;color:#15803d;margin:0 0 12px 0;">✅ Lista de Frequência (${participantesComAssinatura.length})</p>
                            ${participantesComAssinatura.map((p, i) => `
                              <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${i < participantes.length - 1 ? 'border-bottom:1px solid #bbf7d0;' : ''}">
                                <div>
                                  <span style="font-size:15px;font-weight:800;color:#15803d;">${i+1}. ${p.nome}</span>
                                  ${p.matricula ? `<span style="font-size:13px;color:#64748b;margin-left:8px;">Mat: ${p.matricula}</span>` : ''}
                                  ${p.modo === 'online' ? `<span style="font-size:11px;color:#1d4ed8;background:#dbeafe;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:700;">🔗 online</span>` : ''}
                                </div>
                                ${p.assinaturaFinal ? `<img src="${p.assinaturaFinal}" crossorigin="anonymous" style="height:44px;max-width:110px;object-fit:contain;border-radius:6px;background:#fafafa;border:1px solid #e2e8f0;"/>` : p.isOnline ? '<span style="font-size:12px;color:#f59e0b;font-weight:600;">⏳ aguardando</span>' : ''}
                              </div>`).join('')}
                          </div>
                          ${Array.isArray(detalhe.fotos_urls) && detalhe.fotos_urls.length > 0 ? `
                          <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:14px;margin-bottom:16px;">
                            <p style="font-size:14px;font-weight:800;color:#374151;margin:0 0 10px 0;">📷 Fotos (${detalhe.fotos_urls.length})</p>
                            <div style="display:grid;grid-template-columns:repeat(${Math.min((detalhe.fotos_urls||[]).length,3)},1fr);gap:8px;">
                              ${detalhe.fotos_urls.map(url => `<img src="${url}" crossorigin="anonymous" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;"/>`).join('')}
                            </div>
                          </div>` : ''}
                          <div style="border-top:2px solid #e2e8f0;padding-top:12px;text-align:center;">
                            <p style="font-size:13px;color:#94a3b8;margin:0;font-weight:700;">VérticeGP · Plataforma de Gestão Operacional</p>
                            <p style="font-size:12px;color:#cbd5e1;margin:4px 0 0 0;">Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })} · <span style="color:#dc2626;font-weight:700;">v${versaoSistema}</span></p>
                          </div>
                        </div>`

                      const div = document.createElement('div')
                      div.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
                      div.innerHTML = html
                      document.body.appendChild(div)

                      const canvas = await html2canvas(div.firstElementChild, {
                        scale: 8, useCORS: true, allowTaint: true,
                        backgroundColor: '#f0f4f8', logging: false, windowWidth: 680,
                      })
                      document.body.removeChild(div)

                      const nomeArq = `Registro_${detalhe.tipo}_${detalhe.data_registro}.jpg`.replace(/\s+/g, '_')
                      if (Capacitor.isNativePlatform()) {
                        await compartilharImagemNativo(canvas, nomeArq.replace(/\.jpg$/, '.png'), { titulo: tc2.label })
                      } else {
                        await compartilharImagemWeb(canvas, nomeArq, { titulo: tc2.label, tipo: 'image/jpeg', qualidade: 0.95 })
                      }
                    } catch (err) {
                      console.error(err); alert('Não foi possível gerar a imagem: ' + descreverErro(err))
                    } finally {
                      setCapturando(false)
                    }
                  }} disabled={capturando} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: capturando ? '#64748b' : '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: capturando ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {capturando ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
                  </button>

                  <button onClick={() => setDetalhe(null)} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Fechar
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Modal detalhe — Ocorrência (PDF/WhatsApp, mesmo padrão dos Registros) */}
      {detalheOc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalheOc(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            {(() => {
              const oc = detalheOc
              const pendente = oc.status === 'PENDENTE'
              const ehGenerica = oc.tipo_ocorrencia === 'OCORRENCIA_GENERICA'
              const modoEquipeOc = Array.isArray(colaboradoresOc) && colaboradoresOc.length > 0
              // Nomes em linhas separadas (mesmo padrão de Eletricista 1/2 na
              // Reincidência) em vez de um resumo tipo "2 colaboradores da
              // equipe" — uma linha por pessoa, cobre tanto o caso fixo
              // (eletricista_equipe/_2) quanto a equipe dinâmica
              // (ocorrencias_colaboradores, qualquer tamanho).
              const colaboradoresNomeados = modoEquipeOc
                ? colaboradoresOc.map((c, i) => [`Colaborador ${i + 1}`, c.nome])
                : [oc.eletricista_equipe, oc.eletricista_equipe_2]
                    .map((nome, i) => [`Colaborador ${i + 1}`, nome])
                    .filter(([, nome]) => nome)
              const assinantes = modoEquipeOc
                ? colaboradoresOc.filter(c => c.assinatura_url).map(c => ({ nome: c.nome, url: c.assinatura_url }))
                : [
                    { nome: oc.tratamento_assinatura_nome,  url: oc.tratamento_assinatura_url },
                    { nome: oc.tratamento_assinatura2_nome, url: oc.tratamento_assinatura2_url },
                  ].filter(a => a.nome || a.url)

              // Dados Técnicos (só Tratamento de Retrabalho) — prefere as
              // colunas estruturadas (uc/os/registro_execucao/
              // data_conclusao); cai pro texto da descrição (ocorrências
              // importadas em lote antes dessas colunas existirem) só quando
              // a coluna está vazia — ver parseDescricaoImportada.
              const parsedDescricao = !ehGenerica ? parseDescricaoImportada(oc.descricao) : null
              const dadosTecnicos = !ehGenerica ? [
                ['UC', oc.uc || parsedDescricao?.uc],
                ['OS', oc.os || parsedDescricao?.os],
                ['Registro de Execução', oc.registro_execucao || parsedDescricao?.registroExec],
                ['Data de Conclusão', oc.data_conclusao || parsedDescricao?.dataConclusao],
              ].filter(([, v]) => v) : []
              // Descrição exibida: pra Retrabalho com texto importado em
              // lote, mostra só Observação/Erro de conclusão (UC/OS/etc. já
              // aparecem em Dados Técnicos, não precisa repetir) — senão
              // mostra o texto puro (entrada manual, ou Ocorrência Genérica).
              const descricaoExibida = (!ehGenerica && parsedDescricao)
                ? [
                    'IMPORTADO EM LOTE VIA PLANILHA',
                    parsedDescricao.observacao ? `\n📝 ${MARCADOR_OBSERVACAO}: ${parsedDescricao.observacao}` : '',
                    parsedDescricao.erroConclusao ? `\n⚠️ ${MARCADOR_ERRO_CONCLUSAO}: ${parsedDescricao.erroConclusao}` : '',
                  ].filter(Boolean).join('\n')
                : oc.descricao
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>{ehGenerica ? '📦 Abertura de Ocorrência' : '🔧 Tratamento de Retrabalho'}</h3>
                    <button onClick={() => setDetalheOc(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                  </div>

                  <div style={{ background: '#e0e7ff', border: '2px solid #c7d2fe', borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>{ehGenerica ? '📦' : '🔧'}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#4338ca' }}>{ehGenerica ? 'Abertura de Ocorrência' : 'Tratamento de Retrabalho'}</div>
                    <div style={{ marginTop: 8 }}>
                      <span style={{
                        padding: '3px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: pendente ? '#fff' : '#15803d', color: pendente ? '#3730a3' : '#fff',
                      }}>{pendente ? '🟣 Pendente' : '🟢 Tratada'}</span>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    {[
                      [ehGenerica ? 'Nº Ocorrência' : 'Nº Retrabalho', numeroOcorrencia(oc)],
                      ['Aberto por',        oc.aberto_por],
                      ['Data / Hora',       new Date(oc.criado_em).toLocaleString('pt-BR')],
                      ['Prefixo / Equipe',  oc.prefixo],
                      ...colaboradoresNomeados,
                      ['Direcionado para',  oc.direcionado_para],
                      ...(ehGenerica ? [['Local', oc.endereco]] : []),
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.2 }}>{l}</span>
                        <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word', textTransform: 'uppercase' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {ehGenerica && oc.motivo && (() => {
                    const tema = temaMotivoOcorrencia(oc.motivo)
                    return (
                      <div style={{ background: tema.bg, border: `1.5px solid ${tema.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 24 }}>{tema.emoji}</span>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, color: tema.color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Motivo</p>
                          <p style={{ fontSize: 15, fontWeight: 800, color: tema.color }}>{oc.motivo}</p>
                        </div>
                      </div>
                    )
                  })()}

                  {dadosTecnicos.length > 0 && (
                    <div style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>📊 Dados Técnicos</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
                        {dadosTecnicos.map(([l, v], i) => (
                          <div key={l} style={{ padding: '7px 0', borderTop: i >= 2 ? '1px solid #c7d2fe55' : 'none' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: 0.3 }}>{l}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#312e81', marginTop: 2, wordBreak: 'break-word' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', marginBottom: 6 }}>DESCRIÇÃO{ehGenerica ? ' DA OCORRÊNCIA' : ''}:</p>
                    <p style={{ fontSize: 13, color: '#3730a3', lineHeight: 1.6 }}><DescricaoDestacada texto={descricaoExibida} /></p>
                  </div>

                  {!pendente && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>✅ TRATAMENTO:</p>
                      <p style={{ fontSize: 13, color: '#15803d', lineHeight: 1.6 }}>{oc.tratamento_observacao}</p>
                    </div>
                  )}

                  {!pendente && assinantes.length > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>
                        ✍️ COLABORADOR(ES) CIENTIFICADO(S){modoEquipeOc ? ` (${assinantes.length} de ${colaboradoresOc.length})` : ':'}
                      </p>
                      {assinantes.map((a, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid #bbf7d0' : 'none' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{a.nome || '—'}</span>
                          {a.url && (
                            <img src={a.url} alt="assinatura" style={{ height: 40, maxWidth: 100, objectFit: 'contain', background: '#fff', borderRadius: 6, border: '1px solid #bbf7d0' }} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!pendente && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>👤 TRATADA POR:</p>
                      {[
                        ['Matrícula',    oc.tratado_por],
                        ['Nome',         oc.tratado_por_nome],
                        ['Data / Hora',  oc.tratado_em ? new Date(oc.tratado_em).toLocaleString('pt-BR') : null],
                      ].filter(([, v]) => v).map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                          <span style={{ color: '#94a3b8' }}>{l}</span>
                          <span style={{ color: '#1e293b', fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {oc.foto_url && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Foto da Ocorrência</p>
                      <a href={oc.foto_url} target="_blank" rel="noreferrer">
                        <img src={oc.foto_url} alt="Foto da ocorrência" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      </a>
                    </div>
                  )}

                  {Array.isArray(oc.tratamento_fotos_urls) && oc.tratamento_fotos_urls.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Fotos do Tratamento ({oc.tratamento_fotos_urls.length})</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {oc.tratamento_fotos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt={`Foto do tratamento ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <p style={{ textAlign: 'center', fontSize: 11, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>
                    v{versaoSistema}
                  </p>

                  <button onClick={async () => {
                    if (!Capacitor.isNativePlatform()) { imprimirOcorrenciaDoc(oc, versaoSistema, colaboradoresOc); return }
                    setGerandoPDFOc(true)
                    try { await gerarPDFOcorrenciaDoc(oc, versaoSistema, colaboradoresOc) }
                    catch (err) { console.error('Erro ao gerar PDF:', err); alert('Não foi possível gerar o PDF: ' + descreverErro(err)) }
                    finally { setGerandoPDFOc(false) }
                  }} disabled={gerandoPDFOc} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: gerandoPDFOc ? '#64748b' : '#1e3a5f', color: '#fff', fontSize: 14, fontWeight: 700, cursor: gerandoPDFOc ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {gerandoPDFOc ? '⏳ Gerando PDF...' : '🖨️ Imprimir / Salvar PDF'}
                  </button>

                  <button onClick={() => compartilharOcorrenciaWhatsApp(oc)} disabled={capturandoOc} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: capturandoOc ? '#64748b' : '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: capturandoOc ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {capturandoOc ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
                  </button>

                  <button onClick={() => setDetalheOc(null)} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Fechar
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {detalheReinc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setDetalheReinc(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: '24px 20px 40px' }}>
            {(() => {
              const r = detalheReinc
              const pendente = r.status === 'PENDENTE'
              const camposPrincipais = [
                ['No. REIC',        numeroOcorrencia(r)],
                ['Tipo Tratamento', 'Reincidência'],
                ['Data / Hora',     new Date(r.criado_em).toLocaleString('pt-BR')],
                ['Fiscal',          r.aberto_por],
                ['Matrícula',       r.matricula_aberto_por],
                ['Equipe',          r.prefixo],
                ['Direcionado para', r.direcionado_para],
                ['Eletricista 1',   r.eletricista_equipe],
                ['Eletricista 2',   r.eletricista_equipe_2],
              ].filter(([, v]) => v)
              const camposTecnicos = [
                ['Número da Ocorrência (OE)', r.numero_oe],
                ['Abrangência (ABRG)',        r.abrangencia],
                ['Componente (PDF)',          r.componente_pdf],
                ['Alimentador (AL)',          r.alimentador_al],
              ].filter(([, v]) => v)
              const reincidenciasPeriodo = [
                ['7 dias',  r.reincidencia_r07],
                ['30 dias', r.reincidencia_r30],
                ['90 dias', r.reincidencia_r90],
              ].filter(([, v]) => v)
              return (
                <>
                <div ref={reincConteudoRef}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>🔁 Tratamento de Reincidência</h3>
                    <button onClick={() => setDetalheReinc(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
                  </div>

                  <div style={{ background: '#fff7ed', border: '2px solid #fed7aa', borderRadius: 14, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 40, marginBottom: 6 }}>🔁</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#c2410c' }}>Tratamento de Reincidência</div>
                    <div style={{ marginTop: 8 }}>
                      <span style={{
                        padding: '3px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: pendente ? '#fff' : '#15803d', color: pendente ? '#9a3412' : '#fff',
                      }}>{pendente ? '🟣 Pendente' : '🟢 Tratada'}</span>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    {camposPrincipais.map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                        <span style={{ color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.2 }}>{l}</span>
                        <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word', textTransform: 'uppercase' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {(camposTecnicos.length > 0 || reincidenciasPeriodo.length > 0) && (
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>📊 Dados Técnicos</p>
                      {camposTecnicos.map(([l, v], i) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < camposTecnicos.length - 1 ? '1px solid #fed7aa' : 'none' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.2 }}>{l}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#7c2d12', textAlign: 'right' }}>{v}</span>
                        </div>
                      ))}
                      {reincidenciasPeriodo.length > 0 && (
                        <>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.4, margin: '12px 0 6px', opacity: 0.8 }}>Nº de reincidências por período</p>
                          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${reincidenciasPeriodo.length}, 1fr)`, gap: 8 }}>
                            {reincidenciasPeriodo.map(([label, v]) => (
                              <div key={label} style={{ background: '#fff', border: '1.5px solid #fdba74', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 800, color: '#c2410c', lineHeight: 1 }}>{v}</div>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 3 }}>Reinc. {label}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {r.motivo && (() => {
                    const tema = temaMotivoOcorrencia(r.motivo)
                    return (
                      <div style={{ background: tema.bg, border: `1.5px solid ${tema.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 24 }}>{tema.emoji}</span>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, color: tema.color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Motivo</p>
                          <p style={{ fontSize: 15, fontWeight: 800, color: tema.color }}>{r.motivo}</p>
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>DESCRIÇÃO DA REINCIDÊNCIA:</p>
                    <p style={{ fontSize: 13, color: '#9a3412', lineHeight: 1.6 }}>{r.descricao}</p>
                  </div>

                  {r.foto_url && (
                    <div style={{ marginBottom: 14 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📷 Foto da Reincidência</p>
                      <a href={r.foto_url} target="_blank" rel="noreferrer">
                        <img src={r.foto_url} alt="Foto da reincidência" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      </a>
                    </div>
                  )}

                  {/* Retroalimentação — o que o fiscal registrou ao tratar (aba
                      🔁 Reincidência de Tratamento de Não Conformidades) volta
                      pra cá, no mesmo card de abertura, já que é a mesma linha
                      da tabela `ocorrencias`. Só aparece quando tratada. */}
                  {!pendente && (
                    <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>✅ Tratamento</p>
                      <p style={{ fontSize: 12, color: '#166534', marginBottom: 10 }}>
                        <strong>Tratado por</strong> {r.tratado_por_nome || r.tratado_por || '—'} em {r.tratado_em ? new Date(r.tratado_em).toLocaleString('pt-BR') : '—'}
                      </p>

                      <p style={{ fontSize: 10.5, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.3, margin: '10px 0 6px' }}>📋 Respostas do checklist</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11.5 }}>
                          <span>1. Rede BT inspecionada?</span>
                          <strong style={{ color: r.reincidencia_rede_inspecionada ? '#15803d' : '#b91c1c' }}>{r.reincidencia_rede_inspecionada ? 'SIM' : 'NÃO'}</strong>
                        </div>
                        {r.reincidencia_acoes_equipe && (
                          <div style={{ background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11.5 }}>
                            <span style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>2. Ações executadas pela equipe:</span>
                            <strong style={{ color: '#1e293b' }}>{r.reincidencia_acoes_equipe}</strong>
                          </div>
                        )}
                        {r.reincidencia_leituras_eletricas && (
                          <div style={{ background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11.5 }}>
                            <span style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>3. Leituras elétricas:</span>
                            <strong style={{ color: '#1e293b' }}>{r.reincidencia_leituras_eletricas}</strong>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11.5 }}>
                          <span>4. Resolveu em definitivo?</span>
                          <strong style={{ color: r.reincidencia_resolvido_definitivo ? '#15803d' : '#b91c1c' }}>{r.reincidencia_resolvido_definitivo ? 'SIM' : 'NÃO'}</strong>
                        </div>
                        {r.reincidencia_vulnerabilidades && (
                          <div style={{ background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 11.5 }}>
                            <span style={{ display: 'block', color: '#64748b', marginBottom: 2 }}>5. Vulnerabilidades estruturais:</span>
                            <strong style={{ color: '#1e293b' }}>{r.reincidencia_vulnerabilidades}</strong>
                          </div>
                        )}
                      </div>

                      {(r.tratamento_assinatura_nome || r.tratamento_assinatura2_nome || r.reincidencia_termo_fiscal_nome) && (
                        <>
                          <p style={{ fontSize: 10.5, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.3, margin: '10px 0 6px' }}>✍️ Ciência</p>
                          {(r.tratamento_assinatura_nome || r.tratamento_assinatura2_nome) && (
                            <p style={{ fontSize: 11.5, color: '#1e293b', marginBottom: 4 }}><strong>Eletricistas:</strong> {[r.tratamento_assinatura_nome, r.tratamento_assinatura2_nome].filter(Boolean).join(' e ')}</p>
                          )}
                          {r.reincidencia_termo_fiscal_nome && (
                            <p style={{ fontSize: 11.5, color: '#1e293b', marginBottom: 10 }}><strong>Termo de Ciência do Fiscal:</strong> {r.reincidencia_termo_fiscal_nome}</p>
                          )}
                        </>
                      )}

                      {(() => {
                        const assinaturas = [
                          ['Eletricista 1', r.tratamento_assinatura_nome, r.tratamento_assinatura_url],
                          ['Eletricista 2', r.tratamento_assinatura2_nome, r.tratamento_assinatura2_url],
                          ['Termo de Ciência do Fiscal', r.reincidencia_termo_fiscal_nome, r.reincidencia_termo_fiscal_assinatura_url],
                        ].filter(([, , url]) => url)
                        if (assinaturas.length === 0) return null
                        return (
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                            {assinaturas.map(([label, nome, url]) => (
                              <a key={label} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', width: 140 }}>
                                <img src={url} alt={`Assinatura — ${nome || label}`} style={{ width: '100%', height: 100, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1.5px solid #cbd5e1', padding: 6, display: 'block' }} />
                                <p style={{ fontSize: 10.5, color: '#166534', textAlign: 'center', marginTop: 4, fontWeight: 700 }}>{label}</p>
                                {nome && <p style={{ fontSize: 10, color: '#166534', opacity: 0.8, textAlign: 'center', margin: 0 }}>{nome}</p>}
                              </a>
                            ))}
                          </div>
                        )
                      })()}

                      {Array.isArray(r.tratamento_fotos_urls) && r.tratamento_fotos_urls.length > 0 && (
                        <>
                          <p style={{ fontSize: 10.5, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.3, margin: '4px 0 6px' }}>📷 Evidências do tratamento</p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {r.tratamento_fotos_urls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer">
                                <img src={url} alt={`Evidência ${i + 1}`} style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <p style={{ textAlign: 'center', fontSize: 11, color: '#dc2626', margin: '0 0 10px', fontWeight: 600 }}>
                    v{versaoSistema}
                  </p>
                </div>

                  <button onClick={async () => {
                    if (!Capacitor.isNativePlatform()) { imprimirReincidenciaDoc(r, versaoSistema); return }
                    setGerandoPDFReinc(true)
                    try { await gerarPDFReincidenciaDoc(r, versaoSistema) }
                    catch (err) { console.error('Erro ao gerar PDF:', err); alert('Não foi possível gerar o PDF: ' + descreverErro(err)) }
                    finally { setGerandoPDFReinc(false) }
                  }} disabled={gerandoPDFReinc} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: gerandoPDFReinc ? '#64748b' : '#c2410c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: gerandoPDFReinc ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {gerandoPDFReinc ? '⏳ Gerando PDF...' : '🖨️ Imprimir / Salvar PDF'}
                  </button>

                  <button onClick={() => compartilharReincidenciaWhatsApp(r)} disabled={capturandoReinc} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: capturandoReinc ? '#64748b' : '#25d366', color: '#fff', fontSize: 14, fontWeight: 700, cursor: capturandoReinc ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                    {capturandoReinc ? '⏳ Gerando imagem...' : '📸 Compartilhar no WhatsApp'}
                  </button>

                  <button onClick={() => setDetalheReinc(null)} style={{ width: '100%', padding: 13, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Fechar
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
