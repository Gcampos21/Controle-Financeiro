/* Início do app: login, primeiro acesso e navegação entre as abas */

import { $, h, toast } from "./util.js";
import {
  configurado, auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "./firebase.js";
import { st, quandoMudar, atualizarTela, iniciar, pararTudo, criarCasa, entrarNaCasa } from "./dados.js";
import { telaMes, telaCartao, telaPlanejar, telaInvestir, telaAjustes, fecharOpcoes, fecharSheet } from "./telas.js";

const TELAS = { mes: telaMes, cartao: telaCartao, planejar: telaPlanejar, investir: telaInvestir, ajustes: telaAjustes };
let aba = "mes";
let logado = false;
let telaFixa = null;   // login e boas-vindas só são redesenhadas quando mudam, para não apagar o que foi digitado

function mostrar(chave, construir, comMenu) {
  $("tabbar").hidden = !comMenu;
  if (chave && chave === telaFixa) return;
  telaFixa = chave;
  $("tela").replaceChildren(...construir().flat(Infinity).filter(Boolean));
}

function render() {
  if (!configurado) return mostrar("config", telaConfigurar, false);
  if (!logado) return mostrar("login", telaLogin, false);
  if (st.erro && st.perfil === undefined) return mostrar(null, () => [aviso(st.erro)], false);
  if (st.perfil === undefined) return mostrar("carregando", () => [aviso("Carregando seus dados…")], false);
  if (st.perfil === null) return mostrar("boasvindas", telaBoasVindas, false);

  // Não redesenha enquanto a pessoa digita num campo da tela
  const ativo = document.activeElement;
  if (ativo && $("tela").contains(ativo) && ativo.matches("input")) { pendente = true; return; }
  mostrar(null, () => [st.erro ? aviso(st.erro) : null, TELAS[aba]()], true);
  document.querySelectorAll("#tabbar button").forEach(b =>
    b.setAttribute("aria-current", b.dataset.aba === aba ? "page" : "false"));
}
let pendente = false;
$("tela").addEventListener("focusout", () => { if (pendente) { pendente = false; setTimeout(render, 0); } });

quandoMudar(render);

const aviso = texto => h("div", { class: "empty" }, h("span", null, texto));

/* ---------- Configuração pendente ---------- */

function telaConfigurar() {
  return [
    h("div", { class: "top" }, h("div", { class: "brand" }, "Controle Financeiro")),
    h("div", { class: "card stack" },
      h("b", null, "Falta ligar o app ao Firebase"),
      h("p", { class: "hint" }, "Abra o arquivo js/config.js e cole a configuração do seu projeto Firebase. O passo a passo está no README.md."))
  ];
}

/* ---------- Login ---------- */

const ERROS = {
  "auth/invalid-credential": "E-mail ou senha errados.",
  "auth/wrong-password": "E-mail ou senha errados.",
  "auth/user-not-found": "Não existe conta com esse e-mail. Toque em Criar conta.",
  "auth/email-already-in-use": "Já existe conta com esse e-mail. Toque em Já tenho conta.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-email": "Esse e-mail não parece certo.",
  "auth/missing-password": "Digite a senha.",
  "auth/network-request-failed": "Sem internet. Para entrar a primeira vez, precisa estar conectado.",
  "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
  "auth/admin-restricted-operation": "Novos cadastros estão fechados. Peça a quem cuida do app para liberar.",
  "auth/operation-not-allowed": "Novos cadastros estão fechados. Peça a quem cuida do app para liberar."
};

function telaLogin() {
  let criando = false;
  const email = h("input", { id: "l-email", type: "email", autocomplete: "email", inputMode: "email", placeholder: "seu@email.com" });
  const senha = h("input", { id: "l-senha", type: "password", autocomplete: "current-password", placeholder: "Mínimo de 6 caracteres" });
  const err = h("div", { class: "err", role: "alert" });
  const botao = h("button", { class: "save", type: "submit" }, "Entrar");
  const troca = h("button", { type: "button", class: "link" }, "Não tenho conta. Criar conta");
  const esqueci = h("button", { type: "button", class: "link" }, "Esqueci a senha");
  const titulo = h("b", { class: "big" }, "Entrar");

  troca.onclick = () => {
    criando = !criando;
    titulo.textContent = criando ? "Criar conta" : "Entrar";
    botao.textContent = criando ? "Criar conta" : "Entrar";
    troca.textContent = criando ? "Já tenho conta. Entrar" : "Não tenho conta. Criar conta";
    senha.autocomplete = criando ? "new-password" : "current-password";
    esqueci.hidden = criando;
    err.textContent = "";
  };
  esqueci.onclick = async () => {
    if (!email.value.trim()) { err.textContent = "Digite seu e-mail primeiro."; email.focus(); return; }
    try { await sendPasswordResetEmail(auth, email.value.trim()); toast("Enviamos um e-mail para trocar a senha"); }
    catch (e) { err.textContent = ERROS[e.code] || "Não deu para enviar o e-mail."; }
  };

  const form = h("form", { class: "card stack login" },
    titulo,
    h("label", { class: "field" }, h("span", null, "E-mail"), email),
    h("label", { class: "field" }, h("span", null, "Senha"), senha),
    err, botao, h("div", { class: "addrow spread" }, troca, esqueci));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    err.textContent = "";
    botao.disabled = true;
    try {
      const fn = criando ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
      await fn(auth, email.value.trim(), senha.value);
    } catch (e2) {
      err.textContent = ERROS[e2.code] || "Não deu para entrar. Tente de novo.";
    } finally { botao.disabled = false; }
  });

  return [
    h("div", { class: "top" }, h("div", { class: "brand" }, "Controle Financeiro")),
    h("p", { class: "hint" }, "Cada pessoa da casa tem sua própria conta. Os gastos de cada um ficam separados; compras parceladas e investimentos vocês dois veem."),
    form
  ];
}

/* ---------- Primeiro acesso ---------- */

function telaBoasVindas() {
  let modo = "criar";
  const nome = h("input", { id: "b-nome", placeholder: "Ex.: Murillo", maxLength: 30, autocomplete: "given-name" });
  const codigo = h("input", { id: "b-codigo", placeholder: "Ex.: K7M2-Q9XP", maxLength: 9, autocapitalize: "characters", autocomplete: "off" });
  const linhaCodigo = h("label", { class: "field", hidden: true }, h("span", null, "Código da casa (a outra pessoa encontra em Ajustes)"), codigo);
  const err = h("div", { class: "err", role: "alert" });
  const botao = h("button", { class: "save", type: "submit" }, "Criar minha casa");
  const opcoes = h("div", { class: "seg", role: "group" },
    h("button", { type: "button", "aria-pressed": "true", onclick: () => escolhe("criar") }, "Criar casa nova"),
    h("button", { type: "button", "aria-pressed": "false", onclick: () => escolhe("entrar") }, "Tenho um código"));
  function escolhe(m) {
    modo = m;
    opcoes.children[0].setAttribute("aria-pressed", String(m === "criar"));
    opcoes.children[1].setAttribute("aria-pressed", String(m === "entrar"));
    linhaCodigo.hidden = m === "criar";
    botao.textContent = m === "criar" ? "Criar minha casa" : "Entrar na casa";
    err.textContent = "";
  }

  const form = h("form", { class: "card stack" },
    h("b", { class: "big" }, "Bem-vindo"),
    h("label", { class: "field" }, h("span", null, "Como quer ser chamado"), nome),
    h("p", { class: "hint" }, "A primeira pessoa cria a casa. A segunda usa o código que aparece em Ajustes no celular da primeira."),
    opcoes, linhaCodigo, err, botao);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const n = nome.value.trim();
    if (!n) { err.textContent = "Digite seu nome."; nome.focus(); return; }
    botao.disabled = true; err.textContent = "";
    try {
      if (modo === "criar") await criarCasa(n);
      else await entrarNaCasa(n, codigo.value);
      toast("Tudo pronto");
    } catch (e2) {
      console.error(e2);
      err.textContent =
        e2.code === "codigo" ? "O código tem 8 letras e números, como K7M2-Q9XP." :
        e2.code === "timeout" ? "Sem resposta do servidor. Confira a internet e tente de novo." :
        modo === "entrar" ? "Código não encontrado, ou a casa já tem duas pessoas." :
        "Não deu para criar a casa. Confira a internet e tente de novo.";
    } finally { botao.disabled = false; }
  });

  return [h("div", { class: "top" }, h("div", { class: "brand" }, "Controle Financeiro")), form];
}

/* ---------- Sessão ---------- */

export async function sair() {
  pararTudo();
  await signOut(auth);
}

if (configurado) {
  onAuthStateChanged(auth, user => {
    pararTudo();
    logado = !!user;
    telaFixa = null;
    aba = "mes";
    fecharSheet();
    if (user) iniciar(user.uid);
    render();
  });
}

/* ---------- Navegação ---------- */

document.querySelectorAll("#tabbar button").forEach(b => {
  b.onclick = () => { aba = b.dataset.aba; fecharOpcoes(); telaFixa = null; render(); window.scrollTo(0, 0); };
});
$("sheet").onclick = e => { if (e.target === $("sheet")) fecharSheet(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharSheet(); });

render();

/* App instalável e com tela funcionando sem internet */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
