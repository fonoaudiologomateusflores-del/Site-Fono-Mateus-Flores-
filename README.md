# Site — Mateus Flores, Fonoaudiólogo

Site estático (HTML, CSS e JavaScript, sem dependências), com as seções:
Apresentação, Áreas de atuação, Local de atendimento, Agendamento de consulta,
Cursos e supervisões, Eventos e notícias e Artigos.

## Como personalizar

| O quê | Onde |
|---|---|
| Número do WhatsApp (agendamento) | `js/main.js` → `WHATSAPP_NUMBER` (ex.: `5551999998888`) |
| CRFa, formação, textos | `index.html` (procure por `0-00000` e `Instituição`) |
| Endereço e mapa | `index.html`, seção `#local` (texto, link do Maps e `iframe`) |
| Telefone, e-mail, redes sociais | `index.html`, seção `#local` e rodapé |
| Foto | Salve em `assets/` e troque o `src` da imagem no topo |
| Cursos, eventos e artigos | `index.html`, seções `#cursos`, `#eventos`, `#artigos` (copie um bloco para adicionar outro) |
| Cores | `css/style.css`, variáveis em `:root` |

## Abas

Cada `<section data-tab>` do `index.html` é uma aba. O menu e os links
(`#sobre`, `#cursos`, …) trocam a aba visível, e o botão "voltar" do navegador
funciona normalmente. Para criar uma aba nova, adicione uma `<section id="nova" data-tab>`
e um link `<a href="#nova">` no menu.

## Agendamento

O formulário monta uma mensagem com os dados do paciente e abre o WhatsApp
com o texto pronto — não é preciso servidor.

## Publicar no GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → branch `main`, pasta `/ (root)`.
