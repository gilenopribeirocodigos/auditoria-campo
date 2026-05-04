# Auditoria Operacional de Campo — DPL Construções

Sistema PWA (Progressive Web App) para auditoria de equipes de campo.
Funciona como aplicativo no celular, sem precisar da Play Store.

---

## 🚀 Deploy em 5 minutos (GitHub + Vercel)

### 1. Criar repositório no GitHub

```bash
git init
git add .
git commit -m "feat: sistema de auditoria campo v1.0"
git remote add origin https://github.com/SEU_USUARIO/auditoria-campo.git
git push -u origin main
```

### 2. Deploy no Vercel (gratuito)

1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **"Add New Project"**
3. Selecione o repositório `auditoria-campo`
4. Configurações:
   - Framework: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Clique em **Deploy**

Pronto! A URL gerada (ex: `auditoria-campo.vercel.app`) já funciona no celular.

### 3. Instalar no celular como app (PWA)

**Android (Chrome):**
1. Abra a URL no Chrome
2. Toque no menu (⋮) → "Adicionar à tela inicial"
3. O app aparece com ícone na tela

**iPhone (Safari):**
1. Abra a URL no Safari
2. Toque em Compartilhar (□↑) → "Adicionar à Tela de Início"
3. O app aparece com ícone na tela

---

## 💻 Rodar localmente

```bash
npm install
npm run dev
```

Acesse: http://localhost:5173

---

## 📁 Estrutura do projeto

```
auditoria-campo/
├── src/
│   ├── App.jsx                  # Componente raiz + shell mobile
│   ├── main.jsx                 # Entry point
│   ├── index.css                # CSS global (mobile-first)
│   ├── data/
│   │   └── checklists.js        # ← DADOS DOS CHECKLISTS (edite aqui)
│   ├── components/
│   │   └── Shared.jsx           # Componentes reutilizáveis
│   └── steps/
│       ├── S0Selecao.jsx        # Seleção tipo de serviço
│       ├── S1Identificacao.jsx  # Dados do fiscal e OS
│       ├── S2GPS.jsx            # Geolocalização
│       ├── S3Checklist.jsx      # Checklist SIM/NÃO
│       ├── S4Fotos.jsx          # Fotos e observações
│       ├── S5Assinatura.jsx     # Assinatura do eletricista
│       └── S6Resultado.jsx      # Resultado + impressão
├── vite.config.js               # Config Vite + PWA
├── index.html                   # Meta tags mobile
└── package.json
```

---

## ➕ Adicionar checklist de RELIGA

No arquivo `src/data/checklists.js`, adicione após ANEXO:

```js
RELIGA: {
  label: 'Religação',
  emoji: '⚡',
  PRODUTIVO: {
    label: 'Produtivo',
    peso: 8.3,          // ajuste conforme planilha
    items: [
      { id: 1, cat: 'COMPORTAMENTO', p: 'Pergunta 1...' },
      { id: 2, cat: 'QUALIDADE',     p: 'Pergunta 2...' },
      // ...
    ],
  },
  IMPRODUTIVO: {
    label: 'Improdutivo',
    peso: 10.0,
    items: [ ... ],
  },
},
```

Depois basta dar `git push` que o Vercel atualiza automaticamente.

---

## 📊 Critério de resultado

| Nota    | Status          |
|---------|-----------------|
| ≥ 90    | ATENDE          |
| 80 – 89 | ATENDE PARCIAL  |
| < 80    | NÃO ATENDE      |

---

## 🔮 Próximas versões

- [ ] Backend FastAPI + banco Supabase (histórico de auditorias)
- [ ] Geração de PDF server-side (WeasyPrint)
- [ ] Dashboard gerencial (Power BI embed)
- [ ] Checklist de Religação
- [ ] Modo offline com sync automático
- [ ] Geofencing (valida se fiscal está no local da OS)
- [ ] Notificação automática para coordenador quando nota < 80
