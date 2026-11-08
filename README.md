# Site — Mateus Flores, Fonoaudiólogo

Site estático (HTML, CSS e JavaScript, sem dependências), com as seções:
Apresentação, Áreas de atuação, Local de atendimento, Agendamento de consulta,
Cursos e supervisões, Eventos e notícias e Artigos.

## Como personalizar

| O quê | Onde |
|---|---|
| Número do WhatsApp | `js/booking.js` → `WHATSAPP_NUMBER` |
| Link da agenda on-line | `js/booking.js` → `AGENDAMENTO_URL` |
| CRFa, formação, textos | `index.html` (procure por `0-00000` e `Instituição`) |
| Endereço e mapa | `index.html`, seção `#local` (texto, link do Maps e `iframe`) |
| Telefone, e-mail, redes sociais | `index.html`, seção `#local` e rodapé |
| Foto de perfil | `assets/mateus-flores.jpg` (e a versão menor `mateus-flores-600.jpg`) |
| Fotos do consultório | Salve em `assets/` e troque cada `<div class="photo-slot">` da aba Atendimento por `<img src="assets/consultorio-1.jpg" alt="…">` |
| Cursos, eventos e artigos | `index.html`, seções `#cursos`, `#eventos`, `#artigos` (copie um bloco para adicionar outro) |
| Cores e fontes | `css/style.css`, variáveis em `:root` (azul-petróleo `#044352`, dourado `#B08D1E`, EB Garamond + Inter) |
| Logo | `assets/logo-mateus-flores.jpg` (original), `logo-simbolo.png`, `logo-completa.png`, `favicon.png` |

## Abas

Cada `<section data-tab>` do `index.html` é uma aba. O menu e os links
(`#sobre`, `#cursos`, …) trocam a aba visível, e o botão "voltar" do navegador
funciona normalmente. Para criar uma aba nova, adicione uma `<section id="nova" data-tab>`
e um link `<a href="#nova">` no menu.

## Agendamento

O paciente escolhe um horário livre da agenda Google e preenche os dados
(responsáveis aparecem só para menores de 18 anos). Para ativar, siga
[AGENDAMENTO-ONLINE.md](AGENDAMENTO-ONLINE.md). Enquanto não estiver ativado,
o formulário envia os dados pelo WhatsApp.

## Publicar no GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → branch `main`, pasta `/ (root)`.
