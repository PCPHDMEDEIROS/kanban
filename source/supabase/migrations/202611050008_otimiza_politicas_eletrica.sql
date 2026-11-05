drop policy if exists grava_preparacao_eletrica on hd_kanban.preparacao_eletrica;
create policy insere_preparacao_eletrica on hd_kanban.preparacao_eletrica for insert to authenticated with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP','ELETRICA'));
create policy atualiza_preparacao_eletrica on hd_kanban.preparacao_eletrica for update to authenticated using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP','ELETRICA')) with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP','ELETRICA'));
drop policy if exists grava_alertas_pcp on hd_kanban.alertas_pcp;
create policy insere_alertas_pcp on hd_kanban.alertas_pcp for insert to authenticated with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP','ELETRICA'));
create policy atualiza_alertas_pcp on hd_kanban.alertas_pcp for update to authenticated using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP','ELETRICA')) with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP','ELETRICA'));
drop policy if exists grava_cenarios on hd_kanban.cenarios_simulacao;
create policy insere_cenarios on hd_kanban.cenarios_simulacao for insert to authenticated with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP') and created_by=(select auth.uid()));
create policy atualiza_cenarios on hd_kanban.cenarios_simulacao for update to authenticated using(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP') and created_by=(select auth.uid())) with check(coalesce((select auth.jwt())->'app_metadata'->>'hd_role','CONSULTA') in('ADMIN','PCP') and created_by=(select auth.uid()));

