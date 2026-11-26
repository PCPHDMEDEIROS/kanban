# HD Medeiros — Redesign e PCP interativo

## Estado desta entrega

Implementação realizada na branch `dev/redesign-pcp-interativo`. O ambiente produtivo não foi publicado, conforme a exigência de homologação prévia.

## Entregue

- identidade institucional compartilhada com Poppins, tokens `#1F3C88`, `#162B63`, `#E30613` e logo oficial do repositório de Relatórios;
- editor visual semanal com coluna **Sem programação**;
- movimentação local de fornos e lotes por drag-and-drop;
- criação manual, divisão e remoção de participantes de lote;
- distinção entre retirar do lote mantendo a semana e remover da programação;
- fixação de fornos e lotes;
- recálculo somente dos não programados, preservando decisões manuais;
- desfazer e refazer;
- persistência e reabertura de rascunhos em `cenarios_simulacao`;
- aviso de fonte desatualizada e validação de fingerprint antes da aprovação;
- conferência explícita antes da publicação transacional;
- exportação de carteira CSV, programação para PDF/impressão e Excel `.xlsx` real;
- tela de pendências com ocorrências e fornos únicos, filtros e exportação;
- testes unitários do novo motor de simulação.

## Segurança e preservação

- o estado visual não grava em `planejamento_kanban` durante movimentações;
- somente a RPC existente `aprovar_simulacao_pcp` publica o plano;
- apontamentos, operação real, operador e horários não são alterados;
- nenhuma migração ou modificação produtiva foi executada nesta fase;
- os perfis continuam baseados em `app_metadata.hd_role`.

## Homologação técnica

- `pnpm test`: 60 testes aprovados;
- `pnpm build`: build Vite aprovado;
- Excel gerado pelo pacote `xlsx` fixado em `0.18.5`;
- validação visual local ficou pendente porque o controle da janela do Chrome foi interrompido por entrada do usuário.

## Auditoria das pendências

O arquivo de 26/11/2026 contém 62 ocorrências para 59 séries. A consulta somente leitura ao Supabase confirmou:

- as 59 séries estão cadastradas como `FINALIZADO`;
- 24 séries não possuem apontamento sincronizado;
- 3 séries possuem apontamento aberto: 3045, 3053 e 3159;
- 7 séries possuem histórico de troca de série: 2964, 3038, 3047, 3160, 3206, 3210 e 3211;
- nenhuma das 59 possui `ACAB.` concluído representado no Supabase;
- diversos horários continuam armazenados com a data-base artificial de 1899.

Isso confirma inconsistência entre status finalizado e evidência produtiva, mas não autoriza correção automática. As séries com troca devem ser reconciliadas com a origem antes de qualquer alteração; as 24 sem apontamentos exigem conferência direta na planilha AppSheet.

## Pendências para homologação funcional

- validar drag-and-drop em desktop e tablet com usuário PCP;
- gerar e abrir um `.xlsx` real no Excel;
- revisar o PDF em impressão A4;
- abrir, salvar e publicar um cenário controlado de homologação;
- conferir todas as 59 séries na planilha de origem;
- aprovar o resultado antes de mesclar e publicar.

