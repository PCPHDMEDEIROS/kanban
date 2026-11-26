# Plano de rollback — Redesign PCP

1. Não aplicar migrações durante a homologação visual.
2. Manter o deploy produtivo no commit anterior ao redesign.
3. Se a homologação falhar, descartar a branch `dev/redesign-pcp-interativo` sem alterar `main`.
4. Se o redesign já tiver sido mesclado, reimplantar o último pacote `dist` aprovado anterior.
5. Rascunhos criados em `cenarios_simulacao` podem ser marcados logicamente como `DESCARTADO`; não apagar registros.
6. Não reverter tabelas de apontamentos, fornos, lotes ou histórico.
7. Confirmar após rollback: login, Kanban Operacional, Kanban PCP, programação, indicadores e aprovação transacional.

