/**
 * Agendamento on-line — Mateus Flores, Fonoaudiólogo
 *
 * Este script roda na conta Google do consultório e faz a ponte entre o site
 * e o Google Agenda:
 *   GET  ?action=horarios[&tipo=supervisao] -> lista os horários livres
 *   POST (JSON)            -> cria a consulta (ou a supervisão) na agenda,
 *                             registra na planilha e envia e-mails
 *
 *   GET  ?action=curso       -> situação das inscrições do curso (vagas)
 *   GET  ?action=cupom&codigo=X -> confere o código de ex-aluno
 *   POST (JSON, tipo=curso)  -> registra a inscrição e devolve o pagamento
 *
 * Supervisão: horários vêm das células "Livre Supervisão" da planilha de agenda.
 * A chave Pix NÃO fica neste código (o projeto é público): cadastre-a em
 * Configurações do projeto → Propriedades do script → PIX_CHAVE.
 *
 * Instalação: veja AGENDAMENTO-ONLINE.md na raiz do projeto.
 */

// ===================== CONFIGURAÇÃO =====================
const CONFIG = {
  AGENDA: 'primary',               // agenda onde as consultas são criadas
  AGENDAS_OCUPADAS: ['primary'],   // agendas consultadas para saber o que está ocupado
  AGENDA_FERIADOS: 'pt.brazilian#holiday@group.v.calendar.google.com', // '' para não bloquear feriados

  // De onde vêm os horários oferecidos:
  //  'planilha' = células "Livre" da planilha de agenda (recomendado)
  //  'agenda'   = eventos "Disponível" do Google Agenda
  FONTE: 'planilha',
  PLANILHA_AGENDA_ID: '1xxyg5GCcXKRZyklTPi5xu2twFLvWoituPSm58Ba-TLw', // Agenda Fgo. Mateus Flores 2026
  TEXTO_LIVRE: 'Livre',
  MARCA_SINCRONIZADOS: 'sincronizado da planilha de agenda', // eventos que só espelham a planilha
  TITULO_DISPONIVEL: 'Disponível',
  SOMENTE_DISPONIVEL: true,        // (FONTE 'agenda') false = qualquer horário vago em DIAS_SEMANA/INICIO/FIM

  DIAS_SEMANA: [2, 3, 4, 5],       // 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sáb
  INICIO: '08:00',                 // primeiro horário do dia
  FIM: '19:00',                    // a consulta precisa terminar até este horário
  DURACAO_MIN: 50,                 // duração da consulta (minutos)
  INTERVALO_MIN: 60,               // horários começam de hora em hora (10 min de intervalo)

  ANTECEDENCIA_MIN_HORAS: 48,      // não permite agendar com menos que isso
  ANTECEDENCIA_MAX_DIAS: 30,       // até quantos dias à frente aparece

  TITULO_EVENTO: 'Consulta (site)',   // sem nome de paciente no Google Agenda (regra do consultório)
  ENDERECO: 'Edifício Rui Barbosa – Av. Luiz Manoel Gonzaga, 351, Sala 703 – Três Figueiras, Porto Alegre – RS',
  WHATSAPP: '(51) 99555-2044',
  NOME_PROFISSIONAL: 'Mateus Flores – Fonoaudiólogo',
  ENVIAR_EMAIL_PACIENTE: true,
  ENVIAR_EMAIL_PROFISSIONAL: true,

  // ----- Supervisão clínica -----
  TEXTO_LIVRE_SUPERVISAO: 'Livre Supervisão',
  DURACAO_SUPERVISAO_MIN: 60,
  DIAS_SEMANA_SUPERVISAO: [0, 1, 2, 3, 4, 5, 6], // qualquer dia com "Livre Supervisão" na planilha
  TITULO_EVENTO_SUPERVISAO: 'Supervisão (site) – aguardando Pix',
  VALOR_SUPERVISAO: 'R$ 250,00',
  VALOR_SUPERVISAO_PACOTE: 'R$ 190,00',   // por encontro, pacote a partir de 4 encontros
  VALOR_PACOTE_POR_ENCONTRO: 190,

  // ----- Curso com inscrição pelo site -----
  // Links de pagamento, código de ex-aluno e valores de ex-aluno ficam nas
  // Propriedades do script (o projeto é público): CURSO_LINK_GERAL,
  // CURSO_LINK_EXALUNO, CURSO_CUPOM, CURSO_EXALUNO_PIX, CURSO_EXALUNO_CARTAO.
  CURSO: {
    NOME: 'Avaliação formal da linguagem oral: dos protocolos ao plano terapêutico',
    VAGAS: 25,
    INSCRICOES_ATE: '2027-01-18',          // último dia de inscrição (inclusive)
    INICIO: '18 de janeiro de 2027',
    GERAL_PIX: 746.00,
    GERAL_CARTAO: 935.00,                  // total no cartão, em até 10x
  },         // usado para calcular o total do pacote (pago de uma vez)
  PACOTE_MIN_ENCONTROS: 4,
  PACOTE_MAX_ENCONTROS: 20,
};
// ========================================================

const FUSO = 'America/Sao_Paulo';

/** Rode uma vez pelo editor para criar a planilha e autorizar o acesso. */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PLANILHA_ID')) {
    const ss = SpreadsheetApp.create('Agendamentos do site – Mateus Flores');
    const sh = ss.getSheets()[0];
    sh.setName('Agendamentos');
    sh.appendRow(['Registrado em', 'Data da consulta', 'Horário', 'Modalidade', 'Paciente',
      'Nascimento', 'Idade', 'Responsável 1', 'Responsável 2', 'Telefone', 'E-mail',
      'Queixa principal', 'Consentimento LGPD', 'ID do evento']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 14).setFontWeight('bold');
    props.setProperty('PLANILHA_ID', ss.getId());
    Logger.log('Planilha criada: ' + ss.getUrl());
  } else {
    Logger.log('Planilha já existe: ' + SpreadsheetApp.openById(props.getProperty('PLANILHA_ID')).getUrl());
  }
  ETAPAS = [];
  try {
    Logger.log('Horários disponíveis agora: ' + horariosLivres_().length);
  } finally {
    Logger.log(JSON.stringify(ETAPAS, null, 1));
  }
}

// --------------------- Web app ---------------------

function doGet(e) {
  ETAPAS = [];
  const diagnostico = e && e.parameter && e.parameter.action === 'diagnostico';
  const tipo = e && e.parameter && e.parameter.tipo === 'supervisao' ? 'supervisao' : 'consulta';
  const action = e && e.parameter && e.parameter.action;
  if (action === 'curso') return json_(situacaoCurso_());
  if (action === 'cupom') return json_(conferirCupom_(e.parameter.codigo));
  try {
    const horarios = horariosLivres_(tipo).map((d) => d.toISOString());
    if (diagnostico) return json_({ ok: true, tipo: tipo, total: horarios.length, primeiros: horarios.slice(0, 5), etapas: ETAPAS });
    return json_({ ok: true, duracao: duracao_(tipo), horarios: horarios });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, erro: 'indisponivel', detalhe: String(err && err.message || err), etapas: ETAPAS });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const dados = JSON.parse(e.postData.contents);
    if (dados.website) return json_({ ok: true }); // armadilha anti-robô
    if (dados.tipo === 'supervisao') return agendarSupervisao_(dados, lock);
    if (dados.tipo === 'curso') return inscreverCurso_(dados, lock);

    const p = validar_(dados);
    if (p.erro) return json_({ ok: false, erro: p.erro });

    lock.waitLock(20000);
    const livres = horariosLivres_().map((d) => d.getTime());
    if (livres.indexOf(p.inicio.getTime()) === -1) return json_({ ok: false, erro: 'horario_ocupado' });
    if (CONFIG.FONTE === 'planilha' && !marcarNaPlanilhaAgenda_(p)) return json_({ ok: false, erro: 'horario_ocupado' });

    const fim = new Date(p.inicio.getTime() + CONFIG.DURACAO_MIN * 60000);
    const evento = (CONFIG.AGENDA === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CONFIG.AGENDA))
      .createEvent(CONFIG.TITULO_EVENTO, p.inicio, fim, {
        description: 'Agendado pelo site. Modalidade: ' + p.modalidade + '.\n' +
          'Dados do paciente na planilha de agenda, na planilha "Agendamentos do site" e no e-mail de aviso.',
        location: p.modalidade === 'On-line' ? 'On-line' : CONFIG.ENDERECO,
      });
    evento.setVisibility(CalendarApp.Visibility.PRIVATE);
    evento.removeAllReminders();
    evento.addPopupReminder(60);

    registrarPlanilha_(p, evento.getId());
    lock.releaseLock();

    enviarEmails_(p);
    return json_({ ok: true, inicio: p.inicio.toISOString() });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, erro: 'falha' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// --------------------- Disponibilidade ---------------------

// Registro de etapas (usado no diagnóstico: ...exec?action=diagnostico)
let ETAPAS = [];
function etapa_(nome, fn) {
  const t0 = Date.now();
  try {
    const r = fn();
    ETAPAS.push({ etapa: nome, ok: true, ms: Date.now() - t0, info: typeof r === 'number' ? r : undefined });
    return r;
  } catch (err) {
    ETAPAS.push({ etapa: nome, ok: false, ms: Date.now() - t0, erro: String(err && err.message || err) });
    throw err;
  }
}

function agenda_(id) {
  return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

function duracao_(tipo) {
  return tipo === 'supervisao' ? CONFIG.DURACAO_SUPERVISAO_MIN : CONFIG.DURACAO_MIN;
}

function textoLivre_(tipo) {
  return tipo === 'supervisao' ? CONFIG.TEXTO_LIVRE_SUPERVISAO : CONFIG.TEXTO_LIVRE;
}

function horariosLivres_(tipo) {
  tipo = tipo || 'consulta';
  const agora = new Date();
  const limite = new Date(agora.getTime() + (CONFIG.ANTECEDENCIA_MAX_DIAS + 1) * 86400000);
  const alvo = normalizar_(CONFIG.TITULO_DISPONIVEL);
  CELULAS_LIVRES = [];

  // 1. Eventos das agendas: blocos "Disponível" viram janelas; o resto ocupa horário
  const ocupados = [];
  const janelas = [];
  CONFIG.AGENDAS_OCUPADAS.forEach((id) => {
    const eventos = etapa_('ler agenda ' + id, () => {
      const cal = agenda_(id);
      if (!cal) throw new Error('agenda não encontrada: ' + id);
      return cal.getEvents(agora, limite);
    });
    eventos.forEach((ev) => {
      if (ev.isAllDayEvent()) return;
      const intervalo = [ev.getStartTime().getTime(), ev.getEndTime().getTime()];
      if (normalizar_(ev.getTitle()) === alvo) { janelas.push(intervalo); return; }
      // No modo planilha, os eventos que só espelham a planilha não contam (a planilha manda)
      if (CONFIG.FONTE === 'planilha' && String(ev.getDescription() || '').indexOf(CONFIG.MARCA_SINCRONIZADOS) !== -1) return;
      if (String(ev.getMyStatus()) === 'NO') return;                       // convite recusado
      if (typeof ev.getTransparency === 'function' && String(ev.getTransparency()) === 'TRANSPARENT') return; // marcado como "livre"
      ocupados.push(intervalo);
    });
  });
  ETAPAS.push({ etapa: 'compromissos ocupados', info: ocupados.length });

  let usarJanelas = CONFIG.SOMENTE_DISPONIVEL ? janelas : null;
  if (CONFIG.FONTE === 'planilha') {
    CELULAS_LIVRES = etapa_('ler planilha de agenda', () => celulasLivres_(agora, limite, textoLivre_(tipo)));
    ETAPAS.push({ etapa: 'células "' + textoLivre_(tipo) + '"', info: CELULAS_LIVRES.length });
    usarJanelas = CELULAS_LIVRES.map((c) => [c.inicio, c.fim]);
  } else {
    ETAPAS.push({ etapa: 'blocos Disponível', info: janelas.length });
  }

  // 2. Feriados (se falhar, segue sem bloquear feriados)
  const feriados = {};
  if (CONFIG.AGENDA_FERIADOS) {
    try {
      etapa_('ler feriados', () => {
        const cal = CalendarApp.getCalendarById(CONFIG.AGENDA_FERIADOS);
        if (!cal) return 0;
        const evs = cal.getEvents(agora, limite);
        evs.forEach((ev) => { feriados[Utilities.formatDate(ev.getStartTime(), FUSO, 'yyyy-MM-dd')] = true; });
        return evs.length;
      });
    } catch (err) { console.warn('Feriados ignorados', err); }
  }

  // 3. Cálculo
  return etapa_('calcular horários', () =>
    calcularHorarios(ocupados, agora, Object.assign({}, CONFIG, {
      DURACAO_MIN: duracao_(tipo),
      DIAS_SEMANA: tipo === 'supervisao' ? CONFIG.DIAS_SEMANA_SUPERVISAO : CONFIG.DIAS_SEMANA,
    }), feriados, usarJanelas));
}

// --------------------- Planilha de agenda ---------------------

let CELULAS_LIVRES = [];

/** Converte dia/mês da planilha numa data, escolhendo o ano mais próximo de "agora". */
function dataDoAno_(dia, mes, agora) {
  let d = new Date(agora.getFullYear(), mes - 1, dia);
  if (d.getTime() < agora.getTime() - 180 * 86400000) d = new Date(agora.getFullYear() + 1, mes - 1, dia);
  if (d.getTime() > agora.getTime() + 180 * 86400000) d = new Date(agora.getFullYear() - 1, mes - 1, dia);
  return d;
}

/**
 * Lê as abas semanais ("09/11 a 14/11"...) e devolve as células "Livre":
 * [{inicio, fim, aba, linha, coluna}]. Cada linha da planilha vale uma hora.
 */
function celulasLivres_(agora, limite, texto) {
  const livre = normalizar_(texto || CONFIG.TEXTO_LIVRE);
  const out = [];
  SpreadsheetApp.openById(CONFIG.PLANILHA_AGENDA_ID).getSheets().forEach((sh) => {
    const m = sh.getName().match(/^\s*(\d{1,2})\/(\d{1,2})\s*a\s*(\d{1,2})\/(\d{1,2})/);
    if (!m) return;
    const ini = dataDoAno_(+m[1], +m[2], agora);
    const fimSemana = dataDoAno_(+m[3], +m[4], agora);
    if (fimSemana.getTime() + 86400000 < agora.getTime() || ini.getTime() > limite.getTime()) return;
    out.push.apply(out, celulasLivresDaAba_(sh.getName(), sh.getDataRange().getDisplayValues(), agora, livre));
  });
  return out;
}

/** Função pura (testável): procura as células "Livre" numa grade de valores. */
function celulasLivresDaAba_(aba, valores, agora, livre) {
  const out = [];
  const h = valores.findIndex((r) => normalizar_(r[0]) === 'horario');
  if (h < 0) return out;
  const datas = valores[h].map((c) => {
    const d = String(c).match(/(\d{1,2})\/(\d{1,2})/);
    return d ? dataDoAno_(+d[1], +d[2], agora) : null;
  });
  for (let r = h + 1; r < valores.length; r++) {
    const hm = String(valores[r][0]).trim().match(/^(\d{1,2})[:h](\d{2})/);
    if (!hm) continue;
    for (let c = 1; c < datas.length; c++) {
      if (!datas[c] || normalizar_(valores[r][c]) !== livre) continue;
      const d = datas[c];
      const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[1], +hm[2]).getTime();
      out.push({ inicio: inicio, fim: inicio + CONFIG.INTERVALO_MIN * 60000, aba: aba, linha: r + 1, coluna: c + 1 });
    }
  }
  return out;
}

/** Escreve o nome do paciente na célula "Livre" do horário. Devolve false se ela não estiver mais livre. */
function marcarNaPlanilhaAgenda_(p, texto, valorCelula, nota) {
  const cel = CELULAS_LIVRES.filter((c) => c.inicio === p.inicio.getTime())[0];
  if (!cel) return false;
  const range = SpreadsheetApp.openById(CONFIG.PLANILHA_AGENDA_ID).getSheetByName(cel.aba).getRange(cel.linha, cel.coluna);
  if (normalizar_(range.getDisplayValue()) !== normalizar_(texto || CONFIG.TEXTO_LIVRE)) return false;
  range.setValue(valorCelula || p.nome)
    .setFontColor('#000000').setFontWeight('normal').setFontStyle('normal')     // regra: nome em preto, sem negrito/itálico
    .setNote(nota || ('Agendado pelo site em ' + fmt_(new Date(), 'dd/MM/yyyy HH:mm') +
      (p.responsavel1 ? '\nResponsável: ' + p.responsavel1 : '') + '\nTelefone: ' + p.telefone));
  SpreadsheetApp.flush();
  return true;
}

function normalizar_(t) {
  return String(t || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Função pura (testável): devolve os inícios de consulta livres.
 * ocupados: [[inicioMs, fimMs], ...]; feriados: {'yyyy-MM-dd': true}
 * janelas: [[inicioMs, fimMs], ...] dos eventos "Disponível" (ou null para
 * usar DIAS_SEMANA/INICIO/FIM). Usa o fuso do script (America/Sao_Paulo).
 */
function calcularHorarios(ocupados, agora, cfg, feriados, janelas) {
  const [hi, mi] = cfg.INICIO.split(':').map(Number);
  const [hf, mf] = cfg.FIM.split(':').map(Number);
  const minimo = agora.getTime() + cfg.ANTECEDENCIA_MIN_HORAS * 3600000;
  const maximo = agora.getTime() + cfg.ANTECEDENCIA_MAX_DIAS * 86400000;
  const dur = cfg.DURACAO_MIN * 60000;
  const out = [];
  const chaveDia = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const livre = (t) => t >= minimo && t <= maximo && !ocupados.some((o) => t < o[1] && t + dur > o[0]);

  if (janelas) {
    const vistos = {};
    janelas.slice().sort((a, b) => a[0] - b[0]).forEach((j) => {
      for (let t = j[0]; t + dur <= j[1]; t += cfg.INTERVALO_MIN * 60000) {
        if (vistos[t] || (feriados && feriados[chaveDia(new Date(t))])) continue;
        if (cfg.DIAS_SEMANA.indexOf(new Date(t).getDay()) === -1) continue;
        if (livre(t)) { vistos[t] = true; out.push(new Date(t)); }
      }
    });
    return out;
  }

  for (let i = 0; i <= cfg.ANTECEDENCIA_MAX_DIAS + 1; i++) {
    const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    if (cfg.DIAS_SEMANA.indexOf(dia.getDay()) === -1) continue;
    if (feriados && feriados[chaveDia(dia)]) continue;

    const fimDia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hf, mf).getTime();
    for (let t = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hi, mi).getTime(); t + dur <= fimDia; t += cfg.INTERVALO_MIN * 60000) {
      if (livre(t)) out.push(new Date(t));
    }
  }
  return out;
}

// --------------------- Dados do paciente ---------------------

function idade_(nascimento, ref) {
  let anos = ref.getFullYear() - nascimento.getFullYear();
  const m = ref.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < nascimento.getDate())) anos--;
  return anos;
}

function limpar_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}

function validar_(d) {
  const p = {
    nome: limpar_(d.nome, 120),
    nascimentoTxt: limpar_(d.nascimento, 10),
    responsavel1: limpar_(d.responsavel1, 120),
    responsavel2: limpar_(d.responsavel2, 120),
    telefone: limpar_(d.telefone, 30),
    email: limpar_(d.email, 120),
    modalidade: d.modalidade === 'On-line' ? 'On-line' : 'Presencial',
    queixa: limpar_(d.queixa, 1500).replace(/\s+/g, ' '),
    consentimento: d.consentimento === true,
    inicio: new Date(d.inicio),
  };
  if (!p.nome || p.nome.split(' ').length < 2) return { erro: 'nome' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.nascimentoTxt)) return { erro: 'nascimento' };
  const [a, m, dd] = p.nascimentoTxt.split('-').map(Number);
  p.nascimento = new Date(a, m - 1, dd);
  p.idade = idade_(p.nascimento, new Date());
  if (isNaN(p.idade) || p.idade < 0 || p.idade > 120) return { erro: 'nascimento' };
  if (p.idade < 18 && !p.responsavel1) return { erro: 'responsavel' };
  if (p.telefone.replace(/\D/g, '').length < 10) return { erro: 'telefone' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return { erro: 'email' };
  if (!p.queixa) return { erro: 'queixa' };
  if (!p.consentimento) return { erro: 'consentimento' };
  if (isNaN(p.inicio.getTime())) return { erro: 'horario' };
  return p;
}

function fmt_(d, padrao) {
  return Utilities.formatDate(d, FUSO, padrao);
}

function dataPorExtenso_(d) {
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return dias[Number(fmt_(d, 'u')) % 7] + ', ' + fmt_(d, "dd/MM/yyyy 'às' HH'h'mm");
}

function descricao_(p) {
  return [
    'Agendado pelo site',
    '',
    'Paciente: ' + p.nome,
    'Nascimento: ' + fmt_(p.nascimento, 'dd/MM/yyyy') + ' (' + p.idade + ' anos)',
    p.responsavel1 ? 'Responsável 1: ' + p.responsavel1 : '',
    p.responsavel2 ? 'Responsável 2: ' + p.responsavel2 : '',
    'Telefone: ' + p.telefone,
    'E-mail: ' + p.email,
    'Modalidade: ' + p.modalidade,
    '',
    'Queixa principal:',
    p.queixa,
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
}

function registrarPlanilha_(p, eventoId) {
  const id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) return;
  SpreadsheetApp.openById(id).getSheets()[0].appendRow([
    new Date(), fmt_(p.inicio, 'dd/MM/yyyy'), fmt_(p.inicio, 'HH:mm'), p.modalidade, p.nome,
    fmt_(p.nascimento, 'dd/MM/yyyy'), p.idade, p.responsavel1, p.responsavel2,
    "'" + p.telefone, p.email, p.queixa, 'Sim', eventoId,
  ]);
}

function enviarEmails_(p) {
  const quando = dataPorExtenso_(p.inicio);
  try {
    if (CONFIG.ENVIAR_EMAIL_PACIENTE) {
      MailApp.sendEmail({
        to: p.email,
        name: CONFIG.NOME_PROFISSIONAL,
        subject: 'Consulta agendada – ' + quando,
        body: [
          'Olá, ' + (p.responsavel1 || p.nome.split(' ')[0]) + '!',
          '',
          'A consulta' + (p.responsavel1 ? ' de ' + p.nome : '') + ' está agendada para ' + quando + '.',
          'Modalidade: ' + p.modalidade + (p.modalidade === 'On-line' ? ' (o link será enviado antes da consulta)' : ''),
          p.modalidade === 'On-line' ? '' : 'Endereço: ' + CONFIG.ENDERECO,
          '',
          'Se precisar remarcar ou cancelar, avise pelo WhatsApp ' + CONFIG.WHATSAPP + '.',
          '',
          CONFIG.NOME_PROFISSIONAL,
        ].join('\n'),
      });
    }
    if (CONFIG.ENVIAR_EMAIL_PROFISSIONAL) {
      MailApp.sendEmail({
        to: Session.getEffectiveUser().getEmail(),
        subject: 'Novo agendamento pelo site: ' + p.nome + ' – ' + quando,
        body: descricao_(p),
      });
    }
  } catch (err) {
    console.error('Falha ao enviar e-mail', err);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// --------------------- Supervisão clínica ---------------------

function validarSupervisao_(d) {
  const umDe = (v, opcoes) => (opcoes.indexOf(v) !== -1 ? v : '');
  const p = {
    nome: limpar_(d.nome, 120),
    perfil: umDe(d.perfil, ['Fonoaudiólogo(a)', 'Estudante de Fonoaudiologia']),
    registro: limpar_(d.registro, 120),
    telefone: limpar_(d.telefone, 30),
    email: limpar_(d.email, 120),
    area: umDe(d.area, ['Fluência', 'Linguagem Oral']),
    modalidade: umDe(d.modalidade, ['On-line', 'Presencial']),
    plano: umDe(d.plano, ['Encontro avulso', 'Pacote (a partir de 4 encontros)']),
    tema: limpar_(d.tema, 1500).replace(/\s+/g, ' '),
    consentimento: d.consentimento === true,
    inicio: new Date(d.inicio),
    encontros: 1,
  };
  if (!p.nome || p.nome.split(' ').length < 2) return { erro: 'nome' };
  if (!p.perfil) return { erro: 'perfil' };
  if (p.plano !== 'Encontro avulso') {
    p.encontros = parseInt(d.encontros, 10);
    if (!(p.encontros >= CONFIG.PACOTE_MIN_ENCONTROS && p.encontros <= CONFIG.PACOTE_MAX_ENCONTROS)) return { erro: 'encontros' };
  }
  if (p.telefone.replace(/\D/g, '').length < 10) return { erro: 'telefone' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return { erro: 'email' };
  if (!p.area) return { erro: 'area' };
  if (!p.modalidade) return { erro: 'modalidade' };
  if (!p.plano) return { erro: 'plano' };
  if (!p.consentimento) return { erro: 'consentimento' };
  if (isNaN(p.inicio.getTime())) return { erro: 'horario' };
  if (p.plano === 'Encontro avulso') {
    p.valor = CONFIG.VALOR_SUPERVISAO;
    p.planoDetalhe = 'Encontro avulso';
  } else {
    p.valor = reais_(p.encontros * CONFIG.VALOR_PACOTE_POR_ENCONTRO);
    p.planoDetalhe = 'Pacote de ' + p.encontros + ' encontros (' + CONFIG.VALOR_SUPERVISAO_PACOTE + ' cada), pago de uma vez';
  }
  return p;
}

function reais_(n) {
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function descricaoSupervisao_(p) {
  return [
    'Supervisão pré-agendada pelo site',
    '',
    'Nome: ' + p.nome,
    'Perfil: ' + p.perfil + (p.registro ? ' (' + p.registro + ')' : ''),
    'Área: ' + p.area,
    'Modalidade: ' + p.modalidade,
    'Plano: ' + p.planoDetalhe + ' – total ' + p.valor,
    'Telefone: ' + p.telefone,
    'E-mail: ' + p.email,
    p.tema ? '\nTema / caso:\n' + p.tema : '',
  ].filter((l) => l !== '').join('\n');
}

function agendarSupervisao_(dados, lock) {
  const p = validarSupervisao_(dados);
  if (p.erro) return json_({ ok: false, erro: p.erro });

  lock.waitLock(20000);
  const livres = horariosLivres_('supervisao').map((d) => d.getTime());
  if (livres.indexOf(p.inicio.getTime()) === -1) return json_({ ok: false, erro: 'horario_ocupado' });
  const nota = 'Supervisão pré-agendada pelo site em ' + fmt_(new Date(), 'dd/MM/yyyy HH:mm') +
    '\nAGUARDANDO COMPROVANTE PIX' +
    '\nÁrea: ' + p.area + ' · ' + p.modalidade + '\nPlano: ' + p.planoDetalhe + ' – ' + p.valor + '\nTelefone: ' + p.telefone;
  if (!marcarNaPlanilhaAgenda_(p, CONFIG.TEXTO_LIVRE_SUPERVISAO, 'Supervisão – ' + p.nome, nota)) {
    return json_({ ok: false, erro: 'horario_ocupado' });
  }

  const fim = new Date(p.inicio.getTime() + CONFIG.DURACAO_SUPERVISAO_MIN * 60000);
  const evento = agenda_(CONFIG.AGENDA).createEvent(CONFIG.TITULO_EVENTO_SUPERVISAO, p.inicio, fim, {
    description: 'Supervisão pré-agendada pelo site. Área: ' + p.area + '. Modalidade: ' + p.modalidade + '.\n' +
      'Confirmar após o comprovante do Pix. Dados na planilha de agenda, na planilha "Agendamentos do site" e no e-mail de aviso.',
    location: p.modalidade === 'On-line' ? 'On-line (Google Meet – link enviado no horário)' : CONFIG.ENDERECO,
  });
  evento.setVisibility(CalendarApp.Visibility.PRIVATE);
  evento.removeAllReminders();
  evento.addPopupReminder(60);

  registrarSupervisao_(p, evento.getId());
  lock.releaseLock();

  const pix = PropertiesService.getScriptProperties().getProperty('PIX_CHAVE') || '';
  enviarEmailsSupervisao_(p, pix);
  return json_({ ok: true, inicio: p.inicio.toISOString(), valor: p.valor, plano: p.planoDetalhe, encontros: p.encontros, pix: pix });
}

function registrarSupervisao_(p, eventoId) {
  const id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (!id) return;
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName('Supervisões');
  if (!sh) {
    sh = ss.insertSheet('Supervisões');
    sh.appendRow(['Registrado em', 'Data', 'Horário', 'Nome', 'Perfil', 'CRFa / Instituição', 'Área',
      'Modalidade', 'Plano', 'Valor', 'Telefone', 'E-mail', 'Tema / caso', 'Pagamento', 'ID do evento']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 15).setFontWeight('bold');
  }
  sh.appendRow([new Date(), fmt_(p.inicio, 'dd/MM/yyyy'), fmt_(p.inicio, 'HH:mm'), p.nome, p.perfil, p.registro,
    p.area, p.modalidade, p.planoDetalhe, p.valor, "'" + p.telefone, p.email, p.tema, 'Aguardando Pix', eventoId]);
}

function enviarEmailsSupervisao_(p, pix) {
  const quando = dataPorExtenso_(p.inicio);
  try {
    MailApp.sendEmail({
      to: p.email,
      name: CONFIG.NOME_PROFISSIONAL,
      subject: 'Supervisão pré-agendada – ' + quando,
      body: [
        'Olá, ' + p.nome.split(' ')[0] + '!',
        '',
        'Seu horário de supervisão (' + p.area + ', ' + p.modalidade.toLowerCase() + ') está pré-reservado para ' + quando + '.',
        '',
        'Para confirmar, faça o Pix de ' + p.valor + (p.plano === 'Encontro avulso' ? '' : ' (' + p.planoDetalhe.toLowerCase() + ')') +
          (pix ? ' para a chave ' + pix : '') + ' e envie o comprovante pelo WhatsApp ' + CONFIG.WHATSAPP + '.',
        'O encontro é confirmado após o recebimento do comprovante.',
        p.plano === 'Encontro avulso' ? null : 'Este é o primeiro encontro do pacote; as datas dos demais serão combinadas pelo WhatsApp.',
        '',
        p.modalidade === 'On-line' ? 'O link do Google Meet será enviado no horário da supervisão.' : 'Endereço: ' + CONFIG.ENDERECO,
        '',
        CONFIG.NOME_PROFISSIONAL,
      ].filter((l) => l !== null).join('\n'),
    });
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: 'Nova supervisão pré-agendada: ' + p.nome + ' – ' + quando,
      body: descricaoSupervisao_(p) + '\n\nAguardando comprovante do Pix.',
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail da supervisão', err);
  }
}

// --------------------- Curso: inscrições ---------------------

function prop_(nome) {
  return PropertiesService.getScriptProperties().getProperty(nome) || '';
}

function abaInscricoes_() {
  const id = prop_('PLANILHA_ID');
  if (!id) return null;
  const ss = SpreadsheetApp.openById(id);
  let sh = ss.getSheetByName('Inscrições');
  if (!sh) {
    sh = ss.insertSheet('Inscrições');
    sh.appendRow(['Registrado em', 'Curso', 'Nome (certificado)', 'Perfil', 'CRFa / Instituição', 'Cidade/UF',
      'Telefone', 'E-mail', 'Ex-aluno Mentoria', 'Forma de pagamento', 'Valor', 'Situação']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 12).setFontWeight('bold');
  }
  return sh;
}

/** Inscrições que ocupam vaga (tudo que não estiver "Cancelada"). */
function inscricoesAtivas_() {
  const sh = abaInscricoes_();
  if (!sh || sh.getLastRow() < 2) return 0;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues()
    .filter((r) => r[1] === CONFIG.CURSO.NOME && normalizar_(r[11]) !== 'cancelada').length;
}

function situacaoCurso_() {
  try {
    const [a, m, d] = CONFIG.CURSO.INSCRICOES_ATE.split('-').map(Number);
    const encerradoPorData = new Date() > new Date(a, m - 1, d, 23, 59, 59);
    const restantes = Math.max(0, CONFIG.CURSO.VAGAS - inscricoesAtivas_());
    return { ok: true, curso: true, aberto: !encerradoPorData && restantes > 0, vagas: CONFIG.CURSO.VAGAS,
      restantes: restantes, motivo: encerradoPorData ? 'prazo' : (restantes > 0 ? '' : 'esgotado') };
  } catch (err) {
    console.error(err);
    return { ok: false, curso: true, erro: 'indisponivel' };
  }
}

function cupomValido_(codigo) {
  const oficial = normalizar_(prop_('CURSO_CUPOM')).replace(/\s+/g, '');
  return !!oficial && normalizar_(codigo).replace(/\s+/g, '') === oficial;
}

function valoresCurso_(exAluno) {
  if (exAluno) {
    const pix = parseFloat(String(prop_('CURSO_EXALUNO_PIX')).replace(',', '.'));
    const cartao = parseFloat(String(prop_('CURSO_EXALUNO_CARTAO')).replace(',', '.'));
    if (!(pix > 0 && cartao > 0)) return null;
    return { pix: pix, cartao: cartao };
  }
  return { pix: CONFIG.CURSO.GERAL_PIX, cartao: CONFIG.CURSO.GERAL_CARTAO };
}

function textoValores_(v) {
  return { pix: reais_(v.pix), cartao: reais_(v.cartao), parcela: reais_(Math.round(v.cartao * 10) / 100) };
}

function conferirCupom_(codigo) {
  // Pequena pausa contra tentativas em sequência
  Utilities.sleep(400);
  if (!cupomValido_(codigo)) return { ok: true, valido: false };
  const v = valoresCurso_(true);
  if (!v) return { ok: false, erro: 'config' };
  return { ok: true, valido: true, valores: textoValores_(v) };
}

function inscreverCurso_(d, lock) {
  const umDe = (v, opcoes) => (opcoes.indexOf(v) !== -1 ? v : '');
  const p = {
    nome: limpar_(d.nome, 120),
    perfil: umDe(d.perfil, ['Fonoaudiólogo(a)', 'Estudante de Fonoaudiologia']),
    registro: limpar_(d.registro, 120),
    cidade: limpar_(d.cidade, 80),
    telefone: limpar_(d.telefone, 30),
    email: limpar_(d.email, 120),
    pagamento: umDe(d.pagamento, ['Pix', 'Cartão de crédito']),
    cupom: limpar_(d.cupom, 60),
    consentimento: d.consentimento === true,
  };
  if (!p.nome || p.nome.split(' ').length < 2) return json_({ ok: false, erro: 'nome' });
  if (!p.perfil) return json_({ ok: false, erro: 'perfil' });
  if (p.telefone.replace(/\D/g, '').length < 10) return json_({ ok: false, erro: 'telefone' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return json_({ ok: false, erro: 'email' });
  if (!p.pagamento) return json_({ ok: false, erro: 'pagamento' });
  if (!p.consentimento) return json_({ ok: false, erro: 'consentimento' });
  const exAluno = !!p.cupom && cupomValido_(p.cupom);
  if (p.cupom && !exAluno) return json_({ ok: false, erro: 'cupom' });

  const v = valoresCurso_(exAluno);
  const link = prop_(exAluno ? 'CURSO_LINK_EXALUNO' : 'CURSO_LINK_GERAL');
  const pix = prop_('PIX_CHAVE');
  if (!v || (p.pagamento === 'Pix' && !pix) || (p.pagamento !== 'Pix' && !link)) return json_({ ok: false, erro: 'config' });
  const t = textoValores_(v);
  const valor = p.pagamento === 'Pix' ? t.pix + ' no Pix' : 'até 10x de ' + t.parcela + ' (total ' + t.cartao + ') no cartão';

  lock.waitLock(20000);
  const sit = situacaoCurso_();
  if (!sit.ok || !sit.aberto) return json_({ ok: false, erro: sit.motivo || 'indisponivel' });
  abaInscricoes_().appendRow([new Date(), CONFIG.CURSO.NOME, p.nome, p.perfil, p.registro, p.cidade, "'" + p.telefone,
    p.email, exAluno ? 'Sim' : 'Não', p.pagamento, valor, 'Aguardando pagamento']);
  lock.releaseLock();

  enviarEmailsCurso_(p, valor, exAluno, link, pix);
  return json_({ ok: true, exAluno: exAluno, pagamento: p.pagamento, valor: valor,
    link: p.pagamento === 'Pix' ? '' : link, pix: p.pagamento === 'Pix' ? pix : '' });
}

function enviarEmailsCurso_(p, valor, exAluno, link, pix) {
  try {
    MailApp.sendEmail({
      to: p.email,
      name: CONFIG.NOME_PROFISSIONAL,
      subject: 'Inscrição recebida – ' + CONFIG.CURSO.NOME,
      body: [
        'Olá, ' + p.nome.split(' ')[0] + '!',
        '',
        'Recebemos sua inscrição no curso "' + CONFIG.CURSO.NOME + '", com início em ' + CONFIG.CURSO.INICIO + '.',
        '',
        'Valor: ' + valor + (exAluno ? ' (condição para ex-alunos da Mentoria Linguagem Infantil)' : '') + '.',
        p.pagamento === 'Pix' ? 'Chave Pix: ' + pix : 'Link de pagamento: ' + link,
        '',
        'Depois de pagar, envie o comprovante pelo WhatsApp ' + CONFIG.WHATSAPP + ' ou respondendo a este e-mail.',
        'Sua vaga é confirmada após o recebimento do comprovante.',
        '',
        CONFIG.NOME_PROFISSIONAL,
      ].join('\n'),
    });
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: 'Nova inscrição no curso: ' + p.nome,
      body: [
        'Curso: ' + CONFIG.CURSO.NOME,
        'Nome (certificado): ' + p.nome,
        'Perfil: ' + p.perfil + (p.registro ? ' (' + p.registro + ')' : ''),
        p.cidade ? 'Cidade/UF: ' + p.cidade : '',
        'Telefone: ' + p.telefone,
        'E-mail: ' + p.email,
        'Ex-aluno da Mentoria: ' + (exAluno ? 'sim' : 'não'),
        'Pagamento: ' + valor,
        '',
        'Aguardando comprovante.',
      ].filter((l) => l !== '').join('\n'),
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail da inscrição', err);
  }
}
