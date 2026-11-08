# Controle Financeiro

App de finanças da casa para duas pessoas, feito para usar no celular (Android e iPhone).
Cada um controla os próprios gastos e entradas; compras parceladas no cartão e investimentos ficam visíveis para os dois.

- **PWA**: instala na tela inicial e funciona sem internet.
- **HTML, CSS e JavaScript puros** (ES modules), sem framework e sem etapa de build.
- **Firebase** no plano gratuito (Spark): Authentication, Cloud Firestore e Hosting.

> Projeto pessoal e caseiro. Para colocar no ar a sua própria cópia, veja [Criar a sua cópia](#-criar-a-sua-c%C3%B3pia).

---

## Funcionalidades

| Aba | O que faz |
|---|---|
| **Mês** | Saldo do mês (entrou − saiu − investiu), gastos fixos com botão **Pagar**, gráfico por categoria e lista por dia. |
| **Cartão** | Compra parcelada com as parcelas caindo no vencimento certo (calculado pelo fechamento e vencimento do cartão), próximas 6 faturas e parcelamentos da casa. |
| **Planejar** | Gastos fixos agendados (sem fim ou com número de parcelas) e compras futuras (o botão **Comprei** vira lançamento). |
| **Investir** | Total investido da casa, por pessoa e por tipo. Aplicar, resgatar ou informar o que já tinha. |
| **Ajustes** | Código da casa, cópia de segurança, lixeira, categorias e detalhes (ex.: Contas → Luz, Água, Condomínio) e sair da conta. |

### Privacidade entre as duas pessoas

| Separado (só o dono vê) | Compartilhado (os dois veem, com o autor) |
|---|---|
| Gastos e entradas | Compras parceladas no cartão |
| Gastos fixos | Investimentos |
| Compras futuras | Tipos de investimento |
| Categorias | |

Na parte compartilhada, **só o autor** edita ou apaga. As duas pessoas ficam ligadas por uma **casa** com código de 8 caracteres (ex.: `K7M2-Q9XP`), com no máximo 2 membros.

---

##  Proteção dos dados

A prioridade do projeto é **não perder dados**.

| Camada | Como funciona |
|---|---|
| **Nuvem** | Tudo fica no Cloud Firestore. Trocar ou perder o celular não apaga nada. |
| **Cópia no aparelho** | Cache local persistente do Firestore: funciona offline e sincroniza quando a conexão volta. |
| **Lixeira** | Nada é apagado de primeira (`excluido: true`). Só some com "Apagar de vez". |
| **Cópia em arquivo** | Exporta um `.json` lendo direto do servidor (sem internet dá erro, para não sair incompleta). Aviso após 30 dias sem cópia. |
| **Restauração segura** | Só **cria** o que falta, nunca sobrescreve. Restaurar a mesma cópia duas vezes não duplica. Aceita também o backup da versão antiga (localStorage). |
| **Regras de segurança** | `firestore.rules`: cada um só lê os próprios dados; na casa, cada um só altera o que lançou. |
| **Valores em centavos** | Inteiros, sem erro de arredondamento. |

---

## Estrutura

```
├── firebase.json            configuração do Hosting e do Firestore
├── .firebaserc              projeto Firebase padrão
├── firestore.rules          regras de segurança do banco
├── firestore.indexes.json
├── MANUTENCAO.md            guia do dia a dia (publicar, problemas comuns)
└── public/                  o app (é só isso que vai para a internet)
    ├── index.html
    ├── manifest.webmanifest nome e ícone ao instalar
    ├── sw.js                service worker: abre sem internet
    ├── icons/
    ├── css/style.css
    └── js/
        ├── config.js        configuração do projeto Firebase
        ├── firebase.js      inicializa o SDK (12.19.0, via gstatic)
        ├── util.js          datas, valores em R$, helpers de DOM
        ├── dados.js         tudo que lê e grava no banco
        ├── formularios.js   lançamento, gasto fixo e compra futura
        ├── telas.js         as 5 abas
        └── app.js           login, primeiro acesso e navegação
```

### Banco (Cloud Firestore)

```
usuarios/{uid}                     nome, casaId, cartao {fecha, vence}, ultimoBackup
usuarios/{uid}/categorias          grupo "s"|"e", nome, subs[], ordem
usuarios/{uid}/lancamentos         tipo "s"|"e", valor, categoriaId, categoriaNome, sub, desc,
                                   data, mes, pag, fixoId?, fixoMes?
usuarios/{uid}/fixos               nome, valor, categoriaId, dia, inicio "AAAA-MM", parcelas (0 = sem fim)
usuarios/{uid}/futuras             nome, valor, categoriaId, quando, obs

casas/{codigo}                     membros[2], nomes {uid: nome}
casas/{codigo}/parcelamentos       autor, desc, valorTotal, n, dataCompra, parcelas[{n, data, mes, valor}]
casas/{codigo}/investimentos       autor, tipo "i" aplicar | "r" resgatar | "a" já tinha,
                                   valor, tipoInvId, tipoInvNome, data, mes
casas/{codigo}/tiposInvestimento   nome, ordem
```

Todo documento tem `excluido`, `criadoEm`, `criadoLocal` e `atualizadoEm`.

---

##  Criar a sua cópia

Precisa de uma conta Google e do [Node.js](https://nodejs.org) (versão LTS). O plano gratuito do Firebase basta e não pede cartão.

### 1. Projeto no Firebase
1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto (o Google Analytics pode ficar desligado).
2. **Segurança → Authentication → Vamos começar →** ative **E-mail/senha**.
3. **Bancos de dados → Firestore Database → Criar banco de dados**: edição Standard, local `southamerica-east1` (São Paulo; não pode ser mudado depois), modo **produção**.
4. **Visão geral → Adicionar app → Web (`</>`)**, sem marcar Hosting. Copie o bloco `firebaseConfig`.

### 2. Configurar o código
1. Cole os valores em `public/js/config.js`.
2. Em `.firebaserc`, troque o ID pelo do seu projeto.

### 3. Publicar
```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

No Windows, se o PowerShell disser que a execução de scripts está desabilitada, use `firebase.cmd` no lugar de `firebase`.

O `deploy` publica o app **e** as regras de segurança. No fim aparece o endereço, algo como `https://seu-projeto.web.app`.

### 4. Testar no computador (opcional)
Com a extensão **Live Server** do VS Code: botão direito em `public/index.html` → **Open with Live Server**.
O app precisa rodar por `http://` (abrir o arquivo com dois cliques não funciona).
⚠ O teste local usa o **banco de verdade** do projeto.

---

##  Instalar e primeiro acesso

- **Android (Chrome):** menu ⋮ → **Instalar app**.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**. Use sempre pelo ícone (o app da tela inicial não compartilha o login com o Safari).

1. **Pessoa 1:** Criar conta → nome → **Criar casa nova**. O código aparece em **Ajustes**.
2. **Pessoa 2:** Criar conta → nome → **Tenho um código** → digita o código.
3. Cada um preenche o fechamento e o vencimento do próprio cartão na aba **Cartão**.

**Vindo da versão antiga** (a que salvava só no navegador): exporte o backup nela e use **Ajustes → Restaurar cópia** na nova.

---

## Atualizar o app

1. Faça a mudança no código.
2. Em `public/sw.js`, aumente a versão (`cf-v1` → `cf-v2`). Sem isso, os celulares podem manter a versão antiga.
3. `firebase deploy` (ou `firebase deploy --only hosting` para não mexer nas regras).
4. Nos celulares, feche e abra o app.

Mais detalhes, problemas comuns e como reverter uma versão: [MANUTENCAO.md](MANUTENCAO.md).

---

##  Limites do plano gratuito

| Recurso | Limite (Spark) | Uso típico de uma casa |
|---|---|---|
| Armazenamento do Firestore | 1 GB | ~1 KB por lançamento, cabe cerca de 1 milhão |
| Leituras | 50 mil/dia | ~7 mil/dia no 1º ano, ~19 mil/dia no 10º |
| Gravações | 20 mil/dia | dezenas por dia |
| Hosting | 10 GB armazenados, 360 MB/dia | o app tem ~100 KB e fica em cache |

Se um limite diário estourar, o serviço pausa até o dia seguinte: **não há cobrança** e nenhum dado é apagado.
Não é preciso o plano pago (Blaze). Se ativar, crie um alerta de orçamento no Google Cloud.

---

##  Sobre o `config.js`

Os valores de `firebaseConfig` (inclusive a `apiKey`) **não são senhas**: identificam o projeto e precisam estar no app para o navegador falar com o Firebase. Quem protege os dados são as regras de `firestore.rules` e o login.
Como proteção extra, restrinja a chave no Google Cloud (APIs e serviços → Credenciais → chave do navegador → restrição por site, liberando só os domínios do app).

**Nunca** coloque no repositório as cópias exportadas (`controle-financeiro-*.json`): elas têm os dados financeiros. O `.gitignore` já bloqueia esses arquivos.
