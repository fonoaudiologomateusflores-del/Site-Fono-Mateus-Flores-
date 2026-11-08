/**
 * Agendamento on-line — Mateus Flores, Fonoaudiólogo
 *
 * Este script roda na conta Google do consultório e faz a ponte entre o site
 * e o Google Agenda:
 *   GET  ?action=horarios  -> lista os horários livres
 *   POST (JSON)            -> cria a consulta na agenda, registra na planilha
 *                             e envia e-mails de confirmação
 *
 * Instalação: veja AGENDAMENTO-ONLINE.md na raiz do projeto.
 */

// ===================== CONFIGURAÇÃO =====================
const CONFIG = {
  AGENDA: 'primary',               // agenda onde as consultas são criadas
  AGENDAS_OCUPADAS: ['primary'],   // agendas consultadas para saber o que está ocupado
  AGENDA_FERIADOS: 'pt.brazilian#holiday@group.v.calendar.google.com', // '' para não bloquear feriados

  // Só oferece horários dentro dos eventos "Disponível" da agenda.
  // (false = qualquer horário vago dentro de DIAS_SEMANA/INICIO/FIM)
  SOMENTE_DISPONIVEL: true,
  TITULO_DISPONIVEL: 'Disponível',

  DIAS_SEMANA: [2, 3, 4, 5],       // 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sáb
  INICIO: '08:00',                 // primeiro horário do dia
  FIM: '18:00',                    // a consulta precisa terminar até este horário
  DURACAO_MIN: 50,                 // duração da consulta (minutos)
  INTERVALO_MIN: 60,               // horários começam de hora em hora (10 min de intervalo)

  ANTECEDENCIA_MIN_HORAS: 48,      // não permite agendar com menos que isso
  ANTECEDENCIA_MAX_DIAS: 30,       // até quantos dias à frente aparece

  TITULO_EVENTO: 'Consulta (site) – ',
  ENDERECO: 'Av. Luiz Manoel Gonzaga, 351, Sala 703 – Três Figueiras, Porto Alegre – RS',
  WHATSAPP: '(51) 99555-2044',
  NOME_PROFISSIONAL: 'Mateus Flores – Fonoaudiólogo',
  ENVIAR_EMAIL_PACIENTE: true,
  ENVIAR_EMAIL_PROFISSIONAL: true,
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
  try {
    const horarios = horariosLivres_().map((d) => d.toISOString());
    if (diagnostico) return json_({ ok: true, total: horarios.length, primeiros: horarios.slice(0, 5), etapas: ETAPAS });
    return json_({ ok: true, duracao: CONFIG.DURACAO_MIN, horarios: horarios });
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

    const p = validar_(dados);
    if (p.erro) return json_({ ok: false, erro: p.erro });

    lock.waitLock(20000);
    const livres = horariosLivres_().map((d) => d.getTime());
    if (livres.indexOf(p.inicio.getTime()) === -1) return json_({ ok: false, erro: 'horario_ocupado' });

    const fim = new Date(p.inicio.getTime() + CONFIG.DURACAO_MIN * 60000);
    const evento = (CONFIG.AGENDA === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CONFIG.AGENDA))
      .createEvent(CONFIG.TITULO_EVENTO + p.nome, p.inicio, fim, {
        description: descricao_(p),
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

function horariosLivres_() {
  const agora = new Date();
  const limite = new Date(agora.getTime() + (CONFIG.ANTECEDENCIA_MAX_DIAS + 1) * 86400000);
  const alvo = normalizar_(CONFIG.TITULO_DISPONIVEL);

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
      if (String(ev.getMyStatus()) === 'NO') return;                       // convite recusado
      if (typeof ev.getTransparency === 'function' && String(ev.getTransparency()) === 'TRANSPARENT') return; // marcado como "livre"
      ocupados.push(intervalo);
    });
  });
  ETAPAS.push({ etapa: 'blocos Disponível', info: janelas.length }, { etapa: 'compromissos ocupados', info: ocupados.length });

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
    calcularHorarios(ocupados, agora, CONFIG, feriados, CONFIG.SOMENTE_DISPONIVEL ? janelas : null));
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
