# Agendamento on-line — como ativar

O site já está pronto. Enquanto a agenda não for ativada, o formulário envia os
dados do paciente pelo WhatsApp. Para ligar o agendamento direto no Google
Agenda, siga os passos abaixo **uma única vez** (cerca de 10 minutos), usando a
conta **fonoaudiologo.mateusflores@gmail.com**, de preferência no computador.

## 1. Criar o script

1. Acesse **https://script.google.com** e clique em **Novo projeto**.
2. Clique em "Projeto sem título" e renomeie para **Agendamento do site**.
3. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de
   [`apps-script/Code.gs`](apps-script/Code.gs).
4. Clique na engrenagem **⚙ Configurações do projeto** e marque
   **"Mostrar arquivo de manifesto appsscript.json no editor"**.
5. Volte ao editor (ícone `< >`), abra `appsscript.json`, apague o conteúdo e
   cole o de [`apps-script/appsscript.json`](apps-script/appsscript.json).
6. Clique em **💾 Salvar**.

## 2. Autorizar e criar a planilha

1. No topo do editor, escolha a função **configurar** e clique em **▶ Executar**.
2. O Google vai pedir autorização: **Revisar permissões → escolha sua conta →
   Avançado → Acessar Agendamento do site (não seguro) → Permitir**.
   (O aviso aparece porque o script é seu e não foi publicado na loja do Google.)
3. No registro de execução aparece o link da planilha **"Agendamentos do site –
   Mateus Flores"**, criada no seu Google Drive, e quantos horários estão livres.

## 3. Publicar

1. Clique em **Implantar → Nova implantação**.
2. Em "Selecionar tipo" (engrenagem), escolha **App da Web**.
3. Preencha:
   - Executar como: **Eu (fonoaudiologo.mateusflores@gmail.com)**
   - Quem pode acessar: **Qualquer pessoa**
4. Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`).
5. **Envie esse link para o Claude**, ou cole-o em `js/booking.js` na linha
   `const AGENDAMENTO_URL = "";`.

## Como funciona

- O site mostra os horários livres de **terça a sexta, das 8h às 18h**, com
  consultas de **50 minutos** começando de hora em hora, de **48h a 30 dias** à
  frente. Horários ocupados na sua agenda e feriados nacionais não aparecem.
  Eventos marcados como "Disponível" (livre) não bloqueiam horário.
- O paciente informa: nome completo, data de nascimento, responsáveis (só se for
  menor de 18 anos), telefone, e-mail, modalidade, queixa principal e o
  consentimento da LGPD.
- Ao confirmar:
  - a consulta é criada na sua agenda como evento **privado**, com os dados na
    descrição;
  - os dados vão para a planilha "Agendamentos do site";
  - o paciente recebe um e-mail de confirmação (sem a queixa) e você recebe um
    e-mail com todos os dados.
- Se dois pacientes tentarem o mesmo horário, só o primeiro consegue; o segundo
  vê a lista atualizada.

## Ajustes

Todas as regras ficam no início do `Code.gs`, no bloco `CONFIG` (dias,
horários, duração, antecedência, endereço, e-mails). Depois de alterar:
**Implantar → Gerenciar implantações → ✏ Editar → Versão: Nova versão →
Implantar**. O link continua o mesmo.

## Privacidade (LGPD)

A queixa principal é um dado de saúde (dado sensível). Os dados ficam apenas na
sua conta Google (Agenda, Planilha e Gmail). Mantenha a verificação em duas
etapas ativa na conta e não compartilhe a planilha.
