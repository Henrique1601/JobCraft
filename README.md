# JobCraft — Dashboard do Job Copilot

Painel web em **Next.js (App Router) + TypeScript + Tailwind CSS** para acompanhar em tempo real os passos executados pelo `job-copilot-agent`.

## Funcionalidades
- Leitura automática dos logs estruturados em `~/.gemini/job-copilot/runs/*.jsonl` (ou `JOB_COPILOT_DIR`).
- Resumo de configuração do perfil mestre sem expor PII (`mode`, `min_match_score`, limites diários, quantidade de PDFs ATS).
- Filtros por busca, Track (`Full-Stack`, `Front-End`, `Back-End`, `AI Engineer`) e Status.
- Timeline detalhada dos passos executados por vaga e link direto para a página do Notion.

## Como rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.
