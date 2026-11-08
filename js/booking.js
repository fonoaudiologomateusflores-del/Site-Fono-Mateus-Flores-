// ===== AGENDAMENTO ON-LINE =====
// Cole aqui o endereço do app da Web do Google Apps Script (termina em /exec).
// Enquanto estiver vazio, o formulário envia os dados pelo WhatsApp.
const AGENDAMENTO_URL = "https://script.google.com/macros/s/AKfycbz9m7Ne7LAb6qR940IMXYYpXaunADQEytzJ4pgFLZUa20YXY_KsEYPiRSfvcLJjnHML9Q/exec";
const WHATSAPP_NUMBER = "5551995552044";
const FUSO = "America/Sao_Paulo";

(() => {
  const form = document.getElementById("booking");
  if (!form) return;
  const $ = (sel) => form.querySelector(sel);
  const status = $(".slots-status");
  const daysEl = $(".days");
  const timesEl = $(".times");
  const periodoField = $("#periodo-field");
  const responsaveis = $(".responsaveis");
  const resp1 = $("#responsavel1");
  const errorMsg = $(".form-error");
  const submitBtn = form.querySelector('button[type="submit"]');
  const done = document.querySelector(".booking-done");

  let modoOnline = Boolean(AGENDAMENTO_URL);
  let horarioEscolhido = null;
  let carregadoEm = 0;
  const VALIDADE_MS = 3 * 60 * 1000; // recarrega a lista se tiver mais de 3 minutos

  const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" });
  const fmtChave = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  const fmtLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });

  // Data de nascimento não pode ser no futuro
  $("#nascimento").max = fmtChave.format(new Date());

  // ---------- Modo WhatsApp (sem agenda on-line) ----------
  function ativarModoWhatsApp(motivo) {
    modoOnline = false;
    horarioEscolhido = null;
    daysEl.hidden = true;
    timesEl.hidden = true;
    periodoField.hidden = false;
    status.textContent = motivo;
    submitBtn.textContent = "Enviar pelo WhatsApp";
  }

  // ---------- Horários ----------
  async function carregarHorarios() {
    status.textContent = "Carregando horários disponíveis…";
    daysEl.hidden = timesEl.hidden = true;
    try {
      const r = await fetch(AGENDAMENTO_URL + "?action=horarios", { cache: "no-store" });
      const data = await r.json();
      if (!data.ok) throw new Error(data.erro);
      carregadoEm = Date.now();
      montarDias(data.horarios.map((h) => new Date(h)));
    } catch (err) {
      console.error(err);
      ativarModoWhatsApp("Não foi possível carregar a agenda agora. Envie seus dados e confirmamos o horário pelo WhatsApp.");
    }
  }

  function montarDias(horarios) {
    horarioEscolhido = null;
    if (!horarios.length) {
      ativarModoWhatsApp("No momento não há horários livres nos próximos 30 dias. Envie seus dados e entraremos em contato pelo WhatsApp.");
      return;
    }
    const porDia = new Map();
    horarios.forEach((h) => {
      const k = fmtChave.format(h);
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k).push(h);
    });
    daysEl.innerHTML = "";
    [...porDia.values()].forEach((lista) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      const [sem, data] = fmtDia.format(lista[0]).replace(".", "").split(", ");
      b.innerHTML = `<span>${sem}</span>${data}`;
      b.addEventListener("click", () => escolherDia(b, lista));
      daysEl.appendChild(b);
    });
    status.textContent = "Escolha o dia e depois o horário:";
    daysEl.hidden = false;
    escolherDia(daysEl.firstElementChild, porDia.values().next().value);
  }

  function escolherDia(botao, lista) {
    daysEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === botao)));
    horarioEscolhido = null;
    timesEl.innerHTML = "";
    lista.forEach((h) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip chip-time";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.textContent = fmtHora.format(h);
      b.addEventListener("click", () => {
        timesEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === b)));
        horarioEscolhido = h;
        status.textContent = "Horário escolhido: " + fmtLongo.format(h);
        errorMsg.hidden = true;
      });
      timesEl.appendChild(b);
    });
    timesEl.hidden = false;
    status.textContent = "Escolha o horário:";
  }

  // ---------- Menor de idade ----------
  function idade(iso) {
    if (!iso) return null;
    const [a, m, d] = iso.split("-").map(Number);
    const hoje = new Date();
    let anos = hoje.getFullYear() - a;
    if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos--;
    return anos;
  }
  $("#nascimento").addEventListener("change", (e) => {
    const anos = idade(e.target.value);
    const menor = anos !== null && anos >= 0 && anos < 18;
    responsaveis.hidden = !menor;
    resp1.required = menor;
  });

  // Limpa o destaque de erro assim que o campo é corrigido
  form.addEventListener("input", (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false");
  });
  form.addEventListener("change", (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false");
  });

  // ---------- Validação ----------
  function validar() {
    const f = form.elements;
    const erros = [];
    const marcar = (campo, invalido) => {
      campo.setAttribute("aria-invalid", String(invalido));
      if (invalido) erros.push(campo);
    };
    marcar(f.nome, f.nome.value.trim().split(/\s+/).length < 2);
    const anos = idade(f.nascimento.value);
    marcar(f.nascimento, anos === null || anos < 0 || anos > 120);
    marcar(f.responsavel1, resp1.required && !f.responsavel1.value.trim());
    marcar(f.telefone, f.telefone.value.replace(/\D/g, "").length < 10);
    marcar(f.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()));
    marcar(f.queixa, !f.queixa.value.trim());
    marcar(f.consentimento, !f.consentimento.checked);

    const partes = [];
    if (modoOnline && !horarioEscolhido) partes.push("Escolha um horário disponível.");
    if (erros.length) partes.push("Confira os campos destacados" + (resp1.required ? " (inclusive o nome do responsável)" : "") + ".");
    const msg = partes.join(" ");
    errorMsg.textContent = msg;
    errorMsg.hidden = !msg;
    if (msg) (modoOnline && !horarioEscolhido ? daysEl.querySelector("[aria-checked='true']") || daysEl : erros[0])?.focus();
    return !msg;
  }

  function dados() {
    const f = form.elements;
    return {
      nome: f.nome.value.trim(),
      nascimento: f.nascimento.value,
      responsavel1: resp1.required ? f.responsavel1.value.trim() : "",
      responsavel2: resp1.required ? f.responsavel2.value.trim() : "",
      telefone: f.telefone.value.trim(),
      email: f.email.value.trim(),
      modalidade: f.modalidade.value,
      queixa: f.queixa.value.trim(),
      consentimento: f.consentimento.checked,
      website: f.website.value,
    };
  }

  function enviarWhatsApp(d) {
    const [a, m, dd] = d.nascimento.split("-");
    const linhas = [
      "Olá, Mateus! Gostaria de agendar uma consulta.",
      `Paciente: ${d.nome}`,
      `Nascimento: ${dd}/${m}/${a}`,
      d.responsavel1 && `Responsável: ${d.responsavel1}`,
      d.responsavel2 && `2º responsável: ${d.responsavel2}`,
      `Telefone: ${d.telefone}`,
      `E-mail: ${d.email}`,
      `Modalidade: ${d.modalidade}`,
      `Melhor período: ${form.elements.periodo.value}`,
      `Queixa principal: ${d.queixa}`,
    ].filter(Boolean);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(linhas.join("\n"))}`, "_blank", "noopener");
  }

  const MENSAGENS = {
    horario_ocupado: "Esse horário acabou de ser reservado. Atualizamos a lista: escolha outro, por favor.",
    responsavel: "Informe o nome completo do responsável.",
    nascimento: "Confira a data de nascimento.",
    email: "Confira o e-mail informado.",
    telefone: "Confira o telefone, com DDD.",
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validar()) return;
    const d = dados();
    if (!modoOnline) return enviarWhatsApp(d);

    submitBtn.disabled = true;
    submitBtn.textContent = "Confirmando…";
    try {
      const r = await fetch(AGENDAMENTO_URL, {
        method: "POST",
        body: JSON.stringify({ ...d, inicio: horarioEscolhido.toISOString() }),
      });
      const res = await r.json();
      if (res.ok) {
        form.hidden = true;
        const quando = fmtLongo.format(horarioEscolhido);
        done.querySelector(".done-when").textContent = quando.charAt(0).toUpperCase() + quando.slice(1) + " · " + d.modalidade;
        done.hidden = false;
        done.focus();
        return;
      }
      errorMsg.textContent = MENSAGENS[res.erro] || "Não foi possível concluir o agendamento. Tente novamente ou fale pelo WhatsApp.";
      errorMsg.hidden = false;
      if (res.erro === "horario_ocupado") carregarHorarios();
    } catch (err) {
      console.error(err);
      errorMsg.textContent = "Falha de conexão. Tente novamente ou fale pelo WhatsApp.";
      errorMsg.hidden = false;
    } finally {
      submitBtn.disabled = false;
      if (modoOnline) submitBtn.textContent = "Confirmar agendamento";
    }
  });

  // Mantém a lista em dia: ao voltar para a aba Agendamento ou para a janela
  const atualizarSeAntigo = () => {
    if (modoOnline && !form.hidden && location.hash === "#agendamento" && Date.now() - carregadoEm > VALIDADE_MS) carregarHorarios();
  };
  window.addEventListener("hashchange", atualizarSeAntigo);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizarSeAntigo(); });

  if (modoOnline) carregarHorarios();
  else ativarModoWhatsApp("A agenda on-line estará disponível em breve. Envie seus dados e confirmamos o horário pelo WhatsApp.");
})();
