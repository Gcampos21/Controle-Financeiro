# Manutenção do Controle Financeiro

Guia para quem cuida do app. O README.md explica como tudo foi montado; este arquivo é o dia a dia.

---

## 1. Onde fica cada coisa

| O quê | Onde |
|---|---|
| App (para usar) | https://controle-financeiro-483ff.web.app |
| Console do Firebase | https://console.firebase.google.com/project/controle-financeiro-483ff |
| Conta Google dona do projeto | a mesma usada para entrar no Console |
| Código do app | esta pasta (`Controle_Financeiro`) e o repositório no GitHub |
| ID do projeto | `controle-financeiro-483ff` |
| Código da casa | aparece em **Ajustes → Sua casa** no app (2 membros, já está cheia) |
| Região do banco | southamerica-east1 (São Paulo) |
| Plano | Spark (gratuito, sem cartão) |

> **No PowerShell, use sempre `firebase.cmd`** no lugar de `firebase`.
> O PowerShell deste computador bloqueia o `firebase.ps1` ("execução de scripts desabilitada").
> No Prompt de Comando (cmd), `firebase` funciona normal.

---

## 2. Rotina

### Todo mês (cada pessoa, no próprio celular)
- **Ajustes → Exportar cópia** → salvar no Google Drive / iCloud Drive.
- O app avisa quando passa de 30 dias sem cópia.
- A cópia só sai com internet (lê tudo do servidor). Se der erro, conecte e tente de novo.

### A cada 2–3 meses (você)
- Console → **Firestore → Uso**: confira que leituras e gravações estão longe do limite
  (50 mil leituras e 20 mil gravações por dia; a casa usa uma fração mínima).
- Confira se o projeto continua no **Plano Spark** (canto inferior esquerdo do Console).
- Guarde uma cópia das cópias: os arquivos `.json` de cada pessoa num lugar só.

---

## 3. Mudar o app (código)

### 3.1 Antes de mexer
- O código está no OneDrive, que guarda versões antigas (botão direito no arquivo → **Histórico de versões**).
- Melhor ainda: use **git** (`git init` na pasta) para poder desfazer qualquer mudança.

### 3.2 Testar no computador
1. No VS Code, clique em **Go Live** (barra de baixo) ou botão direito em `public/index.html` → **Open with Live Server**.
2. Abre em `http://127.0.0.1:5500/public/` (ou parecido).

⚠ **O teste local usa o banco de verdade.** Tudo que você lançar ali aparece no app de vocês.
Teste com valores pequenos e apague depois (lixeira → apagar de vez).

### 3.3 Publicar
1. Em `public/sw.js`, **aumente a versão**: `const VERSAO = "cf-v1";` → `"cf-v2"` → `"cf-v3"`…
   Sem isso, os celulares podem continuar com a versão antiga guardada.
2. No terminal, **na pasta do projeto** (a que tem o `firebase.json`):

```bash
firebase.cmd deploy
```

   Variações úteis:
   - Só o app (sem mexer nas regras): `firebase.cmd deploy --only hosting`
   - Só as regras de segurança: `firebase.cmd deploy --only firestore:rules`

3. Deve terminar com **"Deploy complete!"**.
4. Nos celulares: **feche o app e abra de novo** (às vezes precisa de 2 vezes).

### 3.4 Deu problema depois de publicar? Voltar a versão anterior
Console → **Hosting** → **Histórico de versões** (Release history) → na versão anterior, **⋮ → Reverter**.
Isso volta o app (não mexe nos dados nem nas regras).

---

## 4. Problemas comuns

| Problema | Solução |
|---|---|
| `firebase` não é reconhecido | Use `firebase.cmd`. Se nem assim: `npm install -g firebase-tools` no **Prompt de Comando** e reabra o terminal. |
| "must be run from a Firebase project directory" | Você está na pasta errada. Vá até a pasta que tem o `firebase.json`. **Não** rode `firebase init` (sobrescreve a configuração). |
| Erro de login / "credentials expired" no deploy | `firebase.cmd login --reauth` |
| App mostra "Sem permissão…" | As regras não estão publicadas ou têm erro: `firebase.cmd deploy --only firestore:rules` |
| Celular não pega a versão nova | Confira se aumentou a versão no `sw.js`. Feche e abra o app 2 vezes. |
| Alguém esqueceu a senha | Na tela de entrar: digite o e-mail → **Esqueci a senha**. O e-mail pode cair no spam. |
| Trocou / perdeu o celular | Instale de novo e entre com o mesmo e-mail e senha. Os dados estão na nuvem. |
| Sumiu algo | Primeiro **Ajustes → Lixeira**. Se não estiver lá: **Restaurar cópia** com o último `.json`. |

---

## 5. Restaurar uma cópia

**Ajustes → Restaurar cópia** → escolha o `.json`.

- Só **cria o que falta**. Nada que já existe é alterado ou apagado.
- Pode restaurar a mesma cópia várias vezes: não duplica.
- Na parte compartilhada, cada pessoa só restaura o que **ela** lançou.
  Para trazer de volta parcelamentos/investimentos da outra pessoa, ela restaura a cópia dela.
- Itens que foram "apagados de vez" depois da cópia **voltam** (é intencional: melhor sobrar do que faltar).
- Também aceita o backup da versão antiga (a que salvava só no navegador).

---

## 6. Mexer direto no banco (Console)

Console → **Firestore → Dados**. Use só em último caso: **o Console não tem lixeira**.

Antes de qualquer alteração ali: **exporte uma cópia nos dois celulares**.

### Alguém entrou numa casa errada (criou "casa nova" por engano)
1. `usuarios` → abra o documento da pessoa (confira o campo `nome`) → anote o `casaId`.
2. **⋮ → Excluir documento** (marcando apagar as subcoleções).
3. `casas` → abra a casa extra (o `casaId` anotado, **nunca** a casa de vocês, que tem os 2 membros) → **⋮ → Excluir documento**.
4. No celular da pessoa: fechar e abrir o app → **Tenho um código** → o código da casa de vocês.

### Trocar a segunda pessoa da casa
A casa aceita no máximo 2 membros e o app não tem botão para tirar alguém.
1. `casas` → a casa de vocês → campo `membros`: remova o uid da pessoa que sai (e o nome em `nomes`).
2. Se os cadastros estiverem bloqueados (seção 7), libere temporariamente.
3. A pessoa nova cria conta e entra com o código.
Os parcelamentos e investimentos da pessoa antiga continuam no banco (com o `autor` dela).

### Nunca apague
Os documentos `usuarios/{uid}` de vocês dois nem a casa de vocês em `casas`.

---

## 7. Custos e segurança

- **Não clique em "Fazer upgrade"** (plano Blaze). O Spark basta e nunca cobra.
- **Não ative o Storage** (aparece nos atalhos). O app não usa e ele pede o plano pago.
- Se um dia ativar o Blaze: crie um **alerta de orçamento** no Google Cloud antes de tudo.
- Os valores do `public/js/config.js` **não são senhas** e podem ficar no código. Quem protege os dados é o `firestore.rules`.
- Ative a **verificação em duas etapas** na conta Google dona do projeto.
- **O repositório é público**: nunca coloque nele e-mails, senhas, códigos da casa, uids ou cópias `.json`.
- **Novos cadastros bloqueados** (o endereço do app é público, então qualquer um poderia criar conta e gastar a cota):
  Console → **Authentication → Configurações → Ações do usuário** → **Ativar criação (inscrição)** desmarcado.
  Se um dia precisar criar conta nova, marque, crie a conta e desmarque de novo.
- **Chave da API restrita por site**: Google Cloud → APIs e serviços → Credenciais → Browser key →
  Sites: `controle-financeiro-483ff.web.app/*`, `controle-financeiro-483ff.firebaseapp.com/*`, `127.0.0.1:5500/*`, `localhost:5500/*`.

---

## 8. Atualizar ferramentas (raramente)

- Firebase CLI: no **Prompt de Comando**, `npm install -g firebase-tools`.
- Biblioteca do Firebase no app: versão `12.19.0`, nos 3 endereços `gstatic.com` de `public/js/firebase.js`.
  Só troque se tiver motivo; depois teste tudo e aumente a versão do `sw.js`.

---

## 9. Lembrete rápido para mudanças

1. Exportar cópia (por segurança)
2. Mudar o código
3. Testar com Go Live (lembrando que usa o banco real)
4. Aumentar `VERSAO` em `public/sw.js`
5. `firebase.cmd deploy`
6. Fechar e abrir o app nos celulares
