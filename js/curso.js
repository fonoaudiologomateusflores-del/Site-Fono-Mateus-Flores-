// ===== INSCRIÇÃO NO CURSO =====
// Usa o mesmo app da Web do agendamento (AGENDAMENTO_URL, em booking.js).
// Links de pagamento, chave Pix, código de ex-aluno e valores de ex-aluno
// ficam no script do Google e só chegam aqui depois da inscrição/código.
(() => {
  const form = document.getElementById("curso-form");
  if (!form) return;
  const $ = (sel) => form.querySelector(sel);
  const API = typeof AGENDAMENTO_URL === "string" ? AGENDAMENTO_URL : "";
  const ZAP = typeof WHATSAPP_NUMBER === "string" ? WHATSAPP_NUMBER : "5551995552044";
  const EMAIL = "fonoaudiologo.mateusflores@gmail.com";
  const status = $(".curso-status");
  const errorMsg = $(".form-error");
  const submitBtn = form.querySelector('button[type="submit"]');
  const done = document.querySelector(".curso-done");
  const cupomAbrir = $(".cupom-abrir");
  const cupomCampo = $(".cupom-campo");
  const cupomInput = $("#cur-cupom");
  const cupomMsg = $(".cupom-msg");
  const VAL_GERAL = { pix: "R$ 746,00", cartao: "até 10x de R$ 93,50 (total R$ 935,00)" };

  let aberto = false;
  let cupomAplicado = "";
  let verificadoEm = 0;

  function fechar(msg) {
    aberto = false;
    status.innerHTML = msg;
    status.hidden = false;
    submitBtn.disabled = true;
  }

  async function verificar() {
    if (!API) return fechar("As inscrições on-line abrem em breve.");
    try {
      const r = await fetch(API + "?action=curso", { cache: "no-store" });
      const d = await r.json();
      verificadoEm = Date.now();
      if (!d.curso) return fechar('As inscrições on-line abrem em breve. <a href="https://wa.me/' + ZAP + '" target="_blank" rel="noopener">Fale pelo WhatsApp</a>.');
      if (!d.ok) throw new Error(d.erro);
      if (!d.aberto) {
        return fechar(d.motivo === "esgotado"
          ? "As vagas desta turma estão esgotadas. Para entrar na lista de espera, fale pelo WhatsApp."
          : "As inscrições desta turma estão encerradas.");
      }
      aberto = true;
      submitBtn.disabled = false;
      status.innerHTML = d.restantes <= 10 ? `Restam <strong>${d.restantes}</strong> vagas.` : "";
      status.hidden = !status.innerHTML;
    } catch (err) {
      console.error(err);
      fechar('Não foi possível verificar as vagas agora. Tente novamente ou <a href="https://wa.me/' + ZAP + '" target="_blank" rel="noopener">fale pelo WhatsApp</a>.');
    }
  }

  // ----- Código de ex-aluno -----
  cupomAbrir.addEventListener("click", () => {
    const abrir = cupomCampo.hidden;
    cupomCampo.hidden = !abrir;
    cupomAbrir.setAttribute("aria-expanded", String(abrir));
    if (abrir) cupomInput.focus();
  });

  function mostrarValores(v) {
    form.querySelector(".val-pix").textContent = v.pix;
    form.querySelector(".val-cartao").textContent = v.cartao;
  }

  async function aplicarCupom() {
    const codigo = cupomInput.value.trim();
    cupomMsg.hidden = false;
    cupomMsg.className = "cupom-msg";
    if (!codigo) { cupomMsg.textContent = "Digite o código."; return; }
    cupomMsg.textContent = "Conferindo…";
    try {
      const r = await fetch(API + "?action=cupom&codigo=" + encodeURIComponent(codigo), { cache: "no-store" });
      const d = await r.json();
      if (d.ok && d.valido) {
        cupomAplicado = codigo;
        mostrarValores({ pix: d.valores.pix, cartao: `até 10x de ${d.valores.parcela} (total ${d.valores.cartao})` });
        cupomMsg.textContent = "Código aplicado: condição especial para ex-alunos da Mentoria.";
        cupomMsg.classList.add("ok");
        cupomInput.readOnly = true;
        errorMsg.hidden = true;
      } else {
        cupomAplicado = "";
        mostrarValores(VAL_GERAL);
        cupomMsg.textContent = "Código não reconhecido. Confira com o Mateus.";
        cupomMsg.classList.add("erro");
      }
    } catch (err) {
      console.error(err);
      cupomMsg.textContent = "Não foi possível conferir o código agora. Tente novamente.";
      cupomMsg.classList.add("erro");
    }
  }
  $(".cupom-aplicar").addEventListener("click", aplicarCupom);
  cupomInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); aplicarCupom(); } });

  // ----- Validação e envio -----
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
    marcar(f.telefone, f.telefone.value.replace(/\D/g, "").length < 10);
    marcar(f.email, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()));
    const pg = form.querySelector(".opcoes-pagamento");
    const semPagamento = !f.pagamento.value;
    pg.classList.toggle("invalido", semPagamento);
    if (semPagamento) erros.push(pg.querySelector("input"));
    marcar(f.consentimento, !f.consentimento.checked);
    const pendente = cupomInput.value.trim() && !cupomAplicado;
    const partes = [];
    if (erros.length) partes.push("Confira os campos destacados.");
    if (pendente) partes.push('Clique em "Aplicar" para usar o código de ex-aluno, ou apague-o.');
    errorMsg.textContent = partes.join(" ");
    errorMsg.hidden = !partes.length;
    if (partes.length) (erros[0] || cupomInput).focus();
    return !partes.length;
  }

  const MENSAGENS = {
    esgotado: "As vagas desta turma acabaram de se esgotar.",
    prazo: "As inscrições desta turma estão encerradas.",
    cupom: "Código de ex-aluno não reconhecido.",
    email: "Confira o e-mail informado.",
    telefone: "Confira o telefone, com DDD.",
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!aberto || !validar()) return;
    const f = form.elements;
    const dados = {
      tipo: "curso",
      nome: f.nome.value.trim(),
      perfil: f.perfil.value,
      registro: f.registro.value.trim(),
      cidade: f.cidade.value.trim(),
      telefone: f.telefone.value.trim(),
      email: f.email.value.trim(),
      pagamento: f.pagamento.value,
      cupom: cupomAplicado,
      consentimento: f.consentimento.checked,
      website: f.website.value,
    };
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando…";
    try {
      const r = await fetch(API, { method: "POST", body: JSON.stringify(dados) });
      const res = await r.json();
      if (res.ok) return concluir(dados, res);
      errorMsg.textContent = MENSAGENS[res.erro] || "Não foi possível concluir a inscrição. Tente novamente ou fale pelo WhatsApp.";
      errorMsg.hidden = false;
      if (res.erro === "esgotado" || res.erro === "prazo") verificar();
    } catch (err) {
      console.error(err);
      errorMsg.textContent = "Falha de conexão. Tente novamente ou fale pelo WhatsApp.";
      errorMsg.hidden = false;
    } finally {
      submitBtn.disabled = !aberto;
      submitBtn.textContent = "Concluir inscrição";
    }
  });

  function concluir(d, res) {
    form.hidden = true;
    done.querySelector(".done-when").textContent =
      "Avaliação formal da linguagem oral · início em 18 de janeiro de 2027" + (res.exAluno ? " · condição de ex-aluno" : "");
    const valorCurto = String(res.valor).replace(/ no (Pix|cartão)$/, "");
    done.querySelectorAll(".curso-valor").forEach((el) => (el.textContent = valorCurto));
    if (res.pagamento === "Pix") {
      const box = done.querySelector(".curso-pagar-pix");
      box.querySelector("code").textContent = res.pix;
      box.querySelector(".sup-copiar").onclick = async (ev) => {
        try { await navigator.clipboard.writeText(res.pix); ev.target.textContent = "Copiado!"; }
        catch (_) { ev.target.textContent = "Copie manualmente"; }
      };
      box.hidden = false;
    } else {
      const box = done.querySelector(".curso-pagar-cartao");
      let link = String(res.link || "").trim().replace(/\s+/g, "");
      if (link && !/^https?:\/\//i.test(link)) link = "https://" + link.replace(/^\/+/, "");
      box.querySelector(".curso-link").href = link;
      box.hidden = false;
    }
    const texto = [
      "Olá, Mateus! Fiz minha inscrição no curso Avaliação formal da linguagem oral.",
      `Nome: ${d.nome}`,
      `Pagamento: ${res.valor}`,
      "Segue o comprovante.",
    ].join("\n");
    done.querySelector(".curso-zap").href = `https://wa.me/${ZAP}?text=${encodeURIComponent(texto)}`;
    done.querySelector(".curso-mail").href =
      `mailto:${EMAIL}?subject=${encodeURIComponent("Comprovante – curso Avaliação formal da linguagem oral – " + d.nome)}&body=${encodeURIComponent(texto + "\n\n(anexe o comprovante)")}`;
    done.hidden = false;
    done.focus();
  }

  const aoAbrir = () => {
    if (location.hash === "#inscricao" && !form.hidden && Date.now() - verificadoEm > 60 * 1000) verificar();
  };
  window.addEventListener("hashchange", aoAbrir);
  aoAbrir();
})();
