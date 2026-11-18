// ===== AGENDAMENTO DE SUPERVISÃO =====
// Usa o mesmo app da Web do agendamento (AGENDAMENTO_URL, definido em booking.js),
// com tipo=supervisao. Horários vêm das células "Livre Supervisão" da planilha.
(() => {
  const form = document.getElementById("sup-form");
  if (!form) return;
  const $ = (sel) => form.querySelector(sel);
  const status = $(".slots-status");
  const daysEl = $(".days");
  const timesEl = $(".times");
  const valores = $(".sup-valores");
  const errorMsg = $(".form-error");
  const submitBtn = form.querySelector('button[type="submit"]');
  const done = document.querySelector(".sup-done");
  const URL_API = typeof AGENDAMENTO_URL === "string" ? AGENDAMENTO_URL : "";
  const ZAP = typeof WHATSAPP_NUMBER === "string" ? WHATSAPP_NUMBER : "5551995552044";
  const TZ = "America/Sao_Paulo";

  let horarioEscolhido = null;
  let carregadoEm = 0;
  let disponivel = false;

  const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
  const fmtChave = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const fmtLongo = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
  const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function semHorarios(msg) {
    disponivel = false;
    daysEl.hidden = timesEl.hidden = valores.hidden = true;
    status.innerHTML = msg + ' <a href="https://wa.me/' + ZAP + "?text=" +
      encodeURIComponent("Olá, Mateus! Tenho interesse em supervisão clínica.") +
      '" target="_blank" rel="noopener">Fale pelo WhatsApp</a>.';
    submitBtn.disabled = true;
  }

  async function carregar() {
    if (!URL_API) return semHorarios("O agendamento on-line da supervisão estará disponível em breve.");
    status.textContent = "Carregando horários disponíveis…";
    daysEl.hidden = timesEl.hidden = valores.hidden = true;
    try {
      const r = await fetch(URL_API + "?action=horarios&tipo=supervisao", { cache: "no-store" });
      const data = await r.json();
      if (!data.ok) throw new Error(data.erro);
      carregadoEm = Date.now();
      montarDias(data.horarios.map((h) => new Date(h)));
    } catch (err) {
      console.error(err);
      semHorarios("Não foi possível carregar os horários agora.");
    }
  }

  function montarDias(horarios) {
    horarioEscolhido = null;
    valores.hidden = true;
    if (!horarios.length) return semHorarios("No momento não há horários de supervisão disponíveis.");
    disponivel = true;
    submitBtn.disabled = false;
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
    daysEl.hidden = false;
    escolherDia(daysEl.firstElementChild, porDia.values().next().value);
  }

  function escolherDia(botao, lista) {
    daysEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", String(c === botao)));
    horarioEscolhido = null;
    valores.hidden = true;
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
        valores.hidden = false;
        errorMsg.hidden = true;
      });
      timesEl.appendChild(b);
    });
    timesEl.hidden = false;
    status.textContent = "Escolha o horário:";
  }

  const limparErro = (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false");
  };
  form.addEventListener("input", limparErro);
  form.addEventListener("change", limparErro);

  function validar() {
    const f = form.elements;
    const erros = [];
    const marcar = (campo, invalido) => {
      campo.setAttribute("aria-invalid", String(invalido));
      if (invalido) erros.push(campo);
    };
    marcar(f.nome, f.nome.value.trim().split(/\s+/).length < 2);
    marcar(f.perfil, !f.perfil.value);
    marcar(f.area, !f.area.value);
    marcar(f.modalidade, !f.modalidade.value);
    marcar(f.plano, !f.plano.value);
    marcar(f.telefone, f.telefone.value.replace(/\D/g, "").length < 10);
    marcar(f.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()));
    marcar(f.consentimento, !f.consentimento.checked);
    const partes = [];
    if (!horarioEscolhido) partes.push("Escolha um horário disponível.");
    if (erros.length) partes.push("Confira os campos destacados.");
    const msg = partes.join(" ");
    errorMsg.textContent = msg;
    errorMsg.hidden = !msg;
    if (msg) (!horarioEscolhido ? daysEl.querySelector("[aria-checked='true']") || daysEl : erros[0])?.focus();
    return !msg;
  }

  const MENSAGENS = {
    horario_ocupado: "Esse horário acabou de ser reservado. Atualizamos a lista: escolha outro, por favor.",
    email: "Confira o e-mail informado.",
    telefone: "Confira o telefone, com DDD.",
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!disponivel || !validar()) return;
    const f = form.elements;
    const dados = {
      tipo: "supervisao",
      nome: f.nome.value.trim(),
      perfil: f.perfil.value,
      registro: f.registro.value.trim(),
      area: f.area.value,
      modalidade: f.modalidade.value,
      plano: f.plano.value,
      telefone: f.telefone.value.trim(),
      email: f.email.value.trim(),
      tema: f.tema.value.trim(),
      consentimento: f.consentimento.checked,
      website: f.website.value,
      inicio: horarioEscolhido.toISOString(),
    };
    submitBtn.disabled = true;
    submitBtn.textContent = "Reservando…";
    try {
      const r = await fetch(URL_API, { method: "POST", body: JSON.stringify(dados) });
      const res = await r.json();
      if (res.ok) return mostrarConfirmacao(dados, res);
      errorMsg.textContent = MENSAGENS[res.erro] || "Não foi possível concluir a reserva. Tente novamente ou fale pelo WhatsApp.";
      errorMsg.hidden = false;
      if (res.erro === "horario_ocupado") carregar();
    } catch (err) {
      console.error(err);
      errorMsg.textContent = "Falha de conexão. Tente novamente ou fale pelo WhatsApp.";
      errorMsg.hidden = false;
    } finally {
      submitBtn.disabled = !disponivel;
      submitBtn.textContent = "Pré-reservar horário";
    }
  });

  function mostrarConfirmacao(d, res) {
    const quando = capitalizar(fmtLongo.format(horarioEscolhido));
    form.hidden = true;
    done.querySelector(".done-when").textContent = `${quando} · ${d.area} · ${d.modalidade}`;
    const valor = res.valor || (d.plano === "Encontro avulso" ? "R$ 250,00" : "R$ 190,00 por encontro");
    done.querySelector(".sup-pix-valor").textContent =
      valor + (d.plano === "Encontro avulso" ? "" : " (pacote a partir de 4 encontros)");
    const caixaChave = done.querySelector(".sup-pix-chave");
    if (res.pix) {
      caixaChave.querySelector("code").textContent = res.pix;
      caixaChave.hidden = false;
      done.querySelector(".sup-copiar").onclick = async (ev) => {
        try {
          await navigator.clipboard.writeText(res.pix);
          ev.target.textContent = "Copiado!";
        } catch (_) {
          ev.target.textContent = "Copie manualmente";
        }
      };
    }
    const msg = [
      "Olá, Mateus! Pré-reservei uma supervisão pelo site.",
      `Nome: ${d.nome}`,
      `Data: ${quando}`,
      `Área: ${d.area} · ${d.modalidade}`,
      `Plano: ${d.plano}`,
      "Segue o comprovante do Pix.",
    ].join("\n");
    done.querySelector(".sup-enviar").href = `https://wa.me/${ZAP}?text=${encodeURIComponent(msg)}`;
    done.hidden = false;
    done.focus();
  }

  // Carrega quando a aba é aberta (e recarrega se a lista estiver antiga)
  const aoAbrir = () => {
    if (location.hash === "#supervisao" && !form.hidden && Date.now() - carregadoEm > 3 * 60 * 1000) carregar();
  };
  window.addEventListener("hashchange", aoAbrir);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) aoAbrir(); });
  aoAbrir();
})();
