// ===== CONFIGURAÇÃO =====
// Número do WhatsApp com DDI + DDD, apenas dígitos. Ex.: 5551999998888
const WHATSAPP_NUMBER = "5551995552044";

// Menu mobile
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("menu");
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
  toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});
nav.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  })
);

// Borda do cabeçalho ao rolar
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Ano no rodapé
document.getElementById("year").textContent = new Date().getFullYear();

// Links de cursos pré-selecionam o interesse no formulário
const areaSelect = document.getElementById("area");
document.querySelectorAll("[data-interest]").forEach((link) =>
  link.addEventListener("click", () => {
    const value = link.dataset.interest;
    if (![...areaSelect.options].some((o) => o.value === value)) {
      areaSelect.add(new Option(value, value));
    }
    areaSelect.value = value;
  })
);

// Formulário de agendamento -> WhatsApp
const form = document.getElementById("booking");
const errorMsg = form.querySelector(".form-error");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const required = ["nome", "telefone"];
  let valid = true;
  required.forEach((name) => {
    const field = form.elements[name];
    const empty = !field.value.trim();
    field.setAttribute("aria-invalid", empty);
    if (empty) valid = false;
  });
  errorMsg.hidden = valid;
  if (!valid) return;

  const lines = [
    "Olá, Mateus! Gostaria de agendar uma consulta.",
    `Nome: ${data.nome}`,
    `Telefone: ${data.telefone}`,
    data.idade && `Idade do paciente: ${data.idade}`,
    `Área: ${data.area}`,
    `Modalidade: ${data.modalidade}`,
    `Melhor período: ${data.periodo}`,
    data.mensagem && `Motivo: ${data.mensagem}`,
  ].filter(Boolean);

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
  window.open(url, "_blank", "noopener");
});

// Animação suave ao aparecer
let io = null;
if ("IntersectionObserver" in window) {
  io = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".card, .course, .event, .article, .section-head").forEach((el) => el.classList.add("reveal"));
}

// ===== ABAS =====
// Cada <section data-tab> é uma aba; o endereço (#id) define qual aparece.
const tabs = [...document.querySelectorAll("[data-tab]")];
const navLinks = [...nav.querySelectorAll("a")];
function showTab(scroll = true) {
  const id = location.hash.slice(1);
  const current = tabs.find((t) => t.id === id) || tabs[0];
  tabs.forEach((t) => (t.hidden = t !== current));
  navLinks.forEach((a) => {
    if (a.getAttribute("href") === "#" + current.id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = (current.id === "inicio" ? "" : (current.querySelector(".eyebrow")?.textContent + " | ")) + "Mateus Flores | Fonoaudiólogo";
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
  current.querySelectorAll(".reveal").forEach((el) => el.classList.remove("visible"));
  requestAnimationFrame(() => current.querySelectorAll(".reveal").forEach((el) => io && io.observe(el)));
}
window.addEventListener("hashchange", () => showTab());
showTab(false);
